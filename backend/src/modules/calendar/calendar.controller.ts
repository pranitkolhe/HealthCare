import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import env from '../../config/env';
import prisma from '../../config/db';
import logger from '../../config/logger';
import { createGoogleOAuthClient, encryptGoogleToken, syncAppointmentToCalendar } from '../integrations/calendar.service';
import { UnauthenticatedError } from '../../shared/errors/AppError';

export function connect(req: Request, res: Response, next: NextFunction) {
  try {
    const oauth = createGoogleOAuthClient();
    const state = jwt.sign({ sub: req.user!.id, role: req.user!.role, purpose: 'google-calendar' }, env.jwtAccessSecret, { expiresIn: '10m' });
    const url = oauth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: ['https://www.googleapis.com/auth/calendar.events'], state });
    res.status(200).json({ url });
  } catch (error) { next(error); }
}

export async function callback(req: Request, res: Response, next: NextFunction) {
  try {
    const state = String(req.query.state ?? '');
    const code = String(req.query.code ?? '');
    if (!state || !code) throw new UnauthenticatedError('Google Calendar callback is missing required data');
    const payload = jwt.verify(state, env.jwtAccessSecret) as { sub: string; role: string; purpose: string };
    if (payload.purpose !== 'google-calendar') throw new UnauthenticatedError('Invalid Google Calendar callback');
    const oauth = createGoogleOAuthClient();
    const { tokens } = await oauth.getToken(code);
    if (!tokens.refresh_token) throw new Error('Google did not return a refresh token. Disconnect the app in Google and connect again.');
    await prisma.user.update({ where: { id: payload.sub }, data: { googleRefreshTokenEncrypted: encryptGoogleToken(tokens.refresh_token), googleCalendarId: 'primary' } });
    const upcomingAppointments = await prisma.appointment.findMany({
      where: {
        status: 'BOOKED',
        slotStart: { gt: new Date() },
        OR: [{ patient: { userId: payload.sub } }, { doctor: { userId: payload.sub } }],
      },
      select: { id: true },
    });
    upcomingAppointments.forEach((appointment: { id: string }) => {
      void syncAppointmentToCalendar(appointment.id).catch((error) =>
        logger.error('Calendar appointment sync failed after OAuth connection', { appointmentId: appointment.id, error: error instanceof Error ? error.message : error })
      );
    });
    const destination = payload.role === 'DOCTOR' ? '/doctor' : '/patient';
    res.redirect(`${env.corsOrigin[0]}${destination}?calendar=connected`);
  } catch (error) { next(error); }
}

export async function disconnect(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.user.update({ where: { id: req.user!.id }, data: { googleRefreshTokenEncrypted: null, googleCalendarId: null } });
    res.status(204).send();
  } catch (error) { next(error); }
}
