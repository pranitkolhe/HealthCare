# Healthcare Appointment & Follow-up Manager

A full-stack clinic workflow application for patient appointment booking, doctor preparation, follow-up communication, and clinic administration.

**Live frontend:** https://health-care-frontend-lemon.vercel.app/

The frontend is deployed on Vercel, the API on Render, and PostgreSQL on Neon. Configure the deployed Vercel app with the Render API URL through `VITE_API_BASE_URL`; the Render service must allow the Vercel origin in `CORS_ORIGIN`.

## What this project solves

Patients can find a doctor, select an available time slot, describe symptoms, and receive confirmation. Doctors receive an AI-generated pre-visit intake summary, manage availability/leave, and turn visit notes into a patient-friendly follow-up summary. Administrators onboard and manage doctors. The platform protects a slot from concurrent booking attempts and records notifications/calendar-sync states for operational visibility.

## Portals and primary use cases

| Role | Primary use case |
| --- | --- |
| Patient | Register, maintain profile, search/filter doctors, view availability, book/cancel appointments, see summaries/notifications, and connect Google Calendar. |
| Doctor | Manage profile and working hours, view appointments and pre-visit summaries, add notes/prescriptions, generate/retry post-visit summaries, mark leave, and connect Google Calendar. |
| Admin | Create/update/deactivate doctor accounts, view users, and mark doctor leave. |

## Demo administrator

The Prisma seed creates this development/demo account:

```text
Email: pranitkolhe3@gmail.com
Password: Admin@1234
```

Run `npm --prefix backend exec prisma db seed` after migrations to create or reactivate it. Change this password and do not use these credentials for a public production account.

## Local setup

Prerequisites: Node.js 20+, PostgreSQL (or a Neon database), Redis for background jobs, a Gemini API key, SMTP credentials, and Google OAuth credentials for Calendar.

```bash
npm install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
npm --prefix backend run prisma:generate
npm --prefix backend run prisma:migrate:deploy
npm --prefix backend exec prisma db seed
npm run dev
```

Start the worker separately in the current project state:

```bash
npm --prefix backend run dev:worker
```

For a production build:

```bash
npm run build
npm --prefix backend run start
npm --prefix backend run worker
```

Run the API and worker as separate Render services/processes. The worker is required whenever `REDIS_URL` is configured, because it consumes AI, email, and calendar jobs.

## Configuration

`backend/.env` requires:

- `DATABASE_URL` and optional `DIRECT_URL`: Neon/PostgreSQL URLs.
- JWT secrets of at least 32 characters.
- `CORS_ORIGIN`: comma-separated browser origins, including the Vercel URL.
- `REDIS_URL`: BullMQ/Redis connection.
- `GEMINI_API_KEY`, `GEMINI_MODEL`, and timeout settings.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM`.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and a base64-encoded 32-byte `GOOGLE_TOKEN_ENCRYPTION_KEY`.

`frontend/.env` requires `VITE_API_BASE_URL`, for example `https://your-render-service.onrender.com/api/v1`.

Never commit real credentials. Rotate the SMTP password shown in the current example file before publishing the repository.

## Google Calendar setup

1. In Google Cloud, create an OAuth 2.0 Web application and enable Google Calendar API.
2. Add the exact backend callback URL as an authorized redirect URI: `https://<render-api>/api/v1/calendar/oauth/callback` (local: `http://localhost:4000/api/v1/calendar/oauth/callback`).
3. Set the Google variables in the Render backend environment.
4. Log in as a patient or doctor and select **Connect Calendar**.
5. Grant calendar-event permission. Future booked appointments are synced; Google sends invitations using Calendar’s update notifications.

Refresh tokens are encrypted before storage. Calendar events are created in the connected doctor’s calendar first; if the doctor is not connected, the connected patient’s calendar is used.

## API overview

All API routes start with `/api/v1`. Protected endpoints require `Authorization: Bearer <accessToken>`.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/register`, `/auth/login`, `/auth/logout`, `/auth/change-password` |
| Patient | `GET/PATCH /patients/me`, `GET /patients/me/appointments` |
| Doctors | `GET /doctors`, `GET /doctors/:doctorId/availability`, `GET /doctors/:doctorId/schedule`, and protected `/doctors/me/*` profile, leave, appointment-summary routes |
| Appointments | `POST /appointments`, `DELETE /appointments/:appointmentId`, `GET /appointments/:appointmentId` |
| Admin | `/admin/doctors`, `/admin/users`, and user-deactivation routes |
| Notifications | `GET /notifications/me` |
| Calendar | `GET /calendar/oauth/connect`, `GET /calendar/oauth/callback`, `DELETE /calendar/oauth/disconnect` |

Request schemas are defined beside each module in `backend/src/modules/*/*.schema.ts`.

## Data model

Prisma models include `User`, `DoctorProfile`, `PatientProfile`, `WorkingHour`, `DoctorLeave`, `Appointment`, `PreVisitSummary`, `PostVisitSummary`, `Notification`, `CalendarEvent`, `MedicationReminder`, and `RefreshToken`. See `backend/prisma/schema.prisma` for field-level definitions and migrations.

## AI prompts and safety

Pre-visit processing instructs Gemini to use only patient-reported symptoms and return urgency, a chief complaint, and exactly three doctor questions. Post-visit processing instructs it not to add clinical facts, medicines, doses, or instructions beyond the doctor’s notes/prescription. Responses are schema-validated with Zod; failures are stored and do not prevent booking or access to clinician-entered information.

## Rate limiting and background worker

The API applies a general IP-based rate limit and a stricter authentication limit. This reduces accidental overload and protects login routes from password-guessing. Limits are configured through `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, and `AUTH_RATE_LIMIT_MAX` and are returned in standard rate-limit headers.

The BullMQ worker is required in development and production. It executes AI summaries, email delivery/retries, Google Calendar synchronization, appointment reminders, and medication reminders outside the HTTP request path. Start it with `npm --prefix backend run dev:worker` locally or `npm --prefix backend run worker` after building on Render.

## Documentation deliverables

- [REQUIREMENTS_STATUS.md](REQUIREMENTS_STATUS.md): requirement-by-requirement implementation checklist and operational flows.
- [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md): system design write-up (under 800 words) covering booking conflicts, leave handling, slot confirmation, and notification reliability.
