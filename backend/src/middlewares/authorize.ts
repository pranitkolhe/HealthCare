import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../shared/errors/AppError';

export function authorize(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user || !allowedRoles.includes(user.role)) {
      next(new ForbiddenError());
      return;
    }
    next();
  };
}
