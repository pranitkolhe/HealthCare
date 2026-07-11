import prisma from '../../config/db';

export async function listMyNotifications(userId: string) {
  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      type: true,
      status: true,
      sentAt: true,
      createdAt: true,
      appointment: { select: { id: true, slotStart: true, doctor: { select: { fullName: true } } } },
    },
  });
  return { notifications };
}
