import type { Request, Response, NextFunction } from 'express';

interface HttpError extends Error {
  status?: number;
}

export function apiErrorHandler(err: HttpError, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    return next(err);
  }

  const status = typeof err.status === 'number' ? err.status : 500;
  const requestId = req.context?.requestId ?? 'unknown';

  console.error('API Error:', {
    requestId,
    status,
    message: err.message,
    stack: err.stack,
  });

  return res.status(status).json({
    success: false,
    message: err.message ?? 'Internal Server Error',
    requestId,
  });
}
