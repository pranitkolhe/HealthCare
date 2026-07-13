# Requirements Status

This audit compares the current repository with `projectdoc.txt`. “Implemented” means there is a complete code path in the repository; it does not guarantee that third-party credentials or production workers are configured correctly.

| Requirement | Status | Evidence / notes |
| --- | --- | --- |
| Separate patient, doctor, and admin portals | Implemented | Role-aware frontend routes and backend authorization middleware. |
| Patient registration, login, profile, doctor search, availability, and booking | Implemented | Auth, patient, doctor, and appointment modules. |
| Admin doctor management | Implemented | Admin can create, update, deactivate, list doctors/users, and mark doctor leave. |
| Working hours, slot duration, and leave days | Implemented | `WorkingHour`, `DoctorLeave`, and `DoctorProfile` models; availability is generated from them. |
| Double-booking protection under concurrent requests | Implemented | Transaction-scoped PostgreSQL advisory lock plus partial unique index for `BOOKED` doctor/time slots. |
| Doctor leave cancels affected bookings and notifies patients | Implemented | Doctor and admin leave services cancel booked appointments and create `DOCTOR_LEAVE` notifications. |
| Pre-visit AI symptom summary | Implemented | Gemini structured JSON output is validated with Zod and stored as `PreVisitSummary`. |
| Post-visit patient-friendly AI summary | Implemented | Doctor notes/prescription trigger a validated Gemini summary; manual retry and replacement are available. |
| Graceful LLM failure handling | Implemented | Retry for transient Gemini errors, failed statuses, logging, and a post-visit fallback summary. |
| Email booking confirmation and cancellation | Implemented | Durable notifications, Nodemailer delivery service, BullMQ job type, and status tracking. |
| Appointment reminders | Implemented | The worker scans upcoming booked visits and creates durable reminder notifications. |
| Medication reminders based on prescription frequency | Implemented | Structured medicine data creates `MedicationReminder` rows; the worker schedules delivery by frequency. |
| Google Calendar OAuth 2.0 | Implemented | OAuth connect/callback/disconnect routes, encrypted refresh tokens, and OAuth state validation. |
| Google Calendar event on booking and removal on cancellation | Implemented | Calendar event record plus background sync/delete integration using `sendUpdates: 'all'`. A user must connect Google Calendar first. |
| Calendar update on reschedule | Implemented | Patient reschedule endpoint updates the appointment and queues a Google Calendar update. |
| Background work and retries | Implemented | BullMQ worker handles AI, notifications, calendar operations, and reminder scanning. A separately deployed worker is required. |
| API validation, RBAC, rate limiting, security middleware | Implemented | Zod validation, JWT authentication, role authorization, Helmet, CORS, compression, and rate-limit middleware. |
| Deployment | Implemented (provided) | Frontend: https://health-care-frontend-lemon.vercel.app/. Backend is deployed on Render; its URL is not stored in this repository. Database is hosted on Neon. |

## Deployment checklist

- [ ] Run `npm --prefix backend run prisma:migrate:deploy` on Render.
- [ ] Deploy `npm --prefix backend run worker` as a persistent Render worker service.
- [ ] Configure all values from `backend/.env.example` as Render environment variables.
- [ ] Configure Vercel `VITE_API_BASE_URL` and add the Vercel URL to `CORS_ORIGIN`.
- [ ] Rotate any SMTP credential that was ever committed to source control.

## Appointment rescheduling: current exact flow

**Who can reschedule:** only the patient who owns a `BOOKED` appointment. The route is protected by JWT authentication and the `PATIENT` role; doctors and administrators cannot use this route. Completed and cancelled appointments cannot be rescheduled.

**Current API flow:**

