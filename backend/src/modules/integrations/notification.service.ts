import type { NotificationType } from '@prisma/client';
import prisma from '../../config/db';
import logger from '../../config/logger';
import { sendMail } from '../../shared/mailer';

const subjects: Record<NotificationType, string> = {
  BOOKING_CONFIRMATION: 'Appointment confirmed',
  RESCHEDULE: 'Appointment rescheduled',
  REMINDER: 'Appointment reminder',
  CANCELLATION: 'Appointment cancelled',
  DOCTOR_LEAVE: 'Appointment cancelled: doctor unavailable',
  MEDICATION_REMINDER: 'Medication reminder',
};

/**
 * Deliver a notification that has already been written to Postgres. This is
 * deliberately fire-and-forget from request handlers: email availability must
 * never change the outcome of a booking or cancellation.
 */
export async function deliverNotification(notificationId: string) {
  try {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
      include: {
        user: { select: { email: true } },
        appointment: {
          select: {
            slotStart: true,
            prescription: true,
            doctor: { select: { fullName: true } },
            patient: { select: { fullName: true } },
            medicationReminders: {
              where: { status: 'ACTIVE' },
              select: { medicineName: true, dosage: true, frequency: true, endDate: true },
            },
          },
        },
      },
    });

    if (!notification || notification.status !== 'PENDING') return;

    const appointment = notification.appointment;
    const medicationDetails = notification.type === 'MEDICATION_REMINDER' && appointment
      ? appointment.medicationReminders.length
        ? `\n\nMedication details:\n${appointment.medicationReminders.map((medication) => `• ${medication.medicineName}: ${medication.dosage}, ${medication.frequency} (until ${medication.endDate.toLocaleDateString()})`).join('\n')}${appointment.prescription ? `\n\nDoctor's prescription:\n${appointment.prescription}` : ''}`
        : appointment.prescription ? `\n\nDoctor's prescription:\n${appointment.prescription}` : '\n\nPlease follow the medication instructions given by your doctor.'
      : '';
    const text = appointment
      ? `${notification.type.replace(/_/g, ' ')}\n\nDoctor: ${appointment.doctor.fullName}\nWhen: ${appointment.slotStart.toLocaleString()}\nPatient: ${appointment.patient.fullName}${medicationDetails}`
      : notification.type.replace(/_/g, ' ');

    await sendMail(notification.user.email, subjects[notification.type], text);
    await prisma.notification.update({
      where: { id: notification.id },
      data: { status: 'SENT', sentAt: new Date(), attemptCount: { increment: 1 }, lastError: null },
    });
  } catch (error) {
    logger.error('Notification delivery failed', { notificationId, error });
    // Keep the durable record as FAILED so a later queue/reconciliation worker
    // can retry it; this catch intentionally never leaks into the HTTP flow.
    await prisma.notification.update({
      where: { id: notificationId },
      data: { status: 'FAILED', attemptCount: { increment: 1 }, lastError: String(error) },
    }).catch((updateError) => logger.error('Could not mark notification failed', { notificationId, error: updateError }));
  }
}

export default { deliverNotification };
