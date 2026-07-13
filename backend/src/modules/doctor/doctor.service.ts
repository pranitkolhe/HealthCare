import { Prisma } from '@prisma/client';
import prisma from '../../config/db';
import { generateAvailability } from '../appointment/slotGenerator';
import { getPagination } from '../../shared/utils/pagination';
import { ConflictError, NotFoundError, UnprocessableError } from '../../shared/errors/AppError';
import { isInPast, startOfUtcDay } from '../../shared/utils/dateTime';
import { generatePostVisitSummary, generatePreVisitSummary } from '../integrations/ai.service';
import { deliverNotification } from '../integrations/notification.service';
import { enqueueBackgroundJob } from '../../jobs/queues';

export async function searchDoctors(query: { specialization?: string; search?: string; page?: number; limit?: number }) {
  const { page, limit, skip } = getPagination(query.page, query.limit);
  const where: Record<string, unknown> = { role: 'DOCTOR', isActive: true };
  const profileFilters: Record<string, unknown> = {};
  if (query.specialization?.trim()) {
    profileFilters.specialization = { contains: query.specialization.trim(), mode: 'insensitive' };
  }
  if (query.search?.trim()) {
    profileFilters.fullName = { contains: query.search.trim(), mode: 'insensitive' };
  }
  if (Object.keys(profileFilters).length > 0) {
    // DoctorProfile is an optional one-to-one relation. Prisma requires an
    // explicit relation filter for speciality/name queries.
    where.doctorProfile = { is: profileFilters };
  }

  const [doctors, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      select: {
        id: true,
        email: true,
        doctorProfile: { select: { id: true, fullName: true, specialization: true, bio: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return { doctors, total, page, limit };
}

export async function getDoctorAvailability(doctorId: string, dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime()) || startOfUtcDay(date).getTime() < startOfUtcDay(new Date()).getTime()) {
    throw new UnprocessableError('Date cannot be in the past');
  }

  const doctor = await prisma.doctorProfile.findUnique({
    where: { id: doctorId },
    include: { workingHours: true, leaves: true },
  });
  if (!doctor) {
    throw new NotFoundError('Doctor not found');
  }

  const bookedAppointments = await prisma.appointment.findMany({
    where: { doctorId, slotStart: { gte: new Date(date.toISOString().substring(0, 10)), lt: new Date(date.toISOString().substring(0, 10) + 'T23:59:59.999Z') }, status: 'BOOKED' },
    select: { slotStart: true },
  });

  const bookedStarts = bookedAppointments.map((appt: { slotStart: Date }) => appt.slotStart.toISOString());
  const leaveDates = doctor.leaves.map((leave: { leaveDate: Date | string }) => new Date(leave.leaveDate));

  const slots = generateAvailability(
    doctor.workingHours.map((block: { dayOfWeek: number; startTime: string; endTime: string }) => ({ dayOfWeek: block.dayOfWeek, startTime: block.startTime, endTime: block.endTime })),
    doctor.slotDurationMinutes,
    date,
    bookedStarts,
    leaveDates
  );
  // A same-day search should offer only remaining slots, rather than rejecting
  // the entire day because its midnight timestamp is in the past.
  return { slots: slots.filter((slot) => !isInPast(new Date(slot.start))) };
}

export async function getDoctorSchedule(doctorId: string) {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { id: doctorId },
    include: { workingHours: { orderBy: { dayOfWeek: 'asc' } }, leaves: { where: { leaveDate: { gte: new Date() } }, orderBy: { leaveDate: 'asc' } } },
  });
  if (!doctor) throw new NotFoundError('Doctor not found');
  return {
    workingHours: doctor.workingHours.map((hour) => ({ dayOfWeek: hour.dayOfWeek, startTime: hour.startTime, endTime: hour.endTime })),
    leaves: doctor.leaves.map((leave) => ({ leaveDate: leave.leaveDate.toISOString().slice(0, 10), reason: leave.reason })),
  };
}

