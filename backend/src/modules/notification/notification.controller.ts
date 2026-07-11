import type { NextFunction, Request, Response } from 'express';
import { listMyNotifications } from './notification.service';

export async function listMine(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await listMyNotifications(req.user!.id));
  } catch (error) {
    next(error);
  }
}
