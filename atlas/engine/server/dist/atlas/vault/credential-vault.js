import crypto from 'crypto';
import { pool } from '../../db.js';
import { config } from '../../config.js';
function deriveKey(salt) {
    const base = config.connectorVaultPepper;
    return crypto.pbkdf2Sync(base, salt, 150000, 32, 'sha512');
}
function encrypt(value) {
    const salt = crypto.randomBytes(16);
    const key = deriveKey(salt);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return { iv, authTag, salt, encryptedValue: encrypted };
}
function decrypt(payload) {
    const key = deriveKey(payload.salt);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, payload.iv);
    decipher.setAuthTag(payload.authTag);
    const decrypted = Buffer.concat([decipher.update(payload.encryptedValue), decipher.final()]);
    return decrypted.toString('utf8');
}
export class InMemoryCredentialVault {
    constructor() {
        this.store = new Map();
    }
    buildKey(tenantId, connectorId, key) {
        return `${tenantId}:${connectorId}:${key}`;
    }
    async saveSecret(tenantId, connectorId, key, value) {
        this.store.set(this.buildKey(tenantId, connectorId, key), encrypt(value));
    }
    async getSecret(tenantId, connectorId, key) {
        const payload = this.store.get(this.buildKey(tenantId, connectorId, key));
        if (!payload)
            return null;
        return decrypt(payload);
    }
    async deleteSecret(tenantId, connectorId, key) {
        this.store.delete(this.buildKey(tenantId, connectorId, key));
    }
}
export class PostgresCredentialVault {
    async saveSecret(tenantId, connectorId, key, value, expiresAt) {
        const encrypted = encrypt(value);
        await pool.query(`
      INSERT INTO atlas_connector_secrets (tenant_id, connector_id, secret_key, iv, auth_tag, salt, encrypted_value, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (tenant_id, connector_id, secret_key)
      DO UPDATE SET iv = EXCLUDED.iv,
                    auth_tag = EXCLUDED.auth_tag,
                    salt = EXCLUDED.salt,
                    encrypted_value = EXCLUDED.encrypted_value,
                    expires_at = EXCLUDED.expires_at,
                    updated_at = NOW();
    `, [tenantId, connectorId, key, encrypted.iv, encrypted.authTag, encrypted.salt, encrypted.encryptedValue, expiresAt]);
    }
    async getSecret(tenantId, connectorId, key) {
        const { rows } = await pool.query(`
      SELECT iv, auth_tag, salt, encrypted_value, expires_at
      FROM atlas_connector_secrets
      WHERE tenant_id = $1 AND connector_id = $2 AND secret_key = $3
    `, [tenantId, connectorId, key]);
        const row = rows[0];
        if (!row)
            return null;
        if (row.expires_at && new Date(row.expires_at) < new Date()) {
            return null;
        }
        return decrypt({
            iv: row.iv,
            authTag: row.auth_tag,
            salt: row.salt,
            encryptedValue: row.encrypted_value,
        });
    }
    async deleteSecret(tenantId, connectorId, key) {
        await pool.query('DELETE FROM atlas_connector_secrets WHERE tenant_id = $1 AND connector_id = $2 AND secret_key = $3', [
            tenantId,
            connectorId,
            key,
        ]);
    }
}