export async function listDoctorAppointments(doctorUserId: string, query: { status?: string; date?: string; page?: number; limit?: number }) {
  const doctorProfile = await prisma.doctorProfile.findUnique({ where: { userId: doctorUserId } });
  if (!doctorProfile) {
    throw new NotFoundError('Doctor profile not found');
  }

  const { page, limit, skip } = getPagination(query.page, query.limit);
  const where: Record<string, unknown> = { doctorId: doctorProfile.id };
  if (query.status) {
    Object.assign(where, { status: query.status });
  }
  if (query.date) {
    const date = new Date(query.date);
    where.slotStart = { gte: new Date(date.toISOString().substring(0, 10)), lt: new Date(date.toISOString().substring(0, 10) + 'T23:59:59.999Z') };
  }

  const appointments = await prisma.appointment.findMany({
    where,
    skip,
    take: limit,
    orderBy: { slotStart: query.status === 'BOOKED' ? 'asc' : 'desc' },
    include: { patient: { select: { fullName: true } }, preVisitSummary: true, postVisitSummary: true, calendarEvent: true },
  });

  return { appointments, page, limit };
}

export async function addDoctorNotes(doctorUserId: string, appointmentId: string, doctorNotes: string, prescription: string, medications: Array<{ medicineName: string; dosage: string; frequency: string; durationDays: number }> = []) {
  const doctorProfile = await prisma.doctorProfile.findUnique({ where: { userId: doctorUserId } });
  if (!doctorProfile) {
    throw new NotFoundError('Doctor profile not found');
  }

  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId }, include: { doctor: true } });
  if (!appointment || appointment.doctorId !== doctorProfile.id) {
    throw new NotFoundError('Appointment not found');
  }
  if (appointment.status !== 'BOOKED') {
    throw new UnprocessableError('Cannot add notes to this appointment');
  }
  if (appointment.slotStart.getTime() > Date.now()) {
    throw new UnprocessableError('Cannot add notes before the appointment');
  }

  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({ where: { id: appointmentId }, data: { doctorNotes, prescription, status: 'COMPLETED' } });
    await tx.medicationReminder.deleteMany({ where: { appointmentId } });
    if (medications.length) await tx.medicationReminder.createMany({ data: medications.map((medication) => ({ appointmentId, medicineName: medication.medicineName, dosage: medication.dosage, frequency: medication.frequency, nextSendAt: new Date(), endDate: new Date(Date.now() + medication.durationDays * 24 * 60 * 60 * 1000) })) });
  });

  await prisma.postVisitSummary.upsert({
    where: { appointmentId },
    create: {
      appointmentId,
      patientFriendlyExplanation: 'Post-visit summary is being generated.',
      medicineSchedule: [],
      followUpInstructions: 'Post-visit summary is being generated.',
      status: 'PENDING',
    },
    update: {
      patientFriendlyExplanation: 'Post-visit summary is being generated.',
      medicineSchedule: [],
      followUpInstructions: 'Post-visit summary is being generated.',
      status: 'PENDING',
    },
  });

  void enqueueBackgroundJob('ai:post-visit', { appointmentId }).then((queued) => {
    if (!queued) return generatePostVisitSummary(appointmentId);
    return undefined;
  }).catch(() => undefined);

  const appointmentWithSummary = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { postVisitSummary: true, preVisitSummary: true, calendarEvent: true },
  });

  return { appointment: appointmentWithSummary };
}

async function assertDoctorOwnsAppointment(doctorUserId: string, appointmentId: string) {
  const doctorProfile = await prisma.doctorProfile.findUnique({ where: { userId: doctorUserId } });
  if (!doctorProfile) throw new NotFoundError('Doctor profile not found');
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment || appointment.doctorId !== doctorProfile.id) throw new NotFoundError('Appointment not found');
  return appointment;
}

export async function retryPreVisitSummary(doctorUserId: string, appointmentId: string) {
  await assertDoctorOwnsAppointment(doctorUserId, appointmentId);
  await prisma.preVisitSummary.update({ where: { appointmentId }, data: { status: 'PENDING' } });
  void enqueueBackgroundJob('ai:pre-visit', { appointmentId }).then((queued) => {
    if (!queued) return generatePreVisitSummary(appointmentId);
    return undefined;
  }).catch(() => undefined);
  return { status: 'PENDING' };
}

