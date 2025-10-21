import crypto from 'node:crypto';

export interface HMACVerificationParams {
  secret: string;
  signature: string | null;
  timestamp: string | null;
  body: string;
  toleranceSeconds?: number;
}

export const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

export function createSignature(secret: string, timestamp: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export function verifySignature({
  secret,
  signature,
  timestamp,
  body,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
}: HMACVerificationParams): boolean {
  if (!secret) {
    return false;
  }
  if (!signature || !timestamp) {
    return false;
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - ts) > toleranceSeconds) {
    return false;
  }

  const expected = createSignature(secret, String(ts), body);
  const provided = signature.trim();

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}
