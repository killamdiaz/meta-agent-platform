import { Router } from 'express';
import crypto from 'crypto';
import { pool } from '../db.js';
import { config } from '../config.js';
import { validateLicenseKey } from '../middleware/license.js';
const router = Router();
function signLicense(customerId, expiresAt) {
    return crypto.createHmac('sha256', config.licenseSecret).update(`${customerId}:${expiresAt}`).digest('hex');
}
async function findLicenseByOrg(orgId, licenseKey) {
    if (licenseKey) {
        const byKey = await pool.query(`SELECT * FROM licenses WHERE license_key = $1 LIMIT 1`, [licenseKey]);
        if (byKey.rows[0])
            return byKey.rows[0];
    }
    const { rows } = await pool.query(`SELECT * FROM licenses WHERE customer_id = $1 ORDER BY issued_at DESC LIMIT 1`, [
        orgId,
    ]);
    return rows[0] ?? null;
}
router.get('/status', async (req, res, next) => {
    try {
        const orgId = req.headers['x-org-id'] || req.query.org_id || '';
        const licenseKey = req.headers['x-license-key'] || req.query.license_key || '';
        if (!orgId && !licenseKey) {
            res.status(400).json({ message: 'org_id or license_key is required' });
            return;
        }
        const license = await findLicenseByOrg(orgId, licenseKey);
        if (!license) {
            res.status(404).json({ message: 'No license found' });
            return;
        }
        const status = await validateLicenseKey(license.license_key, orgId || license.customer_id);
        res.json({
            license_id: license.id,
            customer_name: license.customer_name,
            customer_id: license.customer_id,
            expires_at: license.expires_at,
            max_seats: license.max_seats,
            max_tokens: license.max_tokens,
            license_key: license.license_key,
            ...status,
        });
    }
    catch (error) {
        next(error);
    }
});
router.post('/validate', async (req, res, next) => {
    try {
        const licenseKey = req.body?.license_key || req.headers['x-license-key'] || '';
        if (!licenseKey) {
            res.status(400).json({ message: 'license_key is required' });
            return;
        }
        const orgId = req.headers['x-org-id'] || req.query.org_id || '';
        const status = await validateLicenseKey(licenseKey, orgId);
        res.json(status);
    }
    catch (error) {
        next(error);
    }
});
router.post('/refresh', async (req, res, next) => {
    try {
        const licenseKey = req.body?.license_key || req.headers['x-license-key'] || '';
        if (!licenseKey) {
            res.status(400).json({ message: 'license_key is required' });
            return;
        }
        const orgId = req.headers['x-org-id'] || req.query.org_id || '';
        const status = await validateLicenseKey(licenseKey, orgId);
        res.json(status);
    }
    catch (error) {
        next(error);
    }
});
router.post('/apply', async (req, res, next) => {
    try {
        const licenseKey = req.body?.license_key || '';
        const orgId = req.body?.org_id || req.headers['x-org-id'] || '';
        const customerName = req.body?.customer_name || null;
        if (!licenseKey) {
            res.status(400).json({ message: 'license_key is required' });
            return;
        }
        const firstColon = licenseKey.indexOf(':');
        const lastColon = licenseKey.lastIndexOf(':');
        if (firstColon === -1 || lastColon === -1 || lastColon === firstColon) {
            res.status(400).json({ message: 'Invalid license key format' });
            return;
        }
        const keyCustomerId = licenseKey.slice(0, firstColon);
        const expiresAt = licenseKey.slice(firstColon + 1, lastColon);
        const signature = licenseKey.slice(lastColon + 1);
        const expected = signLicense(keyCustomerId, expiresAt);
        if (expected !== signature) {
            res.status(400).json({ message: 'Invalid license signature' });
            return;
        }
        const expiresDate = new Date(expiresAt);
        if (Number.isNaN(expiresDate.getTime())) {
            res.status(400).json({ message: 'Invalid expiry date' });
            return;
        }
        // Ensure schema accepts non-UUID customer IDs.
        try {
            await pool.query('ALTER TABLE licenses ALTER COLUMN customer_id TYPE TEXT USING customer_id::text');
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn('[license] customer_id alter skipped', msg);
        }
        // Preserve existing limits/names when not provided. If none exist, require explicit limits to avoid silent defaults.
        const existingByKey = await pool.query('SELECT * FROM licenses WHERE license_key = $1 LIMIT 1', [licenseKey]);
        const existingByCustomer = existingByKey.rows[0] ||
            (await pool.query('SELECT * FROM licenses WHERE customer_id = $1 ORDER BY issued_at DESC LIMIT 1', [keyCustomerId])).rows[0];
        const seatsVal = typeof req.body?.max_seats === 'number'
            ? req.body.max_seats
            : existingByCustomer?.max_seats;
        const tokensVal = typeof req.body?.max_tokens === 'number'
            ? req.body.max_tokens
            : existingByCustomer?.max_tokens;
        const nameVal = customerName ?? existingByCustomer?.customer_name ?? keyCustomerId;
        if (seatsVal == null || tokensVal == null) {
            return res.status(400).json({
                message: 'License apply requires max_seats and max_tokens when no existing license is found for this key/customer.',
            });
        }
        const { rows } = await pool.query(`INSERT INTO licenses (customer_name, customer_id, issued_at, expires_at, max_seats, max_tokens, license_key, active)
       VALUES (COALESCE($1, 'Unknown'), $2, NOW(), $3, $4, $5, $6, TRUE)
       ON CONFLICT (license_key) DO UPDATE
         SET customer_name = COALESCE(EXCLUDED.customer_name, licenses.customer_name),
             customer_id = EXCLUDED.customer_id,
             expires_at = EXCLUDED.expires_at,
             max_seats = COALESCE(EXCLUDED.max_seats, licenses.max_seats),
             max_tokens = COALESCE(EXCLUDED.max_tokens, licenses.max_tokens),
             active = TRUE
       RETURNING *`, [
            nameVal,
            keyCustomerId,
            expiresDate.toISOString(),
            seatsVal,
            tokensVal,
            licenseKey,
        ]);
        const status = await validateLicenseKey(rows[0].license_key, orgId || keyCustomerId);
        res.json(status);
    }
    catch (error) {
        next(error);
    }
});
export default router;
