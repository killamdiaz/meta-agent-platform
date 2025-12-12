import crypto from 'crypto';
import { pool } from '../db.js';
import { config } from '../config.js';
function hmacSignature(customerId, expiresAt) {
    const payload = `${customerId}:${expiresAt}`;
    return crypto.createHmac('sha256', config.licenseSecret).update(payload).digest('hex');
}
async function fetchLicense(licenseKey) {
    const { rows } = await pool.query('SELECT * FROM licenses WHERE license_key = $1 LIMIT 1', [licenseKey]);
    return rows[0] ?? null;
}
async function computeUsage(customerId) {
    // Seats: count distinct users seen in forge_token_usage for this customer_id (org)
    const seatResult = await pool.query(`SELECT COUNT(DISTINCT user_id) as seats
       FROM forge_token_usage
      WHERE org_id::text = $1`, [customerId]);
    const seats = Number(seatResult.rows[0]?.seats ?? 0);
    const tokenResult = await pool.query(`SELECT COALESCE(SUM(total_tokens),0) AS tokens
       FROM forge_token_usage
      WHERE org_id::text = $1`, [customerId]);
    const tokens = Number(tokenResult.rows[0]?.tokens ?? 0);
    return { seats, tokens };
}
export async function validateLicenseKey(licenseKey, usageOrgId) {
    const license = await fetchLicense(licenseKey);
    if (!license) {
        return { license: null, seats_used: 0, tokens_used: 0, valid: false, reason: 'License not found' };
    }
    if (!license.active) {
        return { license, seats_used: 0, tokens_used: 0, valid: false, reason: 'Inactive license' };
    }
    const expiresIso = new Date(license.expires_at).toISOString();
    const expectedSig = hmacSignature(license.customer_id, expiresIso);
    if (!license.license_key.endsWith(expectedSig)) {
        return { license, seats_used: 0, tokens_used: 0, valid: false, reason: 'Signature mismatch' };
    }
    const now = Date.now();
    const expires = new Date(license.expires_at).getTime();
    if (expires <= now) {
        return { license, seats_used: 0, tokens_used: 0, valid: false, reason: 'Expired license' };
    }
    const usageId = usageOrgId || license.customer_id;
    const { seats, tokens } = await computeUsage(usageId);
    if (seats > license.max_seats) {
        return { license, seats_used: seats, tokens_used: tokens, valid: false, reason: 'Seat limit exceeded' };
    }
    if (tokens >= license.max_tokens) {
        return { license, seats_used: seats, tokens_used: tokens, valid: false, reason: 'Token limit exceeded' };
    }
    return { license, seats_used: seats, tokens_used: tokens, valid: true };
}
function shouldBypass(path) {
    return (path.startsWith('/healthz') ||
        path.startsWith('/metrics') ||
        path.startsWith('/api/license') ||
        path.startsWith('/oauth/'));
}
export async function validateLicense(req, res, next) {
    if (shouldBypass(req.path)) {
        next();
        return;
    }
    let licenseKey = req.headers['x-license-key'] || req.query.license_key || '';
    // Fallback: fetch license by org if key not provided
    if (!licenseKey) {
        const orgId = req.headers['x-org-id'] || req.query.org_id || config.defaultOrgId;
        if (orgId) {
            const existing = await pool.query('SELECT license_key FROM licenses WHERE customer_id = $1 ORDER BY issued_at DESC LIMIT 1', [orgId]);
            licenseKey = existing.rows[0]?.license_key ?? '';
        }
    }
    // Final fallback: use explicitly configured license or any active license
    if (!licenseKey) {
        licenseKey = process.env.LICENSE_KEY || '';
    }
    if (!licenseKey) {
        const anyActive = await pool.query('SELECT license_key FROM licenses WHERE active = TRUE ORDER BY issued_at DESC LIMIT 1');
        licenseKey = anyActive.rows[0]?.license_key ?? '';
    }
    if (!licenseKey) {
        return res.status(403).json({ error: 'License invalid. Contact your admin.' });
    }
    try {
        const usageOrgId = req.headers['x-org-id'] || req.query.org_id || config.defaultOrgId;
        const status = await validateLicenseKey(licenseKey, usageOrgId);
        req.licenseStatus = status;
        if (!status.valid) {
            return res.status(403).json({ error: 'License invalid. Contact your admin.', reason: status.reason });
        }
        next();
    }
    catch (error) {
        console.error('[license] validation failed', error);
        res.status(403).json({ error: 'License invalid. Contact your admin.' });
    }
}
