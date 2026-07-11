import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../config/db';
import { ConflictError, NotFoundError } from '../../shared/errors/AppError';
import { deliverNotification } from '../integrations/notification.service';
import { sendMail } from '../../shared/mailer';
import logger from '../../config/logger';

export async function createDoctor(data: {
  email: string;
  fullName: string;
  specialization: string;
  slotDurationMinutes: number;
  workingHours: { dayOfWeek: number; startTime: string; endTime: string }[];
}) {
  const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) {
    throw new ConflictError('Email already exists');
  }

  const tempPassword = crypto.randomBytes(6).toString('base64url');
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const doctor = await prisma.user.create({
    data: {
      email: data.email.toLowerCase(),
      passwordHash,
      role: 'DOCTOR',
      doctorProfile: {
        create: {
          fullName: data.fullName,
          specialization: data.specialization,
          slotDurationMinutes: data.slotDurationMinutes,
          workingHours: {
            create: data.workingHours.map((hour) => ({
              dayOfWeek: hour.dayOfWeek,
              startTime: hour.startTime,
              endTime: hour.endTime,
            })),
          },
        },
      },
    },
    select: {
      id: true,
      email: true,
      role: true,
      doctorProfile: {
        select: {
          id: true,
          fullName: true,
          specialization: true,
          slotDurationMinutes: true,
          bio: true,
        },
      },
    },
  });

  // Account creation must succeed even if an SMTP provider is unavailable.
  // The administrator still receives the temporary password in the response.
  void sendMail(
    doctor.email,
    'Your Healthcare Portal doctor account',
    `Hello ${doctor.doctorProfile?.fullName ?? 'Doctor'},\n\nYour account has been created.\nEmail: ${doctor.email}\nTemporary password: ${tempPassword}\n\nPlease sign in and change this password immediately.`
  ).catch((error) => logger.error('Doctor welcome email failed', { doctorId: doctor.id, error: error instanceof Error ? { message: error.message } : error }));

  return { doctor, tempPassword };
}

export async function updateDoctor(doctorId: string, data: { specialization?: string; bio?: string; slotDurationMinutes?: number; workingHours?: { dayOfWeek: number; startTime: string; endTime: string }[] }) {
  const doctor = await prisma.doctorProfile.findUnique({ where: { id: doctorId } });
  if (!doctor) {
    throw new NotFoundError('Doctor not found');
  }

  await prisma.$transaction(async (tx) => {
    const updates: Record<string, unknown> = {};
    if (data.specialization !== undefined) updates.specialization = data.specialization;
    if (data.bio !== undefined) updates.bio = data.bio;
    if (data.slotDurationMinutes !== undefined) updates.slotDurationMinutes = data.slotDurationMinutes;

    if (Object.keys(updates).length > 0) {
      await tx.doctorProfile.update({ where: { id: doctorId }, data: updates });
    }

    if (data.workingHours) {
      await tx.workingHour.deleteMany({ where: { doctorId } });
      await tx.workingHour.createMany({
        data: data.workingHours.map((hour) => ({ doctorId, dayOfWeek: hour.dayOfWeek, startTime: hour.startTime, endTime: hour.endTime })),
      });
    }
  });

  return { doctorId };
}

export async function softDeleteDoctor(doctorId: string) {
  const doctor = await prisma.doctorProfile.findUnique({ where: { id: doctorId }, include: { user: true } });
  if (!doctor) {
    throw new NotFoundError('Doctor not found');
  }

  const cancelled = await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: doctor.userId }, data: { isActive: false } });
    const result = await tx.appointment.updateMany({
      where: { doctorId, slotStart: { gt: new Date() }, status: 'BOOKED' },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'DOCTOR_DEACTIVATED' },
    });
    return result.count;
  });

  return { cancelledFutureAppointments: cancelled };
}

export async function markDoctorLeave(doctorId: string, leaveDate: Date, reason: string) {
  const doctor = await prisma.doctorProfile.findUnique({ where: { id: doctorId } });
  if (!doctor) {
    throw new NotFoundError('Doctor not found');
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const leave = await tx.doctorLeave.create({ data: { doctorId, leaveDate, reason } });
      const appointments = await tx.appointment.findMany({
        where: { doctorId, slotStart: { gte: leaveDate, lt: new Date(leaveDate.getTime() + 24 * 60 * 60 * 1000) }, status: 'BOOKED' },
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

export async function listUsers(role?: string, page = 1, limit = 20) {
  const where: Record<string, unknown> = {};
  if (role) {
    where.role = role;
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      // Never return password hashes or refresh-token material to the admin UI.
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        doctorProfile: {
          select: {
            id: true,
            fullName: true,
            specialization: true,
            bio: true,
            slotDurationMinutes: true,
            workingHours: { orderBy: { dayOfWeek: 'asc' } },
            leaves: { where: { leaveDate: { gte: new Date() } }, orderBy: { leaveDate: 'asc' } },
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total, page, limit };
}

export async function deactivateUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new NotFoundError('User not found');
  }

  await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
  return { userId };
}
