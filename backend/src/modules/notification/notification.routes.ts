import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { listMine } from './notification.controller';

const router = Router();

router.get('/notifications/me', authenticate, listMine);

export default router;
