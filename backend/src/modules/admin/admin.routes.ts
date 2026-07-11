import { Router } from 'express';
import * as adminController from './admin.controller';
import { validate } from '../../middlewares/validate';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { createDoctorSchema, updateDoctorSchema, markLeaveSchema, listUsersSchema } from './admin.schema';

const router = Router();

router.post('/admin/doctors', authenticate, authorize('ADMIN'), validate(createDoctorSchema, 'body'), adminController.createDoctor);
router.patch('/admin/doctors/:doctorId', authenticate, authorize('ADMIN'), validate(updateDoctorSchema, 'body'), adminController.updateDoctor);
router.delete('/admin/doctors/:doctorId', authenticate, authorize('ADMIN'), adminController.deleteDoctor);
router.post('/admin/doctors/:doctorId/leave', authenticate, authorize('ADMIN'), validate(markLeaveSchema, 'body'), adminController.markLeave);
router.get('/admin/users', authenticate, authorize('ADMIN'), validate(listUsersSchema, 'query'), adminController.listUsers);
router.patch('/admin/users/:userId/deactivate', authenticate, authorize('ADMIN'), adminController.deactivateUser);

export default router;
