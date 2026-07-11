import { z } from 'zod';

export const updatePatientSchema = z.object({
  fullName: z.string().optional(),
  phone: z.string().optional(),
  dateOfBirth: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date').optional(),
});

export const listAppointmentsSchema = z.object({
  status: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});