1. The patient sends `PATCH /api/v1/appointments/:appointmentId/reschedule` with `{ "slotStart": "<ISO-8601 date/time>" }`.
2. The service verifies ownership, that the new time is not in the past, fits the doctor’s working hours and slot duration, and is not a leave date.
3. Inside a PostgreSQL transaction, it takes an advisory lock for the new doctor/time slot, checks for another booked appointment, and updates `slotStart`/`slotEnd`.
4. The existing calendar record becomes pending and a `calendar:update` background job updates the existing Google Calendar event. Google Calendar sends event updates to attendees.
5. If another patient has already claimed that slot, the API returns the normal slot-conflict response and no appointment/calendar change occurs.

6. On success, the system creates dedicated `RESCHEDULE` notifications for both the patient and doctor. The worker emails each participant with the new time and updates the existing Google Calendar event with attendee notifications.

**Patient UI flow:** every booked appointment now shows a **Reschedule** button. The patient selects it, chooses a date, and sees that doctor’s live available slots only. Choosing a slot submits the authenticated reschedule request, refreshes the appointment list, and queues a Google Calendar update. The panel is contained in the appointment card and works on mobile and desktop.

## Doctor appointment-detail flow

The doctor dashboard lists appointments separately from the consultation detail. Selecting a patient opens a full-screen, responsive modal rather than appending details beneath the list. The modal presents patient details, symptoms, pre-visit urgency/questions, calendar state, visit notes, prescription, medication reminder controls, and post-visit summary controls. **Back to appointments** closes the modal and returns the doctor to the filterable list.

## Medication reminder flow

1. While a doctor records visit notes, they can optionally enter one medication’s name, dosage, frequency, and duration in the **Medication reminder** panel.
2. The API validates and stores this as a `MedicationReminder` associated with the completed appointment.
3. The background worker scans due reminders every minute, creates a durable `MEDICATION_REMINDER` notification, emails the patient, and advances the next reminder by 24, 12, or 8 hours for once-, twice-, or three-times-daily frequency until the end date.
4. The worker must be deployed and running separately from the API service for reminders to be delivered.

## Google Calendar connection and sync flow

The **Connect Calendar** button remains visible in both patient and doctor dashboards so a user can grant or renew OAuth access. It is **not** necessary to click it for every appointment. After a user connects once, the encrypted refresh token is stored server-side. New bookings automatically queue a calendar event; reschedules automatically update that event; cancellations automatically delete it. Google sends attendee updates through `sendUpdates: 'all'`.

The button is only needed again when a user has never connected, has disconnected access, revoked access in Google, or needs to reconnect after a failed/expired Google authorization. If neither participant has connected a calendar, the appointment remains booked and email notifications still work; the calendar record is marked skipped until a participant connects.

## Session persistence

Access tokens are short-lived, but login also sets a secure, HTTP-only refresh cookie lasting seven days. When the website is reopened, the frontend calls `/auth/refresh` and restores the session without showing the login screen. This requires the deployed Render API to use `SameSite=None; Secure` cookies and to allow the Vercel origin with credentials in CORS.

## Rate limiting and worker use cases

Rate limiting protects the public API from accidental overload, password-guessing, and abusive automation. The general limiter permits up to `RATE_LIMIT_MAX` requests per `RATE_LIMIT_WINDOW_MS` for each client IP. Authentication endpoints use the lower `AUTH_RATE_LIMIT_MAX` value, so repeated login attempts are slowed before they can become credential-stuffing attacks. Standard `RateLimit-*` response headers tell clients when the limit resets.

The worker is a separate long-running BullMQ process. It keeps slow or unreliable work—Gemini calls, SMTP delivery, Google Calendar requests, retries, and reminder scans—out of the web request. The API can respond quickly after a booking commits, while Redis retains the job until the worker processes it. This separation lets the API scale independently from background throughput.

## Vacant-slot notifications

When a patient cancels, the slot immediately becomes available because only `BOOKED` records participate in the slot uniqueness rule. The application intentionally does not email every other patient about a cancellation: that would be unsolicited marketing/health-related messaging and exposes appointment patterns. The safe future flow is an explicit, specialty/date-based waitlist where a patient opts in, verifies notification preferences, and receives one relevant availability alert.
