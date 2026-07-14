# Technical Reference

This document is the single technical deliverable for the API, database schema, Gemini prompts, and Google Calendar integration. It reflects the current implementation.

## API reference

Base URL: `/api/v1`  
Protected routes require `Authorization: Bearer <accessToken>`.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register` | Public | Register a patient account. |
| POST | `/auth/login` | Public | Authenticate and receive an access token. |
| POST | `/auth/logout` | Public | End the active session. |
| POST | `/auth/change-password` | Authenticated | Change password. |
| GET | `/doctors` | Authenticated | Search doctors; supports `specialization`, `search`, `page`, `limit`. |
| GET | `/doctors/:doctorId/availability` | Authenticated | Get available slots; requires `date`. |
| GET | `/doctors/:doctorId/schedule` | Authenticated | Get working hours and leave dates. |
| POST | `/appointments` | Patient | Book an appointment. |
| PATCH | `/appointments/:appointmentId/reschedule` | Patient | Move a booked appointment to a valid available slot. |
| DELETE | `/appointments/:appointmentId` | Patient or Admin | Cancel an appointment. |
| GET | `/appointments/:appointmentId` | Authenticated | Get an appointment the caller is allowed to view. |
| GET | `/patients/me` | Patient | Get patient profile. |
| PATCH | `/patients/me` | Patient | Update patient profile. |
| GET | `/patients/me/appointments` | Patient | List patient appointments; supports `status`, `page`, `limit`. |
| GET | `/doctors/me/profile` | Doctor | Get doctor profile, hours, and leave. |
| PATCH | `/doctors/me/profile` | Doctor | Update doctor bio and/or working hours. |
| GET | `/doctors/me/appointments` | Doctor | List doctor appointments; supports `status`, `date`, `page`, `limit`. |
| POST | `/doctors/me/leaves` | Doctor | Mark a leave date. |
| POST | `/doctors/me/appointments/:appointmentId/notes` | Doctor | Save notes, prescription, medication reminders, and complete an in-window visit. |
| POST | `/doctors/me/appointments/:appointmentId/pre-visit-summary/retry` | Doctor | Retry AI pre-visit generation. |
| POST | `/doctors/me/appointments/:appointmentId/post-visit-summary/retry` | Doctor | Retry AI post-visit generation. |
| PUT | `/doctors/me/appointments/:appointmentId/post-visit-summary` | Doctor | Publish a manual post-visit summary. |
| POST | `/admin/doctors` | Admin | Create a doctor account/profile. |
| PATCH | `/admin/doctors/:doctorId` | Admin | Update a doctor. |
| DELETE | `/admin/doctors/:doctorId` | Admin | Deactivate a doctor. |
| POST | `/admin/doctors/:doctorId/leave` | Admin | Mark a doctor leave date. |
| GET | `/admin/users` | Admin | List users. |
| PATCH | `/admin/users/:userId/deactivate` | Admin | Deactivate a user. |
| GET | `/notifications/me` | Authenticated | List current user notifications. |
| GET | `/calendar/oauth/connect` | Authenticated | Begin Google OAuth consent. |
| GET | `/calendar/oauth/callback` | Public callback | Complete Google OAuth consent. |
| DELETE | `/calendar/oauth/disconnect` | Authenticated | Remove Calendar connection. |
| GET | `/health` or `/api/v1/health` | Public | API and database health check. |

### Key request bodies

```json
POST /appointments
{ "doctorId": "uuid", "slotStart": "2026-07-14T10:00:00.000Z", "symptoms": "Fever and cough" }

PATCH /appointments/:appointmentId/reschedule
{ "slotStart": "2026-07-15T10:00:00.000Z" }

POST /doctors/me/appointments/:appointmentId/notes
{
  "doctorNotes": "Clinical notes recorded by the doctor.",
  "prescription": "Paracetamol 500 mg twice daily for 3 days.",
  "medications": [
    { "medicineName": "Paracetamol", "dosage": "500 mg", "frequency": "Twice daily", "durationDays": 3 }
  ]
}

