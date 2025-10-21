import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface JwtPayload {
  sub?: string;
  agentId?: string;
  [key: string]: unknown;
}

export function requireJwt(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const requestId = req.context?.requestId ?? 'unknown';

  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    res.status(401).json({ error: 'Unauthorized', requestId, details: 'Missing bearer token' });
    return;
  }

  const token = header.slice(7).trim();

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
    const agentId = String(decoded.agentId ?? decoded.sub ?? '');
    req.user = {
      ...decoded,
      id: decoded.sub ? String(decoded.sub) : agentId || 'unknown',
      agentId: agentId || undefined,
    };
    if (agentId) {
      req.agentId = agentId;
    }
    next();
  } catch (error) {
    console.error({
      level: 'error',
      event: 'jwt.verification_failed',
      requestId,
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    });
    return res.status(401).json({ error: 'Unauthorized', requestId, details: 'Invalid token' });
  }
}
