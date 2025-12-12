import express from 'express';
import { discoverSaml, fetchIdpMetadata, generateServiceProviderMetadata, getSamlConfig, handleAcs, handleIdpInitiated, handleLogout, getOrgDomains, parseAuthToken, startSamlLogin, upsertSamlConfig, verifySessionToken, replaceOrgDomains, } from '../services/SamlService.js';
import { config } from '../config.js';
const router = express.Router();
router.get('/.well-known/saml/metadata/:orgId', async (req, res, next) => {
    try {
        const xml = await generateServiceProviderMetadata(req.params.orgId);
        res.type('application/xml').send(xml);
    }
    catch (error) {
        next(error);
    }
});
router.get('/auth/saml/config/:orgId', async (req, res, next) => {
    try {
        const configRow = await getSamlConfig(req.params.orgId);
        if (!configRow) {
            res.status(404).json({ message: 'No SAML configuration found' });
            return;
        }
        const domains = await getOrgDomains(req.params.orgId);
        res.json({ ...configRow, domains });
    }
    catch (error) {
        next(error);
    }
});
router.put('/auth/saml/config/:orgId', async (req, res, next) => {
    try {
        const orgId = req.params.orgId;
        let updates = req.body || {};
        const domains = Array.isArray(req.body?.domains) ? req.body.domains : null;
        if (updates.idp_metadata_url) {
            try {
                const metadata = await fetchIdpMetadata(updates.idp_metadata_url);
                updates = { ...metadata, ...updates };
            }
            catch (error) {
                console.warn('[saml] failed to hydrate IdP metadata', error);
            }
        }
        const saved = await upsertSamlConfig(orgId, updates);
        if (domains) {
            await replaceOrgDomains(orgId, domains);
        }
        res.json(domains ? { ...saved, domains } : saved);
    }
    catch (error) {
        next(error);
    }
});
router.get('/auth/saml/discover', async (req, res, next) => {
    try {
        const email = typeof req.query.email === 'string' ? req.query.email : null;
        if (!email) {
            res.status(400).json({ message: 'email query param required' });
            return;
        }
        const result = await discoverSaml(email);
        res.json(result);
    }
    catch (error) {
        next(error);
    }
});
router.post('/auth/saml/login', async (req, res, next) => {
    try {
        const acceptJson = (req.headers.accept || '').includes('json') || req.body?.returnJson;
        const payload = req.body || {};
        const orgIdFromQuery = typeof req.query.org_id === 'string' ? req.query.org_id : undefined;
        const redirectFromQuery = typeof req.query.redirect === 'string' ? req.query.redirect : undefined;
        const emailFromQuery = typeof req.query.email === 'string' ? req.query.email : undefined;
        const { redirectUrl, orgId } = await startSamlLogin({
            orgId: payload.org_id || payload.orgId || orgIdFromQuery,
            email: payload.email || emailFromQuery,
            relayState: payload.redirect || payload.relayState || redirectFromQuery,
            host: req.headers.host,
        });
        if (acceptJson) {
            res.json({ redirectUrl, orgId });
        }
        else {
            res.redirect(302, redirectUrl);
        }
    }
    catch (error) {
        next(error);
    }
});
router.post('/auth/saml/acs', async (req, res, next) => {
    try {
        const { SAMLResponse, RelayState, org_id } = req.body || {};
        const result = await handleAcs({ SAMLResponse, RelayState, orgId: org_id });
        if (result.loggedOut) {
            res.status(200).send('Logged out');
            return;
        }
        const secure = (config.appBaseUrl || '').startsWith('https');
        const appBase = (config.appBaseUrl || '').replace(/\/$/, '') || 'http://localhost:3000';
        const defaultRedirect = config.samlDefaultRedirect || `${appBase}/`;
        const safeRedirect = (() => {
            if (result.relayState) {
                try {
                    const target = new URL(result.relayState);
                    const base = new URL(appBase);
                    if (target.origin === base.origin) {
                        return `${target.pathname}${target.search}${target.hash}` || `${base.origin}/`;
                    }
                }
                catch {
                    // ignore parse errors
                }
            }
            return defaultRedirect;
        })();
        res.cookie('atlas_sso', result.token, {
            httpOnly: true,
            sameSite: 'lax',
            secure,
            path: '/',
            maxAge: 1000 * 60 * 60 * (config.samlJwtExpiryHours || 12),
        });
        if ((req.headers.accept || '').includes('json')) {
            res.json({ redirectUrl: safeRedirect, user: result.user, orgId: result.orgId });
        }
        else {
            res.redirect(302, safeRedirect);
        }
    }
    catch (error) {
        next(error);
    }
});
router.post('/auth/saml/idp-init', async (req, res, next) => {
    try {
        const { SAMLResponse, RelayState } = req.body || {};
        const result = await handleIdpInitiated({ SAMLResponse, RelayState });
        if ('loggedOut' in result && result.loggedOut) {
            res.status(200).send('Logged out');
            return;
        }
        const secure = (config.appBaseUrl || '').startsWith('https');
        const appBase = (config.appBaseUrl || '').replace(/\/$/, '') || 'http://localhost:3000';
        const defaultRedirect = config.samlDefaultRedirect || `${appBase}/`;
        const safeRedirect = (() => {
            if (result.relayState) {
                try {
                    const target = new URL(result.relayState);
                    const base = new URL(appBase);
                    if (target.origin === base.origin) {
                        return `${target.pathname}${target.search}${target.hash}` || `${base.origin}/`;
                    }
                }
                catch {
                    // ignore parse errors
                }
            }
            return defaultRedirect;
        })();
        res.cookie('atlas_sso', result.token, {
            httpOnly: true,
            sameSite: 'lax',
            secure,
            path: '/',
            maxAge: 1000 * 60 * 60 * (config.samlJwtExpiryHours || 12),
        });
        if ((req.headers.accept || '').includes('json')) {
            res.json({ redirectUrl: safeRedirect, user: result.user, orgId: result.orgId });
        }
        else {
            res.redirect(302, safeRedirect);
        }
    }
    catch (error) {
        next(error);
    }
});
router.post('/auth/saml/logout', async (req, res, next) => {
    try {
        res.clearCookie('atlas_sso', { path: '/' });
        await handleLogout(null, null);
        res.status(204).end();
    }
    catch (error) {
        next(error);
    }
});
router.post('/auth/saml/slo', async (req, res, next) => {
    try {
        res.status(200).json({ status: 'ok' });
    }
    catch (error) {
        next(error);
    }
});
router.get('/auth/saml/session', (req, res) => {
    const token = parseAuthToken(req.headers.authorization, req.headers.cookie);
    const payload = verifySessionToken(token);
    if (!payload) {
        res.status(401).json({ message: 'Not authenticated' });
        return;
    }
    res.json({
        user: {
            id: payload.sub,
            email: payload.email,
            org_id: payload.orgId,
            role: payload.role,
            provider: 'saml',
            first_name: payload.firstName,
            last_name: payload.lastName,
            user_metadata: { org_id: payload.orgId, role: payload.role },
            app_metadata: { provider: 'saml' },
        },
        token,
    });
});
export default router;
