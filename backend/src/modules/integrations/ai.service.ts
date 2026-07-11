import { z } from 'zod';
import prisma from '../../config/db';
import env from '../../config/env';
import logger from '../../config/logger';

const preVisitSummarySchema = z.object({
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  chiefComplaint: z.string().min(1).max(200),
  suggestedQuestions: z.array(z.string().min(1)).length(3),
});

const medicineSchema = z.object({
  medicineName: z.string().min(1),
  dosage: z.string().min(1),
  frequency: z.string().min(1),
  durationDays: z.number().int().positive(),
  instructions: z.string(),
});

const postVisitSummarySchema = z.object({
  patientFriendlyExplanation: z.string().min(1).max(1000),
  medicineSchedule: z.array(medicineSchema),
  followUpInstructions: z.string().min(1).max(500),
});

type JsonSchema = Record<string, unknown>;

const delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function isTransientGeminiError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return message.includes('high demand') || message.includes('resource_exhausted') || message.includes('429') || message.includes('503') || message.includes('temporarily unavailable');
}

function errorDetails(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return error;
}

async function generateStructuredJson(prompt: string, responseSchema: JsonSchema) {
  if (!env.geminiApiKey) {
    throw new Error('Gemini is not configured');
  }

  const controller = new AbortController();
  // Gemini 3 structured output may spend several seconds reasoning before it
  // emits JSON. Keep the API request asynchronous, but allow enough time for
  // a real response instead of aborting it at the legacy 10-second limit.
  const timeoutMs = env.geminiModel.startsWith('gemini-3') ? Math.max(env.geminiTimeoutMs, 30_000) : env.geminiTimeoutMs;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.geminiModel)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.geminiApiKey },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema,
            // Gemini 3 spends output budget on reasoning. A low thinking level
            // and a larger response allowance leave room for the JSON payload.
            thinkingConfig: env.geminiModel.startsWith('gemini-3') ? { thinkingLevel: 'MINIMAL' } : undefined,
            maxOutputTokens: 2048,
          },
        }),
      }
    );
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } };
    if (!response.ok) {
      throw new Error(payload.error?.message || `Gemini request failed with ${response.status}`);
    }
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();
    if (!text) throw new Error('Gemini returned no structured response');
    return JSON.parse(text) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateStructuredJsonWithRetry(prompt: string, responseSchema: JsonSchema) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await generateStructuredJson(prompt, responseSchema);
    } catch (error) {
      lastError = error;
      if (!isTransientGeminiError(error) || attempt === 2) throw error;
      // This runs after the booking/notes transaction has committed, so the
      // backoff never delays a patient or clinician HTTP response.
      await delay(750 * (attempt + 1));
    }
  }
  throw lastError;
}

export async function generatePreVisitSummary(appointmentId: string) {
  try {
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { symptoms: true } });
    if (!appointment) return;
    const result = preVisitSummarySchema.parse(await generateStructuredJsonWithRetry(
      `You are a clinical intake assistant. Do not diagnose or invent information. Based only on these patient-reported symptoms, return JSON with urgency (LOW, MEDIUM, or HIGH), a chiefComplaint of at most 15 words, and exactly three suggestedQuestions.\n\nSymptoms:\n${appointment.symptoms}`,
      {
        type: 'OBJECT',
        properties: {
          urgency: { type: 'STRING', enum: ['LOW', 'MEDIUM', 'HIGH'] },
          chiefComplaint: { type: 'STRING' },
          suggestedQuestions: { type: 'ARRAY', items: { type: 'STRING' }, minItems: 3, maxItems: 3 },
        },
        required: ['urgency', 'chiefComplaint', 'suggestedQuestions'],
      }
    ));
    await prisma.preVisitSummary.update({
      where: { appointmentId },
      data: { ...result, status: 'READY', attemptCount: { increment: 1 } },
    });
  } catch (error) {
    logger.error('Pre-visit summary generation failed', { appointmentId, error: errorDetails(error) });
    await prisma.preVisitSummary.update({
      where: { appointmentId },
      data: { status: 'FAILED', attemptCount: { increment: 1 } },
    }).catch(() => undefined);
  }
}

export async function generatePostVisitSummary(appointmentId: string) {
  try {
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { doctorNotes: true, prescription: true } });
    if (!appointment?.doctorNotes) return;
    const result = postVisitSummarySchema.parse(await generateStructuredJsonWithRetry(
      `You translate a doctor's notes into a clear patient-friendly summary. Do not add medical facts, medicines, doses, or instructions not present in the input. Return JSON with patientFriendlyExplanation, medicineSchedule, and followUpInstructions.\n\nDoctor notes:\n${appointment.doctorNotes}\n\nPrescription:\n${appointment.prescription ?? ''}`,
      {
        type: 'OBJECT',
        properties: {
          patientFriendlyExplanation: { type: 'STRING' },
          medicineSchedule: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                medicineName: { type: 'STRING' }, dosage: { type: 'STRING' }, frequency: { type: 'STRING' },
                durationDays: { type: 'INTEGER' }, instructions: { type: 'STRING' },
              },
              required: ['medicineName', 'dosage', 'frequency', 'durationDays', 'instructions'],
            },
          },
          followUpInstructions: { type: 'STRING' },
        },
        required: ['patientFriendlyExplanation', 'medicineSchedule', 'followUpInstructions'],
      }
    ));
    await prisma.postVisitSummary.update({
      where: { appointmentId },
      data: { ...result, status: 'READY', attemptCount: { increment: 1 } },
    });
  } catch (error) {
    logger.error('Post-visit summary generation failed', { appointmentId, error: errorDetails(error) });
    // Gemini is an enhancement, never a reason to hide the clinician's
    // recorded outcome from the patient. Preserve a clear fallback summary
    // while showing FAILED so the doctor can retry or replace it manually.
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { doctorNotes: true, prescription: true } });
    await prisma.postVisitSummary.update({
      where: { appointmentId },
      data: {
        status: 'FAILED',
        attemptCount: { increment: 1 },
        patientFriendlyExplanation: appointment?.doctorNotes ? 'Your visit was completed. Your doctor has provided the follow-up information below.' : 'Your visit was completed. Please contact the clinic for details.',
        medicineSchedule: [],
        followUpInstructions: appointment?.prescription ? `Prescription provided by your doctor: ${appointment.prescription}` : 'Follow the instructions provided by your doctor.',
      },
    }).catch(() => undefined);
  }
}

export default { generatePreVisitSummary, generatePostVisitSummary };
