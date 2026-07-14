# HealthCare Appointment & Follow-up Manager

A full-stack clinic workflow application for booking appointments, preparing clinicians for visits, publishing patient-friendly follow-up information, and managing operational notifications.

**Live application:** https://health-care-frontend-lemon.vercel.app/

**Demo administrator:** `pranitkolhe3@gmail.com`  
**Password:** `Admin@1234`

## Highlights

- Role-specific patient, doctor, and administrator portals
- Doctor search, availability, booking, cancellation, and rescheduling
- Database-level protection against double booking
- AI-assisted pre-visit intake and post-visit summaries with safe fallbacks
- Appointment, medication, cancellation, and reschedule email notifications
- Google Calendar OAuth and appointment event synchronization
- Missed-appointment lifecycle with automatic `NO_SHOW` handling

## Technology

| Area | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, Axios, React Router |
| Backend | Node.js, Express 5, TypeScript, Zod |
| Data | PostgreSQL / Neon, Prisma ORM |
| Background work | Redis, BullMQ, separate worker process |
| Authentication & security | JWT, bcrypt, Helmet, CORS, rate limiting, compression |
| AI | Google Gemini structured JSON responses, validated with Zod |
| Email | Nodemailer; local SMTP in development and Brevo SMTP relay in production |
| Calendar | Google Calendar API and OAuth 2.0 |
| Hosting | Vercel (frontend), Render (API and worker), Neon (PostgreSQL) |

## Core workflows

### Appointment lifecycle

1. A patient selects a doctor, an available slot, and enters symptoms.
2. The API confirms the slot inside a PostgreSQL transaction. An advisory lock and partial unique index prevent concurrent bookings for the same doctor and time.
3. The system creates durable notification, calendar, and AI-summary records. The worker processes them outside the web request.
4. The doctor reviews the pre-visit intake, records notes and prescription, and completes the visit during its scheduled window.
5. Gemini produces a patient-friendly post-visit summary. If AI is unavailable, the doctor can publish a manual summary and the patient still receives the clinician-entered prescription and follow-up information.
6. A booked appointment that remains incomplete for 30 minutes after its scheduled end is marked `NO_SHOW`. It becomes read-only and cannot create medication reminders or post-visit content.

### AI safety and resilience

Gemini is an assistive feature, not a clinical decision-maker. Pre-visit prompts use only patient-reported symptoms. Post-visit prompts must not add facts, medicines, doses, or instructions beyond the doctor’s notes and prescription. Outputs are parsed as strict JSON, schema-validated, retried for transient provider errors, and recorded as `READY` or `FAILED` without blocking booking or clinician-entered care information.

## Local development

### Prerequisites

- Node.js 20+
- PostgreSQL database (local or Neon)
- Redis (optional only when background jobs are not required; required for normal AI, email, calendar, and reminder processing)
- Gemini API key for AI summaries
- SMTP credentials for email
- Google OAuth credentials for Calendar integration

### Setup

```bash
npm install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
npm --prefix backend run prisma:generate
npm --prefix backend run prisma:migrate:deploy
npm --prefix backend exec prisma db seed
npm run dev
```

`npm run dev` starts the API, BullMQ worker, and Vite frontend together. The worker terminal is where AI and email job logs appear.

For a production build:

```bash
npm run build
npm run start:all
```

## Environment configuration

Use the committed example files as templates. Do not commit `.env` files, SMTP passwords, API keys, JWT secrets, or OAuth client secrets.

| Group | Required variables | Purpose |
| --- | --- | --- |
| Database | `DATABASE_URL`, optional `DIRECT_URL` | PostgreSQL / Neon connection |
| Auth | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Minimum 32-character JWT secrets |
| Web | `PORT`, `CORS_ORIGIN`, `COOKIE_DOMAIN` | API listener and browser access |
| Queue | `REDIS_URL` | BullMQ queue and worker connection |
| AI | `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_TIMEOUT_MS` | Structured summary generation |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Nodemailer transport |
| Calendar | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_ENCRYPTION_KEY` | OAuth and encrypted refresh tokens |

### Email environments

The application uses one Nodemailer SMTP transport configured entirely by environment variables.

- **Local development:** use a normal SMTP provider or a test inbox such as Mailtrap. Set `SMTP_*` to local-development credentials.
- **Render / production:** use Brevo SMTP relay. Set `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, `SMTP_USER` to the Brevo SMTP login, `SMTP_PASS` to a Brevo SMTP key, and `EMAIL_FROM` to a sender verified in Brevo.

Brevo credentials belong only in Render environment variables. Never use a personal mailbox password or expose a Brevo SMTP key in source control.

## Deployment

Deploy the frontend to Vercel and configure `VITE_API_BASE_URL` with the Render API URL. Deploy the API and worker as separate long-running Render services from the same repository:

| Service | Build command | Start command |
| --- | --- | --- |
| API | `npm run build` | `npm --prefix backend run start` |
| Worker | `npm run build` | `npm --prefix backend run worker` |

Before release, run Prisma migrations, configure all backend environment variables on Render, set the Vercel origin in `CORS_ORIGIN`, and configure the deployed API URL in Vercel. The worker is mandatory when Redis is configured; without it, queued AI, email, calendar, and reminder jobs remain pending.

## Google Calendar

Create a Google OAuth web application, enable the Google Calendar API, and register the exact callback URL:

```text
https://<render-api>/api/v1/calendar/oauth/callback
```

For local development use `http://localhost:4000/api/v1/calendar/oauth/callback`. A connected doctor calendar is preferred; otherwise a connected patient calendar is used. Refresh tokens are encrypted before persistence and never returned to the browser.

## API and project structure

All API routes are prefixed with `/api/v1`; protected routes require `Authorization: Bearer <accessToken>`.

```text
backend/src/modules/     Domain routes, controllers, validation, and services
backend/src/jobs/        BullMQ queue and worker
backend/prisma/          Prisma schema, migrations, and seed
frontend/src/modules/    Role-specific React screens and API clients
```

Key route groups include `/auth`, `/appointments`, `/doctors`, `/patients`, `/admin`, `/notifications`, and `/calendar`. See the route and schema files beside each backend module for request details.

## Documentation

- [Requirements status](REQUIREMENTS_STATUS.md) — delivered scope, operational behavior, and known dependencies.
- [Implementation guide](IMPLEMENTATION_GUIDE.md) — architecture and key engineering decisions.
- [Technical reference](TECHNICAL_REFERENCE.md) — API routes, database schema, Gemini prompts, and Google Calendar setup.
- [System design](SYSTEM_DESIGN.md) — double-booking, leave conflicts, slot reservation, and notification reliability.

## Demo administrator

The development seed creates an administrator account. See `backend/prisma/seed.ts` for current seed data. Change seeded credentials before any public deployment.
