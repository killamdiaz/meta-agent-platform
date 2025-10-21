import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const requestId = (req.header('x-request-id') ?? '').trim() || randomUUID();
  const startedAt = Date.now();

  req.context = { requestId, startedAt };
  res.setHeader('X-Request-Id', requestId);

  const originalEnd = res.end.bind(res);
  let ended = false;

  (res.end as unknown) = function endProxy(...args: Parameters<Response['end']>) {
    if (!ended) {
      ended = true;
      const latency = Date.now() - startedAt;
      res.setHeader('X-Response-Time', `${latency}ms`);
      const agentId = req.agentId ?? (req.user?.agentId as string | undefined) ?? null;
      console.log({
        level: 'info',
        event: 'request.completed',
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        latencyMs: latency,
        agentId,
      });
    }
    return originalEnd(...(args as Parameters<Response['end']>));
  };

  next();
}
