import prisma from '../../config/db';

const NO_SHOW_GRACE_MS = 30 * 60 * 1000;

/** Marks booked appointments as no-shows 30 minutes after their scheduled end. */
export async function markOverdueAppointmentsAsNoShow(now = new Date()) {
  return prisma.appointment.updateMany({
    where: { status: 'BOOKED', slotEnd: { lt: new Date(now.getTime() - NO_SHOW_GRACE_MS) } },
    data: { status: 'NO_SHOW' },
  });
}

export { NO_SHOW_GRACE_MS };
