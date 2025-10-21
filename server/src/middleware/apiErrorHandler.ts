import type { Request, Response, NextFunction } from 'express';

interface HttpError extends Error {
  status?: number;
  details?: unknown;
}

export function apiErrorHandler(err: HttpError, req: Request, res: Response, _next: NextFunction) {
  const status = typeof err.status === 'number' ? err.status : 500;
  const requestId = req.context?.requestId ?? 'unknown';
  const agentId = req.agentId ?? (req.user?.agentId as string | undefined) ?? null;
  const message = status >= 500 ? 'Internal Server Error' : err.message;

  console.error({
    level: 'error',
    event: 'api.error',
    requestId,
    status,
    agentId,
    endpoint: req.originalUrl,
    method: req.method,
    latencyMs: Date.now() - (req.context?.startedAt ?? Date.now()),
    error: {
      message: err.message,
      stack: err.stack,
      details: err.details ?? null,
    },
  });

  res.status(status).json({
    error: message,
    requestId,
    details: err.message,
  });
}
