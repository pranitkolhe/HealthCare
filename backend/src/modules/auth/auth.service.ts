import bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../../config/db';
import env from '../../config/env';
import { UnauthenticatedError, ConflictError } from '../../shared/errors/AppError';

const REFRESH_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function buildAccessToken(user: { id: string; email: string; role: string }) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    env.jwtAccessSecret as jwt.Secret,
    { expiresIn: env.jwtAccessExpiresIn } as jwt.SignOptions
  );
}

function buildRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
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
  const refreshToken = buildRefreshToken();
  const refreshTokenHash = await bcrypt.hash(refreshToken, 12);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt,
    },
  });

  return { user, accessToken, refreshToken };
}

export async function loginUser(payload: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: payload.email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(payload.password, user.passwordHash)) || !user.isActive) {
    throw new UnauthenticatedError('Invalid email or password');
  }

  const accessToken = buildAccessToken({ id: user.id, email: user.email, role: user.role });
  const refreshToken = buildRefreshToken();
  const refreshTokenHash = await bcrypt.hash(refreshToken, 12);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt,
    },
  });

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, role: user.role },
  };
}

export async function refreshAccessToken(rawToken: string) {
  const allTokens = await prisma.refreshToken.findMany({ where: { revoked: false, expiresAt: { gt: new Date() } }, include: { user: true } });
  for (const token of allTokens) {
    if (await bcrypt.compare(rawToken, token.tokenHash)) {
      const user = token.user;
      if (!user || !user.isActive) {
        throw new UnauthenticatedError();
      }
      await prisma.refreshToken.update({ where: { id: token.id }, data: { revoked: true } });
      const newRefreshToken = buildRefreshToken();
      const newHash = await bcrypt.hash(newRefreshToken, 12);
      const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
      await prisma.refreshToken.create({ data: { userId: user.id, tokenHash: newHash, expiresAt } });
      return {
        accessToken: buildAccessToken({ id: user.id, email: user.email, role: user.role }),
        refreshToken: newRefreshToken,
      };
    }
  }
  throw new UnauthenticatedError();
}

export async function logoutUser(rawToken: string) {
  const allTokens = await prisma.refreshToken.findMany({ where: { revoked: false }, include: { user: true } });
  for (const token of allTokens) {
    if (await bcrypt.compare(rawToken, token.tokenHash)) {
      await prisma.refreshToken.update({ where: { id: token.id }, data: { revoked: true } });
      return;
    }
  }
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new UnauthenticatedError('Current password is incorrect');
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({ where: { userId, revoked: false }, data: { revoked: true } }),
  ]);
}
