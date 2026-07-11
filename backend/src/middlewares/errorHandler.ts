import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import logger from '../config/logger';
import env from '../config/env';
import { AppError } from '../shared/errors/AppError';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: { code: err.errorCode, message: err.message, details: err.details } });
    return;
  }

  if (err instanceof ZodError) {
    const details = err.flatten().fieldErrors;
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details } });
    return;
  }

  logger.error('Unhandled error', { error: err });
  if (env.nodeEnv === 'development' && err instanceof Error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: err.message,
        details: { name: err.name },
      },
    });
    return;
  }
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', details: {} } });
}
