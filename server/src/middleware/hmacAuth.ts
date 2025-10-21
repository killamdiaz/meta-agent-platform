import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { verifySignature } from '../core/HMACVerifier.js';

const SIGNATURE_HEADER = 'x-bridge-signature';
const TIMESTAMP_HEADER = 'x-bridge-timestamp';

export function requireHmac(req: Request, res: Response, next: NextFunction) {
  const requestId = req.context?.requestId ?? 'unknown';
  const signature = (req.headers[SIGNATURE_HEADER] as string | undefined) ?? null;
  const timestamp = (req.headers[TIMESTAMP_HEADER] as string | undefined) ?? null;
  const rawBody = req.rawBody ?? JSON.stringify(req.body ?? {});

  const isValid = verifySignature({
    secret: config.bridgeHmacSecret,
    signature,
    timestamp,
    body: rawBody,
  });

  if (!isValid) {
    console.error({
      level: 'warn',
      event: 'hmac.verification_failed',
      requestId,
      signaturePresent: Boolean(signature),
    });
    res.status(403).json({ error: 'Forbidden', requestId, details: 'Invalid HMAC signature' });
    return;
  }

  const agentHeader = config.bridgeAgentHeader.toLowerCase();
  const agentIdFromHeader = (req.headers[agentHeader] as string | undefined)?.trim();
  if (agentIdFromHeader && !req.agentId) {
    req.agentId = agentIdFromHeader;
  }

  next();
}
