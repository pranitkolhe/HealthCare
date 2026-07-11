import { z } from 'zod';

const slotDurationSchema = z.preprocess((value) => {
  if (typeof value === 'string') return Number(value);
  return value;
}, z.number().int().refine((value) => [15, 20, 30, 45, 60].includes(value), 'Invalid slot duration'));

export const createDoctorSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  specialization: z.string().min(1),
  slotDurationMinutes: slotDurationSchema,
  workingHours: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time'),
      endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time'),
    })
  ).min(1).superRefine((hours, ctx) => {
    const days = new Set<number>();
    hours.forEach((hour, index) => {
      if (hour.startTime >= hour.endTime) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'endTime'], message: 'End time must be after start time' });
      if (days.has(hour.dayOfWeek)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'dayOfWeek'], message: 'Each weekday can only be added once' });
      days.add(hour.dayOfWeek);
    });
  }),
});

export const updateDoctorSchema = z.object({
  specialization: z.string().min(1).optional(),
  bio: z.string().optional(),
  slotDurationMinutes: slotDurationSchema.optional(),
  workingHours: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time'),
      endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time'),
    })
  ).superRefine((hours, ctx) => {
    const days = new Set<number>();
    hours.forEach((hour, index) => {
      if (hour.startTime >= hour.endTime) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'endTime'], message: 'End time must be after start time' });
      if (days.has(hour.dayOfWeek)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'dayOfWeek'], message: 'Each weekday can only be added once' });
      days.add(hour.dayOfWeek);
    });
  }).optional(),
});

export const markLeaveSchema = z.object({
  leaveDate: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date'),
  reason: z.string().min(1),
});

export const listUsersSchema = z.object({
  role: z.enum(['ADMIN', 'DOCTOR', 'PATIENT']).optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});
