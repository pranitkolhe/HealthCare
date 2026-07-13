import prisma from '../../config/db';
import { deliverNotification } from './notification.service';

function nextReminderTime(frequency: string, now: Date) {
  const normalized = frequency.toLowerCase();
  const intervalHours = normalized.includes('three') ? 8 : normalized.includes('twice') ? 12 : Number(normalized.match(/every\s+(\d+)\s*hour/)?.[1] ?? 24);
  return new Date(now.getTime() + intervalHours * 60 * 60 * 1000);
}

/** Creates one appointment reminder about 24 hours before a booked visit and
 * delivers due medication reminders. Safe to run repeatedly. */
export async function scanDueReminders(now = new Date()) {
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const appointments = await prisma.appointment.findMany({ where: { status: 'BOOKED', slotStart: { gte: windowStart, lte: windowEnd } }, select: { id: true, patient: { select: { userId: true } }, doctor: { select: { userId: true } } } });
  const notificationIds: string[] = [];
  for (const appointment of appointments) {
    for (const userId of [appointment.patient.userId, appointment.doctor.userId]) {
      const existing = await prisma.notification.findFirst({ where: { appointmentId: appointment.id, userId, type: 'REMINDER' } });
      if (!existing) notificationIds.push((await prisma.notification.create({ data: { appointmentId: appointment.id, userId, type: 'REMINDER', channel: 'EMAIL' } })).id);
    }
  }
  const medications = await prisma.medicationReminder.findMany({ where: { status: 'ACTIVE', nextSendAt: { lte: now }, endDate: { gte: now } }, include: { appointment: { select: { patient: { select: { userId: true } } } } } });
  for (const medication of medications) {
    notificationIds.push((await prisma.notification.create({ data: { appointmentId: medication.appointmentId, userId: medication.appointment.patient.userId, type: 'MEDICATION_REMINDER', channel: 'EMAIL' } })).id);
    await prisma.medicationReminder.update({ where: { id: medication.id }, data: { nextSendAt: nextReminderTime(medication.frequency, now) } });
  }
  await Promise.all(notificationIds.map((id) => deliverNotification(id)));
}
