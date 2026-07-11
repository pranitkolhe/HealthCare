import { Router } from 'express';
import * as patientController from './patient.controller';
import { validate } from '../../middlewares/validate';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { updatePatientSchema, listAppointmentsSchema } from './patient.schema';

const router = Router();

router.get('/patients/me', authenticate, authorize('PATIENT'), patientController.getProfile);
router.patch('/patients/me', authenticate, authorize('PATIENT'), validate(updatePatientSchema, 'body'), patientController.updateProfile);
router.get('/patients/me/appointments', authenticate, authorize('PATIENT'), validate(listAppointmentsSchema, 'query'), patientController.listAppointments);

export default router;
