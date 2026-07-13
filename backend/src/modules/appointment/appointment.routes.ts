import { Router } from 'express';
import * as appointmentController from './appointment.controller';
import { validate } from '../../middlewares/validate';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { createAppointmentSchema, cancelAppointmentSchema, rescheduleAppointmentSchema } from './appointment.schema';

const router = Router();

router.post('/appointments', authenticate, authorize('PATIENT'), validate(createAppointmentSchema, 'body'), appointmentController.createAppointment);
router.patch('/appointments/:appointmentId/reschedule', authenticate, authorize('PATIENT'), validate(rescheduleAppointmentSchema, 'body'), appointmentController.rescheduleAppointment);
router.delete('/appointments/:appointmentId', authenticate, authorize('PATIENT', 'ADMIN'), validate(cancelAppointmentSchema, 'body'), appointmentController.cancelAppointment);
router.get('/appointments/:appointmentId', authenticate, appointmentController.getAppointment);

export default router;
