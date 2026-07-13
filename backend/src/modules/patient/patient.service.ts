import prisma from '../../config/db';
import { getPagination } from '../../shared/utils/pagination';
import { NotFoundError } from '../../shared/errors/AppError';

export async function getPatientProfile(userId: string) {
  const profile = await prisma.patientProfile.findUnique({ where: { userId }, include: { user: true } });
  if (!profile) {
    throw new NotFoundError('Patient profile not found');
  }
  return { profile };
}

export async function updatePatientProfile(userId: string, data: { fullName?: string; phone?: string; dateOfBirth?: string }) {
  const patient = await prisma.patientProfile.findUnique({ where: { userId } });
  if (!patient) {
    throw new NotFoundError('Patient profile not found');
  }
  const updates: Record<string, unknown> = {};
  if (data.fullName !== undefined) updates.fullName = data.fullName;
  if (data.phone !== undefined) updates.phone = data.phone;
  if (data.dateOfBirth !== undefined) updates.dateOfBirth = new Date(data.dateOfBirth);

  const updated = await prisma.patientProfile.update({ where: { userId }, data: updates });
  return { profile: updated };
}

export async function listPatientAppointments(userId: string, query: { status?: string; page?: number; limit?: number }) {
  const patientProfile = await prisma.patientProfile.findUnique({ where: { userId } });
  if (!patientProfile) {
    throw new NotFoundError('Patient profile not found');
  }

  const { page, limit, skip } = getPagination(query.page, query.limit);
  const where: Record<string, unknown> = { patientId: patientProfile.id };
  if (query.status) {
    Object.assign(where, { status: query.status });
  }

  const appointments = await prisma.appointment.findMany({
    where,
    skip,
    take: limit,
    orderBy: { slotStart: query.status === 'BOOKED' ? 'asc' : 'desc' },
    include: {
      doctor: { select: { id: true, user: { select: { email: true } }, fullName: true } },
      postVisitSummary: true,
      calendarEvent: true,
    },
  });

  return { appointments, page, limit };
}
