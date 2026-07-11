import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(/(?=.*[0-9])/, 'Password must contain at least one number'),
  fullName: z.string().min(1),
  phone: z.string().min(7),
  dateOfBirth: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date'),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8).regex(/(?=.*[0-9])/, 'New password must contain at least one number'),
});
