import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import env from '../config/env';
import { UnauthenticatedError } from '../shared/errors/AppError';

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new UnauthenticatedError());
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, env.jwtAccessSecret as jwt.Secret) as { sub: string; role: string; email?: string };
    req.user = { id: payload.sub, role: payload.role, email: payload.email };
    next();
  } catch {
    next(new UnauthenticatedError());
  }
}
