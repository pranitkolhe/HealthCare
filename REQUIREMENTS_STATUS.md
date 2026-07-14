# Requirements Status

## Delivered scope

| Capability | Status | Implementation summary |
| --- | --- | --- |
| Patient, doctor, and admin portals | Delivered | JWT authentication and role-based authorization protect dedicated workflows. |
| Doctor discovery and availability | Delivered | Search, specialization filtering, working hours, leave dates, and generated slots. |
| Safe appointment booking | Delivered | PostgreSQL advisory lock and partial unique index protect active doctor/time slots. |
| Cancellation and rescheduling | Delivered | Patients can cancel or select a new validated slot; notifications and calendar updates are queued. |
| Doctor consultation workflow | Delivered | Pre-visit context, notes, prescription, optional medication reminders, and visit completion. |
| Missed appointment handling | Delivered | Incomplete bookings become `NO_SHOW` 30 minutes after scheduled end and are read-only. |
| AI summaries | Delivered | Gemini structured output for pre-visit and post-visit summaries, JSON/Zod validation, retries, and failure states. |
| Manual post-visit summary | Delivered | Doctor can publish a clinician-written patient summary when AI is unavailable. |
| Notifications and reminders | Delivered | Durable notification records, booking/cancellation/reschedule emails, visit reminders, and frequency-based medication reminders. |
| Calendar integration | Delivered | Google OAuth, encrypted refresh-token storage, and queued create/update/delete event sync. |
| Security baseline | Delivered | Zod request validation, bcrypt passwords, JWT, RBAC, Helmet, CORS, compression, and rate limiting. |
| Deployment topology | Delivered | Vercel frontend, Render API + worker, Neon PostgreSQL, Redis/BullMQ, and Brevo SMTP relay. |

## Operational requirements

The following are configuration requirements, not missing product features.

- Run the API **and** the BullMQ worker in every environment using Redis.
- Run `prisma migrate deploy` before starting a newly deployed API version.
- Configure a verified Brevo sender and SMTP key on Render for production email.
- Configure a local SMTP/test-inbox provider for local notification testing.
- Set Vercel’s URL in `CORS_ORIGIN` and Render’s API URL in `VITE_API_BASE_URL`.
- Configure Gemini and Google Calendar credentials only when those integrations are enabled.

## Service behavior and boundaries

- AI can fail or be temporarily unavailable. It never blocks a booking or removes clinician-entered notes, prescription, or manual follow-up content.
- Calendar sync requires a connected doctor or patient Google account. A failed or skipped calendar sync does not cancel a valid appointment.
- Email delivery is asynchronous. Notification status is stored so delivery failures can be diagnosed and retried by the worker.
- The product is an appointment workflow tool. AI summaries are assistive and do not provide medical diagnosis or replace clinician judgement.

## Reviewer checklist

```bash
npm install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
npm --prefix backend run prisma:generate
npm --prefix backend run prisma:migrate:deploy
npm run dev
```

Verify `/health`, register a patient, create a booking, confirm that the worker receives the summary job, and use the doctor flow to complete an in-window appointment. For production readiness, confirm the API, worker, Redis, Brevo sender, Gemini key, and CORS configuration independently.
