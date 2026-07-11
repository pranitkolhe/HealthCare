import { Router } from 'express';
import * as appointmentController from './appointment.controller';
import { validate } from '../../middlewares/validate';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { createAppointmentSchema, cancelAppointmentSchema } from './appointment.schema';

const router = Router();

router.post('/appointments', authenticate, authorize('PATIENT'), validate(createAppointmentSchema, 'body'), appointmentController.createAppointment);
router.delete('/appointments/:appointmentId', authenticate, authorize('PATIENT', 'ADMIN'), validate(cancelAppointmentSchema, 'body'), appointmentController.cancelAppointment);
router.get('/appointments/:appointmentId', authenticate, appointmentController.getAppointment);

export default router;
