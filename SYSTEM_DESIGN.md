# System Design Write-up

## Purpose

HealthCare is an appointment workflow system with patient, doctor, and administrator roles. Its design prioritizes correctness of appointment state over optimistic user-interface availability. PostgreSQL is the source of truth; Redis/BullMQ handles work that should not delay a booking response, including email, AI summaries, Calendar synchronization, and reminders.

## Double-booking prevention

Showing a slot as available is not enough to reserve it: two patients can see the same slot and submit at nearly the same time. The booking service therefore treats availability as a convenience and performs the final check inside PostgreSQL.

When a patient confirms a booking, the API opens a transaction and acquires a transaction-scoped PostgreSQL advisory lock derived from the doctor ID and requested start time. Requests for the same doctor and slot serialize at this point. The service then rechecks for an active `BOOKED` appointment, validates the doctor’s working hours and leave dates, and inserts the appointment only if the slot is still free.

The database also has a partial unique index for an active doctor/time slot. This is the final safety net if application instances, retries, or future code paths bypass the normal service flow. If a conflict still occurs, the API returns a normal slot-conflict response and the patient can select another time. A cancelled appointment does not participate in the active-slot rule, so its slot can be reused safely.

## Doctor leave conflict handling

Availability generation excludes leave dates before a patient sees slots. Booking independently validates leave dates again, because a doctor can be placed on leave after a patient loads the availability screen.

When an administrator or doctor records leave, the service uses a database transaction to find that doctor’s booked appointments for the affected UTC day, cancel them, and create a durable `DOCTOR_LEAVE` notification for every affected patient. The transaction ensures the state change and corresponding notification records succeed together. Delivery is performed only after the transaction commits, preventing an email from claiming a cancellation that did not persist.

The system also rejects new bookings that conflict with leave. Existing completed, cancelled, or no-show appointments are not changed by the leave workflow. This preserves a clear audit trail while protecting future care commitments.

## Slot-hold mechanism

The application intentionally does not use a temporary slot-hold table or countdown reservation. Temporary holds need expiry workers, cleanup logic, abuse protection, and rules for abandoned browser sessions. They can also reduce availability for patients who are ready to confirm.

Instead, the system uses **atomic confirmation-time reservation**. A slot is not reserved while a patient is browsing. It is reserved only when the booking request reaches the transaction described above. If another patient confirms first, the second request receives a conflict response. This approach is simpler, leaves no abandoned reservations, and provides strong consistency at the point where it matters: creating the appointment.

## Notification failure handling

Notifications are durable records, not direct side effects of HTTP requests. During booking, cancellation, rescheduling, leave handling, and reminder scans, the system first writes a `Notification` row with status `PENDING`. The web request can then complete once the core appointment transaction is safely committed.

BullMQ queues notification-delivery jobs in Redis. A separate worker sends email through Nodemailer—using local SMTP during development and Brevo SMTP relay in production—and updates the notification to `SENT` with a timestamp when delivery succeeds. If delivery fails, the worker records `FAILED`, increments the attempt count, and stores the error message. Queue jobs have retry attempts and exponential backoff for transient failures.

This separation means an SMTP outage cannot undo a booking, cancellation, or clinical record. It also provides operational visibility: staff can inspect pending or failed notification records and worker logs, then restore SMTP/Redis connectivity and retry work without corrupting appointment state. The API and worker are deployed as separate processes; monitoring both is required because queued jobs remain pending if the worker is unavailable.

## Result

The design combines immediate transactional correctness for appointments with asynchronous resilience for external services. PostgreSQL protects booking integrity, transactions preserve leave consistency, atomic confirmation avoids fragile temporary holds, and durable queued notifications isolate email reliability from patient-care workflows.