PUT /doctors/me/appointments/:appointmentId/post-visit-summary
{
  "patientFriendlyExplanation": "Plain-language summary for the patient.",
  "followUpInstructions": "Return if symptoms worsen."
}
```

Request validation is implemented in `backend/src/modules/*/*.schema.ts`.

## Database schema

Prisma uses PostgreSQL. The full executable schema is at `backend/prisma/schema.prisma`.

| Model | Purpose | Important fields / relationships |
| --- | --- | --- |
| `User` | Authentication and account state | Unique email, hashed password, role, active state, encrypted Google refresh token. |
| `DoctorProfile` | Doctor-specific details | User, name, specialty, bio, slot duration, hours, leave, appointments. |
| `PatientProfile` | Patient-specific details | User, name, date of birth, phone, appointments. |
| `WorkingHour` | Weekly doctor availability | Doctor, weekday, start/end time; unique doctor/day. |
| `DoctorLeave` | Unavailable doctor dates | Doctor, leave date, reason; unique doctor/date. |
| `Appointment` | Booking and clinical record | Patient, doctor, slot start/end, status, symptoms, notes, prescription, summaries, calendar event. |
| `PreVisitSummary` | Gemini intake result | Urgency, concise complaint, suggested questions, status, attempts. |
| `PostVisitSummary` | Patient-facing result | Explanation, medicine schedule JSON, follow-up instructions, status, attempts. |
| `MedicationReminder` | Scheduled medication email | Medicine, dosage, frequency, next send time, end date, state. |
| `Notification` | Durable outbound email record | Recipient, appointment, type, delivery status, attempts, error, sent timestamp. |
| `CalendarEvent` | Google event sync state | Appointment, Google event ID, sync status, last sync. |
| `RefreshToken` | Revocable token record | User, token hash, expiry, revoked state. |

### Enumerations and data rules

- Roles: `ADMIN`, `DOCTOR`, `PATIENT`
- Appointment states: `BOOKED`, `COMPLETED`, `CANCELLED`, `NO_SHOW`
- Summary states: `PENDING`, `READY`, `FAILED`
- Urgency: `LOW`, `MEDIUM`, `HIGH`
- Calendar states: `SYNCED`, `PENDING`, `FAILED`, `SKIPPED`
- Notification states: `PENDING`, `SENT`, `FAILED`

`Appointment` has indexes on doctor/time, patient/time, and status. The migration named `uq_doctor_active_slot` protects appointment uniqueness at the doctor/time level; booking service logic additionally uses a PostgreSQL advisory transaction lock before writing.

## Gemini prompts

Gemini is called with `responseMimeType: application/json` and a response schema. Returned content is parsed as JSON and validated with Zod. The service retries temporary demand errors, timeouts, and malformed JSON; failed results are stored without blocking the core appointment workflow.

### Pre-visit prompt

```text
You are a clinical intake assistant. Do not diagnose or invent information. Based only on these patient-reported symptoms, return JSON with urgency (LOW, MEDIUM, or HIGH), a chiefComplaint of at most 15 words, and exactly three suggestedQuestions. Return strictly valid JSON only: no Markdown, no comments, and escape all quotation marks inside strings.

Symptoms:
<appointment.symptoms>
```

Expected JSON fields: `urgency`, `chiefComplaint`, `suggestedQuestions` (exactly three strings).

### Post-visit prompt

```text
You translate a doctor's notes into a clear patient-friendly summary. Do not add medical facts, medicines, doses, or instructions not present in the input. Return JSON with patientFriendlyExplanation, medicineSchedule, and followUpInstructions. Return strictly valid JSON only: no Markdown, no comments, and escape all quotation marks inside strings.

Doctor notes:
<appointment.doctorNotes>

Prescription:
<appointment.prescription>
```

Expected JSON fields:

- `patientFriendlyExplanation`
- `medicineSchedule`: array of `medicineName`, `dosage`, `frequency`, `durationDays`, and `instructions`
- `followUpInstructions`

## Google Calendar setup

1. Open Google Cloud Console and create or select a project.
2. Enable **Google Calendar API** for that project.
3. Configure the OAuth consent screen and add your required test users while the app is in testing.
4. Create an **OAuth 2.0 Client ID** of type **Web application**.
5. Add an authorized redirect URI matching the backend exactly:

   ```text
   Local:      http://localhost:4000/api/v1/calendar/oauth/callback
   Production: https://<render-api-domain>/api/v1/calendar/oauth/callback
   ```

6. Set these backend environment variables:

   ```text
   GOOGLE_CLIENT_ID=<client-id>
   GOOGLE_CLIENT_SECRET=<client-secret>
   GOOGLE_REDIRECT_URI=<one-of-the-authorized-redirect-uris>
   GOOGLE_TOKEN_ENCRYPTION_KEY=<base64-encoded-32-byte-key>
   ```

7. Sign in as a patient or doctor and use **Connect Calendar**. The API creates a signed, short-lived OAuth state and redirects to Google.
8. After consent, the callback exchanges the authorization code. The refresh token is AES-256-GCM encrypted before it is stored.

### Sync behavior

- Booking queues a Calendar event creation job.
- A connected doctor calendar is preferred; otherwise, a connected patient calendar is used.
- The event includes both patient and doctor as attendees and uses Google `sendUpdates: 'all'`.
- Rescheduling queues an event update; cancellation queues event deletion.
- If neither party has connected Calendar, the appointment remains valid and the Calendar record becomes `SKIPPED`.
- Calendar errors update sync status but do not undo a booking, reschedule, or cancellation.

## Required worker

The BullMQ worker executes Gemini generation, notification delivery, medication and appointment reminder scans, and Calendar synchronization. Start it alongside the API:

```bash
npm run dev
# or, after build:
npm --prefix backend run worker
```
