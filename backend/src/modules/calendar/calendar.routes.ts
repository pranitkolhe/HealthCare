import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import * as controller from './calendar.controller';

const router = Router();
router.get('/calendar/oauth/connect', authenticate, controller.connect);
router.get('/calendar/oauth/callback', controller.callback);
router.delete('/calendar/oauth/disconnect', authenticate, controller.disconnect);
export default router;
