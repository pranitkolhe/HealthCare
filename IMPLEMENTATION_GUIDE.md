# Implementation Guide

## Architecture

This application uses React, Vite, TypeScript, and TanStack Query in the browser; Express 5 and TypeScript in the API; Prisma with PostgreSQL/Neon for durable data; Redis and BullMQ for asynchronous work; Gemini for structured AI summaries; Nodemailer for email; and Google Calendar API with OAuth 2.0 for calendar invitations. Vercel hosts the SPA and Render hosts the API. A separate Render worker process should run the BullMQ consumer.

The React client is split by patient, doctor, admin, and authentication modules. TanStack Query keeps remote data cached and invalidates lists after booking, cancellation, or profile changes. The Express API follows the same module boundaries: routes validate input, controllers translate HTTP concerns, services hold business rules, and Prisma persists state. JWT authentication identifies the user and role middleware limits sensitive actions to the relevant portal.

## Booking integrity and leave handling

Availability is calculated from each doctor’s working hours, slot duration, leave dates, and existing booked appointments. It is only a user-interface guide; it is not trusted as the final protection against races.

On booking, the API starts a database transaction and takes a PostgreSQL advisory transaction lock derived from the doctor ID and start time. It checks again for a booked appointment and inserts the appointment only when the slot remains available. A partial unique database index on `(doctorId, slotStart)` where status is `BOOKED` is the final concurrency safeguard. This layered approach prevents simultaneous requests from creating duplicate active bookings while allowing a cancelled slot to be reused.

When a doctor is marked on leave, the service finds booked appointments for that UTC day inside the same transaction, cancels them, and writes durable `DOCTOR_LEAVE` notifications for affected patients. The notifications are delivered after the transaction commits, so no message claims an appointment changed when the database change failed.

There is no temporary “slot hold” table. The application uses atomic confirm-time booking instead: a displayed slot can be claimed by another patient first, in which case the requester receives a slot-conflict response and chooses another time. This avoids abandoned hold records and keeps the reservation model simple.

## AI, notifications, and Calendar

Booking creates a pending pre-visit summary. A BullMQ job calls Gemini with a constrained prompt and requests JSON. Zod validates urgency, a concise complaint, and exactly three doctor questions before the result is stored. After a doctor records notes and prescription, another job produces the patient-facing explanation, medicine schedule, and follow-up instructions. Transient model failures are retried. A failed post-visit result preserves a safe fallback based on the clinician’s recorded information, so AI availability never blocks the core care workflow.

Email is represented as a durable `Notification` record before delivery. BullMQ performs delivery through Nodemailer and records sent/failed state, attempt count, timestamp, and error text. This separation lets booking return promptly and gives the UI a delivery status. The background queue also handles calendar create/delete and AI work. For reliability in production, deploy the worker independently from the Render web service and monitor its logs/Redis connection.

Google Calendar starts with an authenticated connect endpoint that creates a signed, short-lived OAuth state. The callback exchanges the authorization code, encrypts the refresh token with AES-256-GCM, and stores it with the selected calendar. On booking, a calendar job creates an event with both participant email addresses and asks Google to send updates. On cancellation, the matching event is deleted. Refresh tokens are never returned to the browser.

## Scaling and operational value

The API stays responsive because expensive or failure-prone work is queued rather than performed inline. API instances can scale horizontally because PostgreSQL remains the source of truth, advisory locks coordinate simultaneous writers, and Redis distributes background jobs. Prisma keeps database access typed and migrations versioned. Role checks, input validation, Helmet, CORS, rate limiting, encrypted calendar tokens, and structured logging provide a baseline suitable for extending the platform.

Current extension points are deliberately visible: `MedicationReminder` exists in the schema but needs a repeatable worker/scheduler and prescription-to-reminder extraction; appointment reminders need a scheduled job; and rescheduling needs an API plus Google Calendar event update. Adding these features through the existing notification and queue boundaries preserves the same scalable architecture.
