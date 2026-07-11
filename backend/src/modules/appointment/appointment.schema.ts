import { z } from 'zod';

export const createAppointmentSchema = z.object({
  doctorId: z.string().uuid(),
  slotStart: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date'),
  symptoms: z.string().min(1),
});

export const cancelAppointmentSchema = z.object({
  reason: z.string().optional(),
});
