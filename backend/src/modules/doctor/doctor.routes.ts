import { Router } from 'express';
import * as doctorController from './doctor.controller';
import { validate } from '../../middlewares/validate';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { searchDoctorsSchema, availabilitySchema, listAppointmentsSchema, noteSchema, updateAvailabilitySchema, doctorLeaveSchema, manualPostVisitSummarySchema } from './doctor.schema';

const router = Router();

router.get('/doctors', authenticate, validate(searchDoctorsSchema, 'query'), doctorController.searchDoctors);
router.get('/doctors/:doctorId/availability', authenticate, validate(availabilitySchema, 'query'), doctorController.getAvailability);
router.get('/doctors/:doctorId/schedule', authenticate, doctorController.getSchedule);
router.get('/doctors/me/appointments', authenticate, authorize('DOCTOR'), validate(listAppointmentsSchema, 'query'), doctorController.listAppointments);
router.get('/doctors/me/profile', authenticate, authorize('DOCTOR'), doctorController.getProfile);
router.patch('/doctors/me/profile', authenticate, authorize('DOCTOR'), validate(updateAvailabilitySchema, 'body'), doctorController.updateAvailability);
router.post('/doctors/me/leaves', authenticate, authorize('DOCTOR'), validate(doctorLeaveSchema, 'body'), doctorController.markLeave);
router.post('/doctors/me/appointments/:appointmentId/notes', authenticate, authorize('DOCTOR'), validate(noteSchema, 'body'), doctorController.addNotes);
router.post('/doctors/me/appointments/:appointmentId/pre-visit-summary/retry', authenticate, authorize('DOCTOR'), doctorController.retryPreVisitSummary);
router.post('/doctors/me/appointments/:appointmentId/post-visit-summary/retry', authenticate, authorize('DOCTOR'), doctorController.retryPostVisitSummary);
router.put('/doctors/me/appointments/:appointmentId/post-visit-summary', authenticate, authorize('DOCTOR'), validate(manualPostVisitSummarySchema, 'body'), doctorController.saveManualPostVisitSummary);

export default router;
