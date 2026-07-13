import bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import prisma from '../../config/db';
import env from '../../config/env';
import { UnauthenticatedError, ConflictError } from '../../shared/errors/AppError';

function buildAccessToken(user: { id: string; email: string; role: string }) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    env.jwtAccessSecret as jwt.Secret,
    { expiresIn: env.jwtAccessExpiresIn } as jwt.SignOptions
  );
}

export async function registerPatient(payload: { email: string; password: string; fullName: string; phone: string; dateOfBirth: string }) {
  const existing = await prisma.user.findUnique({ where: { email: payload.email } });
  if (existing) {
    throw new ConflictError('Email already exists');
  }

  const passwordHash = await bcrypt.hash(payload.password, 12);
  const user = await prisma.user.create({
    data: {
      email: payload.email.toLowerCase(),
      passwordHash,
      role: 'PATIENT',
      patientProfile: {
        create: {
          fullName: payload.fullName,
          phone: payload.phone,
          dateOfBirth: new Date(payload.dateOfBirth),
        },
      },
    },
    select: { id: true, email: true, role: true },
  });

  const accessToken = buildAccessToken({ id: user.id, email: user.email, role: user.role });
  return { user, accessToken };
}

export async function loginUser(payload: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: payload.email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(payload.password, user.passwordHash)) || !user.isActive) {
    throw new UnauthenticatedError('Invalid email or password');
  }

  const accessToken = buildAccessToken({ id: user.id, email: user.email, role: user.role });
  return {
    accessToken,
    user: { id: user.id, email: user.email, role: user.role },
  };
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new UnauthenticatedError('Current password is incorrect');
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}
