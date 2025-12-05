import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

interface EncryptionConfig {
  secret: string;
  algorithm?: 'aes-256-gcm';
}

const DEFAULT_ALGORITHM = 'aes-256-gcm';
const AUTH_TAG_LENGTH = 16;

const deriveKey = (secret: string): Buffer =>
  createHash('sha256').update(secret, 'utf8').digest();

export const encrypt = (
  plaintext: string,
  config: EncryptionConfig,
): string => {
  const algorithm = config.algorithm ?? DEFAULT_ALGORITHM;
  const key = deriveKey(config.secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
};

export const decrypt = (
  payload: string,
  config: EncryptionConfig,
): string => {
  const algorithm = config.algorithm ?? DEFAULT_ALGORITHM;
  const key = deriveKey(config.secret);
  const buffer = Buffer.from(payload, 'base64');

  const iv = buffer.subarray(0, 12);
  const authTag = buffer.subarray(12, 12 + AUTH_TAG_LENGTH);
  const ciphertext = buffer.subarray(12 + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
};

export const hasEncryptionSecret = (): boolean =>
  typeof process.env.FORGE_VAULT_ENCRYPTION_KEY === 'string' &&
  process.env.FORGE_VAULT_ENCRYPTION_KEY.trim().length > 0;

export const getEncryptionConfig = (): EncryptionConfig | null => {
  const secret = process.env.FORGE_VAULT_ENCRYPTION_KEY;
  if (!secret || secret.trim().length === 0) {
    return null;
  }
  return { secret: secret.trim(), algorithm: DEFAULT_ALGORITHM };
};

