import crypto from 'crypto';
import { google } from 'googleapis';
import prisma from '../../config/db';
import env from '../../config/env';
import logger from '../../config/logger';

function encryptionKey() {
  if (!env.googleTokenEncryptionKey) throw new Error('Google token encryption key is not configured');
  const key = Buffer.from(env.googleTokenEncryptionKey, 'base64');
  if (key.length !== 32) throw new Error('Google token encryption key must decode to 32 bytes');
  return key;
}

export function encryptGoogleToken(token: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
}

export function decryptGoogleToken(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split('.');
  if (!ivValue || !tagValue || !encryptedValue) throw new Error('Stored Google token is invalid');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64')), decipher.final()]).toString('utf8');
}

export function createGoogleOAuthClient() {
  if (!env.googleClientId || !env.googleClientSecret || !env.googleRedirectUri) throw new Error('Google Calendar OAuth is not configured');
  return new google.auth.OAuth2(env.googleClientId, env.googleClientSecret, env.googleRedirectUri);
}

export async function syncAppointmentToCalendar(appointmentId: string) {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        calendarEvent: true,
        patient: { include: { user: { select: { id: true, email: true, googleRefreshTokenEncrypted: true, googleCalendarId: true } } } },
        doctor: { include: { user: { select: { id: true, email: true, googleRefreshTokenEncrypted: true, googleCalendarId: true } } } },
      },
    });
    if (!appointment?.calendarEvent || appointment.calendarEvent.syncStatus === 'SYNCED') return;
    const calendarOwner = appointment.doctor.user.googleRefreshTokenEncrypted ? appointment.doctor.user : appointment.patient.user.googleRefreshTokenEncrypted ? appointment.patient.user : null;
    if (!calendarOwner) {
      await prisma.calendarEvent.update({ where: { appointmentId }, data: { syncStatus: 'SKIPPED' } });
      return;
    }
    const oauth = createGoogleOAuthClient();
    oauth.setCredentials({ refresh_token: decryptGoogleToken(calendarOwner.googleRefreshTokenEncrypted!) });
    const calendar = google.calendar({ version: 'v3', auth: oauth });
    const event = await calendar.events.insert({
      calendarId: calendarOwner.googleCalendarId || 'primary',
      requestBody: {
        summary: `Appointment: Dr. ${appointment.doctor.fullName}`,
        description: `Patient: ${appointment.patient.fullName}\nSymptoms: ${appointment.symptoms}`,
        start: { dateTime: appointment.slotStart.toISOString() },
        end: { dateTime: appointment.slotEnd.toISOString() },
        attendees: [{ email: appointment.patient.user.email }, { email: appointment.doctor.user.email }],
      },
      sendUpdates: 'all',
    });
    await prisma.calendarEvent.update({ where: { appointmentId }, data: { googleEventId: event.data.id ?? appointment.calendarEvent.googleEventId, syncStatus: 'SYNCED', lastSyncedAt: new Date() } });
  } catch (error) {
    logger.error('Calendar appointment sync failed', { appointmentId, error: error instanceof Error ? { message: error.message, stack: error.stack } : error });
    await prisma.calendarEvent.update({ where: { appointmentId }, data: { syncStatus: 'FAILED' } }).catch(() => undefined);
  }
}

export async function removeAppointmentFromCalendar(appointmentId: string) {
  try {
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId }, include: { calendarEvent: true, doctor: { include: { user: true } }, patient: { include: { user: true } } } });
    if (!appointment?.calendarEvent || appointment.calendarEvent.syncStatus !== 'SYNCED') return;
    const calendarOwner = appointment.doctor.user.googleRefreshTokenEncrypted ? appointment.doctor.user : appointment.patient.user.googleRefreshTokenEncrypted ? appointment.patient.user : null;
    if (!calendarOwner) return;
    const oauth = createGoogleOAuthClient();
    oauth.setCredentials({ refresh_token: decryptGoogleToken(calendarOwner.googleRefreshTokenEncrypted!) });
    await google.calendar({ version: 'v3', auth: oauth }).events.delete({ calendarId: calendarOwner.googleCalendarId || 'primary', eventId: appointment.calendarEvent.googleEventId, sendUpdates: 'all' });
    await prisma.calendarEvent.update({ where: { appointmentId }, data: { syncStatus: 'SKIPPED', lastSyncedAt: new Date() } });
  } catch (error) {
    logger.error('Calendar appointment deletion failed', { appointmentId, error: error instanceof Error ? { message: error.message } : error });
  }
}

export async function updateAppointmentOnCalendar(appointmentId: string) {
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId }, include: { calendarEvent: true, doctor: { include: { user: true } }, patient: { include: { user: true } } } });
  if (!appointment?.calendarEvent || appointment.calendarEvent.googleEventId.startsWith('PENDING_')) return syncAppointmentToCalendar(appointmentId);
  const owner = appointment.doctor.user.googleRefreshTokenEncrypted ? appointment.doctor.user : appointment.patient.user.googleRefreshTokenEncrypted ? appointment.patient.user : null;
  if (!owner) return;
  try {
    const oauth = createGoogleOAuthClient();
    oauth.setCredentials({ refresh_token: decryptGoogleToken(owner.googleRefreshTokenEncrypted!) });
    await google.calendar({ version: 'v3', auth: oauth }).events.update({ calendarId: owner.googleCalendarId || 'primary', eventId: appointment.calendarEvent.googleEventId, sendUpdates: 'all', requestBody: { start: { dateTime: appointment.slotStart.toISOString() }, end: { dateTime: appointment.slotEnd.toISOString() } } });
    await prisma.calendarEvent.update({ where: { appointmentId }, data: { lastSyncedAt: new Date(), syncStatus: 'SYNCED' } });
  } catch (error) {
    await prisma.calendarEvent.update({ where: { appointmentId }, data: { syncStatus: 'FAILED' } }).catch(() => undefined);
    throw error;
  }
}

export default { syncAppointmentToCalendar, updateAppointmentOnCalendar, removeAppointmentFromCalendar };
