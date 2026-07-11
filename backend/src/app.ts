import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import env from './config/env';
import logger from './config/logger';
import { errorHandler } from './middlewares/errorHandler';
import prisma from './config/db';
import authRoutes from './modules/auth/auth.routes';
import adminRoutes from './modules/admin/admin.routes';
import doctorRoutes from './modules/doctor/doctor.routes';
import patientRoutes from './modules/patient/patient.routes';
import appointmentRoutes from './modules/appointment/appointment.routes';
import notificationRoutes from './modules/notification/notification.routes';
import calendarRoutes from './modules/calendar/calendar.routes';

const app = express();

app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

app.use('/api/v1', authRoutes);
app.use('/api/v1', adminRoutes);
app.use('/api/v1', doctorRoutes);
app.use('/api/v1', patientRoutes);
app.use('/api/v1', appointmentRoutes);
app.use('/api/v1', notificationRoutes);
app.use('/api/v1', calendarRoutes);

async function healthCheck(_req: express.Request, res: express.Response) {
  let dbConnected = false;
  try {
    // lightweight connectivity check
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    await prisma.$queryRaw`SELECT 1`;
    dbConnected = true;
  } catch (err) {
    dbConnected = false;
  }
  res.json({ status: 'ok', dbConnected, timestamp: new Date().toISOString() });
}

app.get('/api/v1/health', healthCheck);
app.get('/health', healthCheck);

app.use(errorHandler);

export default app;
