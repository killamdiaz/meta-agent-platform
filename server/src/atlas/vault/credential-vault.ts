import crypto from 'crypto';
import { pool } from '../../db.js';
import { config } from '../../config.js';

export interface CredentialVault {
  saveSecret(tenantId: string, connectorId: string, key: string, value: string, expiresAt?: Date): Promise<void>;
  getSecret(tenantId: string, connectorId: string, key: string): Promise<string | null>;
  deleteSecret(tenantId: string, connectorId: string, key: string): Promise<void>;
}

interface EncryptedPayload {
  iv: Buffer;
  authTag: Buffer;
  salt: Buffer;
  encryptedValue: Buffer;
}

function deriveKey(salt: Buffer) {
  const base = config.connectorVaultPepper;
  return crypto.pbkdf2Sync(base, salt, 150000, 32, 'sha512');
}

function encrypt(value: string): EncryptedPayload {
  const salt = crypto.randomBytes(16);
  const key = deriveKey(salt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { iv, authTag, salt, encryptedValue: encrypted };
}

function decrypt(payload: EncryptedPayload) {
  const key = deriveKey(payload.salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, payload.iv);
  decipher.setAuthTag(payload.authTag);
  const decrypted = Buffer.concat([decipher.update(payload.encryptedValue), decipher.final()]);
  return decrypted.toString('utf8');
}

export class InMemoryCredentialVault implements CredentialVault {
  private store = new Map<string, EncryptedPayload>();

  private buildKey(tenantId: string, connectorId: string, key: string) {
    return `${tenantId}:${connectorId}:${key}`;
  }

  async saveSecret(tenantId: string, connectorId: string, key: string, value: string) {
    this.store.set(this.buildKey(tenantId, connectorId, key), encrypt(value));
  }

  async getSecret(tenantId: string, connectorId: string, key: string) {
    const payload = this.store.get(this.buildKey(tenantId, connectorId, key));
    if (!payload) return null;
    return decrypt(payload);
  }

  async deleteSecret(tenantId: string, connectorId: string, key: string) {
    this.store.delete(this.buildKey(tenantId, connectorId, key));
  }
}

export class PostgresCredentialVault implements CredentialVault {
  async saveSecret(tenantId: string, connectorId: string, key: string, value: string, expiresAt?: Date) {
    const encrypted = encrypt(value);
    await pool.query(
      `
      INSERT INTO atlas_connector_secrets (tenant_id, connector_id, secret_key, iv, auth_tag, salt, encrypted_value, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (tenant_id, connector_id, secret_key)
      DO UPDATE SET iv = EXCLUDED.iv,
                    auth_tag = EXCLUDED.auth_tag,
                    salt = EXCLUDED.salt,
                    encrypted_value = EXCLUDED.encrypted_value,
                    expires_at = EXCLUDED.expires_at,
                    updated_at = NOW();
    `,
      [tenantId, connectorId, key, encrypted.iv, encrypted.authTag, encrypted.salt, encrypted.encryptedValue, expiresAt],
    );
  }

  async getSecret(tenantId: string, connectorId: string, key: string) {
    const { rows } = await pool.query(
      `
      SELECT iv, auth_tag, salt, encrypted_value, expires_at
      FROM atlas_connector_secrets
      WHERE tenant_id = $1 AND connector_id = $2 AND secret_key = $3
    `,
      [tenantId, connectorId, key],
    );
    const row = rows[0];
    if (!row) return null;
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

  async deleteSecret(tenantId: string, connectorId: string, key: string) {
    await pool.query('DELETE FROM atlas_connector_secrets WHERE tenant_id = $1 AND connector_id = $2 AND secret_key = $3', [
      tenantId,
      connectorId,
      key,
    ]);
  }
}

