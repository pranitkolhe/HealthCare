import { Prisma } from '@prisma/client';
import prisma from '../../config/db';
import { ForbiddenError, NotFoundError, SlotAlreadyBookedError, UnprocessableError } from '../../shared/errors/AppError';
import { addMinutes, getDayOfWeek, isInPast } from '../../shared/utils/dateTime';
import { removeAppointmentFromCalendar, syncAppointmentToCalendar } from '../integrations/calendar.service';
import { generatePreVisitSummary } from '../integrations/ai.service';
import { deliverNotification } from '../integrations/notification.service';
import { enqueueBackgroundJob } from '../../jobs/queues';

function queueOrRun(name: Parameters<typeof enqueueBackgroundJob>[0], data: { appointmentId?: string; notificationId?: string }, fallback: () => Promise<unknown>) {
  void enqueueBackgroundJob(name, data).then((queued) => {
    if (!queued) return fallback();
    return undefined;
  }).catch(() => undefined);
}

export async function createAppointment(patientUserId: string, data: { doctorId: string; slotStart: string; symptoms: string }) {
  const patientProfile = await prisma.patientProfile.findUnique({ where: { userId: patientUserId } });
  if (!patientProfile) {
    throw new NotFoundError('Patient profile not found');
  }

  const slotStart = new Date(data.slotStart);
  if (isInPast(slotStart)) {
    throw new UnprocessableError('Slot cannot be in the past');
  }

  const doctor = await prisma.doctorProfile.findUnique({ where: { id: data.doctorId }, include: { workingHours: true, leaves: true, user: true } });
  if (!doctor || !doctor.user.isActive) {
    throw new NotFoundError('Doctor not found');
  }

  const dayOfWeek = getDayOfWeek(slotStart);
  const hourBlock = doctor.workingHours.find((block: { dayOfWeek: number; startTime: string; endTime: string }) => block.dayOfWeek === dayOfWeek);
  if (!hourBlock) {
    throw new UnprocessableError('Slot outside working hours');
  }

  const duration = doctor.slotDurationMinutes;
  const slotEnd = addMinutes(slotStart, duration);
  const slotStartTime = slotStart.toISOString().substring(11, 16);
  const slotEndTime = slotEnd.toISOString().substring(11, 16);
  if (slotStartTime < hourBlock.startTime || slotEndTime > hourBlock.endTime) {
    throw new UnprocessableError('Slot outside working hours');
  }

  const leaveDateMatches = doctor.leaves.some((leave: { leaveDate: Date | string }) => {
    const leaveDate = new Date(leave.leaveDate);
    return leaveDate.toISOString().substring(0, 10) === slotStart.toISOString().substring(0, 10);
  });
  if (leaveDateMatches) {
    throw new UnprocessableError('Doctor on leave');
  }

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Serialize only attempts for this exact doctor and slot. The partial
      // unique index below remains the database-level safety net.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext(${`${data.doctorId}:${slotStart.toISOString()}`}))
      `;
      const existing = await tx.appointment.findFirst({ where: { doctorId: data.doctorId, slotStart, status: 'BOOKED' } });
      if (existing) {
        throw new SlotAlreadyBookedError();
      }
      const createdAppointment = await tx.appointment.create({
        data: {
          doctorId: data.doctorId,
          patientId: patientProfile.id,
          slotStart,
          slotEnd,
          symptoms: data.symptoms,
        },
      });
      await tx.preVisitSummary.create({
        data: {
          appointmentId: createdAppointment.id,
          urgency: 'MEDIUM',
          chiefComplaint: data.symptoms,
          suggestedQuestions: [
            'When did your symptoms begin?',
            'Are you currently taking any medications?',
            'Do you have any known allergies?',
          ],
          status: 'PENDING',
        },
      });
      await tx.calendarEvent.create({
        data: {
          appointmentId: createdAppointment.id,
          googleEventId: `PENDING_${createdAppointment.id}`,
          syncStatus: 'PENDING',
        },
      });
      const notifications = await Promise.all([patientUserId, doctor.userId].map((userId) => tx.notification.create({
        data: { userId, appointmentId: createdAppointment.id, type: 'BOOKING_CONFIRMATION', channel: 'EMAIL' },
      })));
      return { appointment: createdAppointment, notificationIds: notifications.map((notification) => notification.id) };
    });

    queueOrRun('calendar:sync', { appointmentId: result.appointment.id }, () => syncAppointmentToCalendar(result.appointment.id));
    queueOrRun('ai:pre-visit', { appointmentId: result.appointment.id }, () => generatePreVisitSummary(result.appointment.id));
    result.notificationIds.forEach((notificationId) => queueOrRun('notification:deliver', { notificationId }, () => deliverNotification(notificationId)));

    return { appointment: result.appointment };
  } catch (error) {
    if (error instanceof SlotAlreadyBookedError) {
      throw error;
    }
    if (
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') ||
      (error instanceof Error && error.message.includes('uq_doctor_active_slot'))
    ) {
      throw new SlotAlreadyBookedError();
    }
    throw error;
  }
}

export async function cancelAppointment(user: { id: string; role: string }, appointmentId: string, reason?: string) {
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId }, include: { patient: true, doctor: true } });
  if (!appointment) {
    throw new NotFoundError('Appointment not found');
  }
  if (appointment.status !== 'BOOKED') {
    throw new UnprocessableError('Appointment cannot be cancelled');
  }
  if (appointment.patient.userId !== user.id && user.role !== 'ADMIN') {
    throw new ForbiddenError('Forbidden');
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.appointment.update({
      where: { id: appointmentId },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
    });
    const notification = await tx.notification.create({
      data: {
        userId: appointment.patient.userId,
        appointmentId,
        type: 'CANCELLATION',
        channel: 'EMAIL',
      },
    });
    return { appointment: updated, notificationId: notification.id };
  });
  queueOrRun('notification:deliver', { notificationId: result.notificationId }, () => deliverNotification(result.notificationId));
  queueOrRun('calendar:delete', { appointmentId }, () => removeAppointmentFromCalendar(appointmentId));
  return { appointment: result.appointment };
}

export async function getAppointmentDetail(user: { id: string; role: string }, appointmentId: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { patient: { select: { userId: true } }, doctor: { select: { userId: true } }, preVisitSummary: true, postVisitSummary: true },
  });
  if (!appointment) {
    throw new NotFoundError('Appointment not found');
  }
  if (user.role !== 'ADMIN' && appointment.patient.userId !== user.id && appointment.doctor.userId !== user.id) {
    throw new ForbiddenError('Forbidden');
  }
  return { appointment };
}
