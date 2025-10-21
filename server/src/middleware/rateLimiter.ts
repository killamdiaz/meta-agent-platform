import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

interface RateBucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;
const buckets = new Map<string, RateBucket>();

function resolveAgentId(req: Request): string | null {
  if (req.agentId) {
    return req.agentId;
  }
  const headerId = (req.headers[config.bridgeAgentHeader.toLowerCase()] as string | undefined)?.trim();
  if (headerId) {
    return headerId;
  }
  const userAgentId = (req.user?.agentId as string | undefined)?.trim();
  return userAgentId ?? null;
}

export function perAgentRateLimiter(limit = config.rateLimitPerMinute) {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = req.context?.requestId ?? 'unknown';
    const agentId = resolveAgentId(req);

    if (!agentId) {
      res.status(400).json({ error: 'Bad Request', requestId, details: 'Missing agent identifier' });
      return;
    }

    req.agentId = agentId;

    const now = Date.now();
    const existing = buckets.get(agentId);
    if (!existing || existing.resetAt <= now) {
      buckets.set(agentId, { count: 1, resetAt: now + WINDOW_MS });
      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Remaining', String(limit - 1));
      res.setHeader('X-RateLimit-Reset', String(Math.floor((now + WINDOW_MS) / 1000)));
      next();
      return;
    }

    if (existing.count >= limit) {
      res.setHeader('Retry-After', String(Math.max(0, Math.ceil((existing.resetAt - now) / 1000))));
      res.status(429).json({ error: 'Too Many Requests', requestId, details: 'Rate limit exceeded' });
      return;
    }

    existing.count += 1;
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - existing.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.floor(existing.resetAt / 1000)));
    next();
  };
}
