import { z } from 'zod';

export const searchDoctorsSchema = z.object({
  specialization: z.string().optional(),
  search: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export const availabilitySchema = z.object({
  date: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date'),
});

export const listAppointmentsSchema = z.object({
  status: z.string().optional(),
  date: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export const noteSchema = z.object({
  doctorNotes: z.string().min(1),
  prescription: z.string().min(1),
  medications: z.array(z.object({ medicineName: z.string().min(1), dosage: z.string().min(1), frequency: z.string().min(1), durationDays: z.number().int().positive() })).optional(),
});

const workingHourSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export const updateAvailabilitySchema = z.object({
  bio: z.string().max(2000).optional(),
  workingHours: z.array(workingHourSchema).min(1).optional(),
}).refine((data) => data.bio !== undefined || data.workingHours !== undefined, 'Provide profile or availability changes');

export const doctorLeaveSchema = z.object({
  leaveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  reason: z.string().min(1).max(500),
});

export const manualPostVisitSummarySchema = z.object({
  patientFriendlyExplanation: z.string().min(1).max(1000),
  followUpInstructions: z.string().min(1).max(500),
});