export async function retryPostVisitSummary(doctorUserId: string, appointmentId: string) {
  const appointment = await assertDoctorOwnsAppointment(doctorUserId, appointmentId);
  if (!appointment.doctorNotes) throw new UnprocessableError('Add doctor notes before generating a post-visit summary');
  await prisma.postVisitSummary.upsert({
    where: { appointmentId },
    update: { status: 'PENDING' },
    create: {
      appointmentId,
      patientFriendlyExplanation: 'Summary is being generated.',
      medicineSchedule: [],
      followUpInstructions: 'Summary is being generated.',
      status: 'PENDING',
    },
  });
  void enqueueBackgroundJob('ai:post-visit', { appointmentId }).then((queued) => {
    if (!queued) return generatePostVisitSummary(appointmentId);
    return undefined;
  }).catch(() => undefined);
  return { status: 'PENDING' };
}

export async function getDoctorProfile(doctorUserId: string) {
  const profile = await prisma.doctorProfile.findUnique({
    where: { userId: doctorUserId },
    include: { workingHours: { orderBy: { dayOfWeek: 'asc' } }, leaves: { orderBy: { leaveDate: 'asc' } }, user: { select: { email: true } } },
  });
  if (!profile) throw new NotFoundError('Doctor profile not found');
  return { profile };
}

export async function updateDoctorAvailability(doctorUserId: string, data: { bio?: string; workingHours?: { dayOfWeek: number; startTime: string; endTime: string }[] }) {
  const doctor = await prisma.doctorProfile.findUnique({ where: { userId: doctorUserId } });
  if (!doctor) throw new NotFoundError('Doctor profile not found');
  if (data.workingHours) {
    const days = new Set<number>();
    for (const hour of data.workingHours) {
      if (hour.startTime >= hour.endTime) throw new UnprocessableError('Each working-hour end time must be after its start time');
      if (days.has(hour.dayOfWeek)) throw new UnprocessableError('Each weekday can only appear once');
      days.add(hour.dayOfWeek);
    }
  }
  const profile = await prisma.$transaction(async (tx) => {
    if (data.workingHours) {
      await tx.workingHour.deleteMany({ where: { doctorId: doctor.id } });
      await tx.workingHour.createMany({ data: data.workingHours.map((hour) => ({ ...hour, doctorId: doctor.id })) });
    }
    return tx.doctorProfile.update({ where: { id: doctor.id }, data: data.bio !== undefined ? { bio: data.bio } : {}, include: { workingHours: { orderBy: { dayOfWeek: 'asc' } } } });
  });
  return { profile };
}

export async function markDoctorLeave(doctorUserId: string, leaveDateString: string, reason: string) {
  const doctor = await prisma.doctorProfile.findUnique({ where: { userId: doctorUserId } });
  if (!doctor) throw new NotFoundError('Doctor profile not found');
  const leaveDate = new Date(`${leaveDateString}T00:00:00.000Z`);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const leave = await tx.doctorLeave.create({ data: { doctorId: doctor.id, leaveDate, reason } });
      const appointments = await tx.appointment.findMany({
        where: { doctorId: doctor.id, slotStart: { gte: leaveDate, lt: new Date(leaveDate.getTime() + 24 * 60 * 60 * 1000) }, status: 'BOOKED' },
        select: { id: true, patient: { select: { userId: true } } },
      });
      await tx.appointment.updateMany({ where: { id: { in: appointments.map((appointment) => appointment.id) } }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'DOCTOR_LEAVE' } });
      const notifications = await Promise.all(appointments.map((appointment) => tx.notification.create({ data: { userId: appointment.patient.userId, appointmentId: appointment.id, type: 'DOCTOR_LEAVE', channel: 'EMAIL' } })));
      return { leave, notifications };
    });
    result.notifications.forEach((notification) => void deliverNotification(notification.id));
    return { leave: result.leave, cancelledAppointments: result.notifications.length };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictError('Leave has already been marked for this date');
    throw error;
  }
}

export async function saveManualPostVisitSummary(doctorUserId: string, appointmentId: string, data: { patientFriendlyExplanation: string; followUpInstructions: string }) {
  const appointment = await assertDoctorOwnsAppointment(doctorUserId, appointmentId);
  if (!appointment.doctorNotes) throw new UnprocessableError('Save consultation notes before publishing a summary');
  const summary = await prisma.postVisitSummary.upsert({
    where: { appointmentId },
    update: { ...data, medicineSchedule: [], status: 'READY' },
    create: { appointmentId, ...data, medicineSchedule: [], status: 'READY' },
  });
  return { summary };
}
