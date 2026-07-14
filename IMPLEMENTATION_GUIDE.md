# Implementation Guide

## Architecture

HealthCare is a TypeScript full-stack application. The React/Vite frontend is organized by patient, doctor, administrator, and authentication modules. The Express API uses the same domain boundaries: routes validate input, controllers handle HTTP concerns, services enforce business rules, and Prisma persists data in PostgreSQL. TanStack Query manages frontend server state; BullMQ and Redis move slow, failure-prone work out of HTTP requests.

The production topology is Vercel for the browser application, Render for the API and a separate worker process, Neon for PostgreSQL, Redis for BullMQ, Gemini for AI, Brevo for production SMTP relay, and Google Calendar for calendar sync. Local development uses the same Nodemailer SMTP integration with local or test SMTP credentials.

## Booking integrity

Availability is informative; the database makes the final decision. Booking opens a PostgreSQL transaction, takes an advisory lock derived from doctor and slot, rechecks availability, and inserts only if the appointment remains free. A partial unique index for `BOOKED` appointments is the final safeguard. This combination prevents duplicate active bookings under concurrent requests while letting a cancelled slot be reused.

Working hours, slot duration, existing bookings, and leave dates determine visible availability. Doctor or administrator leave actions cancel affected booked appointments and create durable notifications after the transaction succeeds.

## Visit and summary workflow

Booking creates a pending pre-visit summary. A worker sends patient symptoms to Gemini with a constrained prompt and expects JSON containing urgency, a concise complaint, and clinician follow-up questions. The response is normalized for code fences, parsed as JSON, validated by Zod, and retried for provider timeouts, demand errors, and malformed responses.

During the appointment window, a doctor records notes, prescription, and optional medication-reminder details. This completes the appointment and queues a post-visit summary. Gemini is instructed to use only the recorded notes and prescription. If AI fails, the patient still sees a safe clinician-based fallback and the doctor can publish a manual patient summary. A booked appointment left incomplete for 30 minutes after its end becomes `NO_SHOW` and is no longer actionable.

## Notifications, email, and Calendar

Notifications are written to PostgreSQL before delivery. The worker sends them through Nodemailer and records delivery status, attempt count, timestamp, and failure details. This covers booking, cancellation, reschedule, appointment, and medication reminders. Local environments use normal SMTP/test-inbox credentials; Render uses Brevo SMTP credentials through the same `SMTP_*` variables. Medication emails include the saved medicine schedule and prescription when available.

Google Calendar uses OAuth 2.0. The callback exchanges the code and stores encrypted refresh tokens. Calendar jobs create, update, or delete events asynchronously and notify attendees through Google. Calendar failure is isolated from the booking transaction.

## Security and operations

Passwords are hashed with bcrypt. JWT authentication, RBAC, Zod validation, Helmet, CORS, compression, and rate limiting protect the API baseline. Calendar refresh tokens are encrypted before storage. Logs are structured with Winston; secrets and tokens must never be logged.

The API and worker should be monitored separately. If Redis is configured but the worker is not running, queued summaries, email, reminders, and calendar jobs will remain pending. Database migrations must run before a new API version starts. See [README.md](README.md) for configuration and deployment commands.
