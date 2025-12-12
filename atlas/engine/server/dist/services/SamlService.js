import { SAML, ValidateInResponseTo } from '@node-saml/node-saml';
import fetch from 'node-fetch';
import { XMLParser } from 'fast-xml-parser';
import jwt from 'jsonwebtoken';
import { pool, withTransaction } from '../db.js';
import { config } from '../config.js';
const parser = new XMLParser({ ignoreAttributes: false });
const publicApiBase = process.env.PUBLIC_API_BASE_URL ||
    config.samlSpAcsBaseUrl ||
    `http://localhost:${config.port}`;
const fallbackAcs = config.samlSpAcsBaseUrl || `${publicApiBase}/auth/saml/acs`;
const fallbackMetadataUrl = config.samlSpMetadataBaseUrl || `${publicApiBase}/.well-known/saml/metadata`;
function normalizeEmail(email) {
    return (email || '').trim().toLowerCase();
}
function normalizeRedirect(relayState) {
    const defaultRedirect = config.samlDefaultRedirect || `${config.appBaseUrl || '/'}/`;
    if (!relayState)
        return defaultRedirect;
    try {
        if (relayState.startsWith('/')) {
            return relayState;
        }
        const target = new URL(relayState, config.appBaseUrl || defaultRedirect);
        const allowedHost = new URL(config.appBaseUrl || defaultRedirect);
        if (target.origin === allowedHost.origin) {
            return `${target.pathname}${target.search}${target.hash}`;
        }
    }
    catch (error) {
        console.warn('[saml] invalid relay state, using default', error);
    }
    return defaultRedirect;
}
async function ensureOrg(orgId, name) {
    await pool.query(`INSERT INTO orgs (id, name)
     VALUES ($1, $2)
     ON CONFLICT (id) DO NOTHING`, [orgId, name || 'SAML Org']);
}
async function logAudit(orgId, email, event, details = {}) {
    try {
        await pool.query(`INSERT INTO saml_audit_logs (org_id, user_email, event_type, details)
       VALUES ($1, $2, $3, $4)`, [orgId, email, event, JSON.stringify(details)]);
    }
    catch (error) {
        console.warn('[saml] failed to write audit log', error);
    }
}
export async function fetchIdpMetadata(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch IdP metadata (${response.status})`);
    }
    const xml = await response.text();
    const parsed = parser.parse(xml);
    const entity = parsed.EntityDescriptor || parsed['md:EntityDescriptor'];
    const idp = entity?.IDPSSODescriptor || entity?.['md:IDPSSODescriptor'];
    const singleSignOnService = Array.isArray(idp?.SingleSignOnService)
        ? idp.SingleSignOnService[0]
        : idp?.SingleSignOnService || idp?.['md:SingleSignOnService'];
    const keyDescriptor = Array.isArray(idp?.KeyDescriptor) ? idp.KeyDescriptor[0] : idp?.KeyDescriptor;
    const keyInfo = keyDescriptor?.KeyInfo || keyDescriptor?.['ds:KeyInfo'] || keyDescriptor?.['md:KeyInfo'];
    const x509Data = Array.isArray(keyInfo?.X509Data) ? keyInfo.X509Data[0] : keyInfo?.X509Data;
    const certNode = Array.isArray(x509Data?.X509Certificate)
        ? x509Data.X509Certificate[0]
        : x509Data?.X509Certificate;
    const certificate = typeof certNode === 'string'
        ? certNode
        : certNode && typeof certNode._text === 'string'
            ? certNode._text
            : certNode && typeof certNode['#text'] === 'string'
                ? certNode['#text']
                : null;
    return {
        idp_entity_id: entity?.['@_entityID'] || entity?.['@_EntityID'] || null,
        idp_sso_url: singleSignOnService?.['@_Location'] || singleSignOnService?.['@_location'] || null,
        idp_certificate: certificate,
    };
}
function buildSamlOptions(record) {
    const issuer = record.sp_entity_id || config.samlSpEntityId;
    const callbackUrl = record.sp_acs_url || fallbackAcs;
    if (!record.idp_certificate) {
        throw new Error('IdP certificate is required to build SAML configuration');
    }
    const base = {
        issuer,
        callbackUrl,
        entryPoint: record.idp_sso_url || undefined,
        idpCert: record.idp_certificate,
        audience: issuer,
        privateKey: config.samlSpPrivateKey || undefined,
        decryptionPvk: config.samlSpPrivateKey || undefined,
        wantAuthnResponseSigned: true,
        wantAssertionsSigned: true,
        signatureAlgorithm: 'sha256',
        digestAlgorithm: 'sha256',
        identifierFormat: null,
        disableRequestedAuthnContext: true,
        // Accept IdP-initiated responses and avoid cache-miss failures during local testing
        validateInResponseTo: ValidateInResponseTo.never,
        requestIdExpirationPeriodMs: 5 * 60 * 1000,
        acceptedClockSkewMs: 60 * 1000,
    };
    return base;
}
function buildSamlInstance(record) {
    return new SAML(buildSamlOptions(record));
}
async function resolveOrgByDomain(email) {
    if (!email || !email.includes('@'))
        return null;
    const domain = email.split('@')[1].toLowerCase();
    const result = await pool.query(`SELECT org_id FROM org_domains WHERE domain = $1`, [domain]);
    if (result.rows.length > 1) {
        throw new Error(`Multiple orgs configured for domain ${domain}`);
    }
    return result.rows[0]?.org_id ?? null;
}
export async function getOrgDomains(orgId) {
    const result = await pool.query(`SELECT domain FROM org_domains WHERE org_id = $1 ORDER BY domain`, [orgId]);
    return result.rows.map((row) => row.domain);
}
export async function replaceOrgDomains(orgId, domains) {
    const unique = Array.from(new Set(domains.map((d) => d.trim().toLowerCase()).filter(Boolean)));
    await ensureOrg(orgId);
    await withTransaction(async (client) => {
        await client.query(`DELETE FROM org_domains WHERE org_id = $1`, [orgId]);
        for (const domain of unique) {
            await client.query(`INSERT INTO org_domains (org_id, domain) VALUES ($1, $2)
         ON CONFLICT (org_id, domain) DO NOTHING`, [orgId, domain]);
        }
    });
    return unique;
}
export async function getSamlConfig(orgId) {
    const result = await pool.query(`SELECT * FROM saml_configs WHERE org_id = $1 LIMIT 1`, [orgId]);
    return result.rows[0] || null;
}
export async function getSamlConfigByIssuer(issuer) {
    const result = await pool.query(`SELECT * FROM saml_configs WHERE idp_entity_id = $1 LIMIT 1`, [issuer]);
    return result.rows[0] || null;
}
export async function upsertSamlConfig(orgId, updates) {
    const now = new Date().toISOString();
    await ensureOrg(orgId);
    const existing = await getSamlConfig(orgId);
    if (!existing) {
        const insert = await pool.query(`INSERT INTO saml_configs (org_id, idp_metadata_url, idp_entity_id, idp_sso_url, idp_certificate, sp_entity_id, sp_acs_url, sp_metadata_url, enforce_sso, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`, [
            orgId,
            updates.idp_metadata_url ?? null,
            updates.idp_entity_id ?? null,
            updates.idp_sso_url ?? null,
            updates.idp_certificate ?? null,
            updates.sp_entity_id ?? config.samlSpEntityId,
            updates.sp_acs_url ?? fallbackAcs,
            updates.sp_metadata_url ?? fallbackMetadataUrl,
            updates.enforce_sso ?? false,
            now,
            now,
        ]);
        return insert.rows[0];
    }
    const result = await pool.query(`UPDATE saml_configs
     SET idp_metadata_url = COALESCE($2, idp_metadata_url),
         idp_entity_id = COALESCE($3, idp_entity_id),
         idp_sso_url = COALESCE($4, idp_sso_url),
         idp_certificate = COALESCE($5, idp_certificate),
         sp_entity_id = COALESCE($6, sp_entity_id),
         sp_acs_url = COALESCE($7, sp_acs_url),
         sp_metadata_url = COALESCE($8, sp_metadata_url),
         enforce_sso = COALESCE($9, enforce_sso),
         updated_at = $10
     WHERE org_id = $1
     RETURNING *`, [
        orgId,
        updates.idp_metadata_url ?? null,
        updates.idp_entity_id ?? null,
        updates.idp_sso_url ?? null,
        updates.idp_certificate ?? null,
        updates.sp_entity_id ?? null,
        updates.sp_acs_url ?? null,
        updates.sp_metadata_url ?? null,
        updates.enforce_sso ?? null,
        now,
    ]);
    return result.rows[0];
}
function mapProfile(profile) {
    const attributes = profile.attributes;
    const emailCandidate = profile.email ||
        profile.mail ||
        profile['urn:oid:0.9.2342.19200300.100.1.3'] ||
        attributes?.['email'] ||
        attributes?.['mail'] ||
        attributes?.['Email'] ||
        profile.nameID;
    const firstName = attributes?.['firstName'] ||
        attributes?.['givenName'] ||
        attributes?.['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'] ||
        profile['givenName'];
    const lastName = attributes?.['lastName'] ||
        attributes?.['surname'] ||
        attributes?.['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'] ||
        profile['surname'];
    const rolesRaw = attributes?.['roles'] ||
        attributes?.['Role'] ||
        attributes?.['groups'] ||
        [];
    const roles = Array.isArray(rolesRaw) ? rolesRaw : typeof rolesRaw === 'string' ? rolesRaw.split(',') : [];
    return {
        email: normalizeEmail(typeof emailCandidate === 'string' ? emailCandidate : Array.isArray(emailCandidate) ? emailCandidate[0] : ''),
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        roles,
        nameId: profile.nameID,
        sessionIndex: profile.sessionIndex,
        issuer: profile.issuer,
    };
}
async function upsertUser(orgId, profile) {
    const email = normalizeEmail(profile.email);
    const now = new Date().toISOString();
    const role = profile.roles[0] || 'member';
    const user = await withTransaction(async (client) => {
        const existing = await client.query(`SELECT * FROM users WHERE email = $1 AND (org_id IS NULL OR org_id = $2) LIMIT 1`, [email, orgId]);
        if (existing.rows[0]) {
            const current = existing.rows[0];
            const updated = await client.query(`UPDATE users
         SET org_id = COALESCE(org_id, $2),
             first_name = COALESCE($3, first_name),
             last_name = COALESCE($4, last_name),
             role = COALESCE($5, role),
             auth_provider = 'saml',
             last_login_at = $6,
             updated_at = $6
         WHERE id = $1
         RETURNING *`, [current.id, orgId, profile.firstName ?? null, profile.lastName ?? null, role, now]);
            return updated.rows[0];
        }
        const inserted = await client.query(`INSERT INTO users (email, org_id, first_name, last_name, role, auth_provider, created_at, updated_at, last_login_at)
       VALUES ($1,$2,$3,$4,$5,'saml',$6,$6,$6)
       RETURNING *`, [email, orgId, profile.firstName ?? null, profile.lastName ?? null, role, now]);
        return inserted.rows[0];
    });
    return user;
}
function issueJwt(user, orgId) {
    const payload = {
        sub: user.id,
        email: user.email,
        orgId,
        role: user.role || 'member',
        firstName: user.first_name,
        lastName: user.last_name,
        provider: 'saml',
    };
    return jwt.sign(payload, config.samlJwtSecret, {
        expiresIn: `${config.samlJwtExpiryHours || 12}h`,
        issuer: config.samlSpEntityId,
        audience: config.appBaseUrl || orgId,
    });
}
async function recordSession(orgId, userId, profile, relayState) {
    await pool.query(`INSERT INTO saml_sessions (org_id, user_id, name_id, session_index, relay_state, created_at)
     VALUES ($1,$2,$3,$4,$5,NOW())`, [orgId, userId, profile.nameId ?? null, profile.sessionIndex ?? null, relayState ?? null]);
}
export async function generateServiceProviderMetadata(orgId) {
    const configRow = (await getSamlConfig(orgId)) ||
        (await upsertSamlConfig(orgId, { sp_acs_url: fallbackAcs, sp_metadata_url: fallbackMetadataUrl }));
    const saml = buildSamlInstance(configRow);
    return saml.generateServiceProviderMetadata(config.samlSpCertificate || null, config.samlSpCertificate || null);
}
export async function startSamlLogin(options) {
    const orgId = options.orgId || (await resolveOrgByDomain(options.email)) || config.defaultOrgId;
    if (!orgId) {
        throw new Error('Unable to resolve org for SAML login');
    }
    const configRow = await getSamlConfig(orgId);
    if (!configRow) {
        throw new Error('SAML is not configured for this org');
    }
    const saml = buildSamlInstance(configRow);
    const relay = normalizeRedirect(options.relayState);
    const redirectUrl = await saml.getAuthorizeUrlAsync(relay, options.host, {});
    await logAudit(orgId, options.email ?? null, 'login_initiated', { relayState: relay });
    return { redirectUrl, orgId };
}
export async function handleAcs(params) {
    if (!params.SAMLResponse) {
        throw new Error('SAMLResponse missing');
    }
    const relayState = params.RelayState ?? null;
    const decoded = Buffer.from(params.SAMLResponse, 'base64').toString('utf8');
    const issuerMatch = decoded.match(/<Issuer[^>]*>([^<]+)<\/Issuer>/);
    const issuer = issuerMatch?.[1] ?? null;
    let configRow = (params.orgId && (await getSamlConfig(params.orgId))) ||
        (issuer ? await getSamlConfigByIssuer(issuer) : null);
    if (!configRow) {
        const fallback = await pool.query(`SELECT * FROM saml_configs LIMIT 2`);
        if (fallback.rows.length === 1) {
            configRow = fallback.rows[0];
            console.warn('[saml] issuer lookup failed, using single configured org as fallback');
        }
        else {
            throw new Error('No SAML configuration found for assertion');
        }
    }
    const saml = buildSamlInstance(configRow);
    const { profile, loggedOut } = await saml.validatePostResponseAsync({
        SAMLResponse: params.SAMLResponse,
        RelayState: relayState || '',
    });
    if (loggedOut) {
        return { loggedOut: true };
    }
    if (!profile) {
        throw new Error('Empty SAML profile');
    }
    const normalized = mapProfile(profile);
    if (!normalized.email) {
        throw new Error('Email attribute missing in SAML assertion');
    }
    if (configRow.idp_entity_id && normalized.issuer && normalized.issuer !== configRow.idp_entity_id) {
        throw new Error('Issuer mismatch for SAML response');
    }
    const user = await upsertUser(configRow.org_id, normalized);
    const token = issueJwt(user, configRow.org_id);
    await recordSession(configRow.org_id, user.id, normalized, relayState);
    await logAudit(configRow.org_id, normalized.email, 'login_success', {
        issuer: normalized.issuer ?? profile.issuer,
        sessionIndex: normalized.sessionIndex,
    });
    return {
        user,
        orgId: configRow.org_id,
        token,
        relayState: normalizeRedirect(relayState),
        profile: normalized,
    };
}
export async function handleIdpInitiated(params) {
    return handleAcs(params);
}
export async function handleLogout(orgId, email) {
    if (email) {
        await logAudit(orgId ?? null, email, 'logout', {});
    }
    return true;
}
export async function discoverSaml(email) {
    const orgId = await resolveOrgByDomain(email);
    if (!orgId) {
        return { enabled: false };
    }
    const cfg = await getSamlConfig(orgId);
    if (!cfg) {
        return { enabled: false };
    }
    return {
        enabled: true,
        orgId,
        enforceSso: cfg.enforce_sso,
        idpEntityId: cfg.idp_entity_id,
        idpSsoUrl: cfg.idp_sso_url,
        spEntityId: cfg.sp_entity_id || config.samlSpEntityId,
        acsUrl: cfg.sp_acs_url || fallbackAcs,
        metadataUrl: cfg.sp_metadata_url || fallbackMetadataUrl,
    };
}
export function parseAuthToken(authorization, cookieHeader) {
    if (authorization?.toLowerCase().startsWith('bearer ')) {
        return authorization.slice(7);
    }
    if (cookieHeader) {
        const parts = cookieHeader.split(';').map((c) => c.trim());
        for (const part of parts) {
            if (part.startsWith('atlas_sso=')) {
                return decodeURIComponent(part.replace('atlas_sso=', ''));
            }
        }
    }
    return null;
}
export function verifySessionToken(token) {
    if (!token)
        return null;
    try {
        return jwt.verify(token, config.samlJwtSecret);
    }
    catch (error) {
        return null;
    }
}
