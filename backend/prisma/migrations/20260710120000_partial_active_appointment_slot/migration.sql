-- A cancelled appointment must release its slot for a new booking. The
-- previous migration created an unconditional unique constraint, which made
-- cancellation permanently block that doctor/time pair.
DROP INDEX IF EXISTS "uq_doctor_active_slot";

CREATE UNIQUE INDEX "uq_doctor_active_slot"
ON "Appointment" ("doctorId", "slotStart")
WHERE "status" = 'BOOKED';
