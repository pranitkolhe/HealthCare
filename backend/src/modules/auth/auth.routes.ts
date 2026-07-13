import { Router } from 'express';
import * as authController from './auth.controller';
import { validate } from '../../middlewares/validate';
import { loginSchema, registerSchema, changePasswordSchema } from './auth.schema';
import { authenticate } from '../../middlewares/authenticate';

const router = Router();

router.post('/auth/register', validate(registerSchema, 'body'), authController.register);
router.post('/auth/login', validate(loginSchema, 'body'), authController.login);
router.post('/auth/logout', authController.logout);
router.post('/auth/change-password', authenticate, validate(changePasswordSchema, 'body'), authController.changePassword);

export default router;
