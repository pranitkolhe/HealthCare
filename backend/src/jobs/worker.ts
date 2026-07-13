import { Worker } from 'bullmq';
import logger from '../config/logger';
import { generatePostVisitSummary, generatePreVisitSummary } from '../modules/integrations/ai.service';
import { removeAppointmentFromCalendar, syncAppointmentToCalendar, updateAppointmentOnCalendar } from '../modules/integrations/calendar.service';
import { deliverNotification } from '../modules/integrations/notification.service';
import { scanDueReminders } from '../modules/integrations/reminder.service';
import { getWorkerConnection } from './queues';

const worker = new Worker('healthcare-background', async (job) => {
  switch (job.name) {
    case 'ai:pre-visit':
      if (job.data.appointmentId) await generatePreVisitSummary(job.data.appointmentId);
      break;
    case 'ai:post-visit':
      if (job.data.appointmentId) await generatePostVisitSummary(job.data.appointmentId);
      break;
    case 'notification:deliver':
      if (job.data.notificationId) await deliverNotification(job.data.notificationId);
      break;
    case 'calendar:sync':
      if (job.data.appointmentId) await syncAppointmentToCalendar(job.data.appointmentId);
      break;
    case 'calendar:update':
      if (job.data.appointmentId) await updateAppointmentOnCalendar(job.data.appointmentId);
      break;
    case 'calendar:delete':
      if (job.data.appointmentId) await removeAppointmentFromCalendar(job.data.appointmentId);
      break;
    case 'reminders:scan':
      await scanDueReminders();
      break;
    default:
      throw new Error(`Unknown background job: ${job.name}`);
  }
}, { connection: getWorkerConnection(), concurrency: 5 });

worker.on('ready', () => logger.info('Background worker connected to Redis'));
worker.on('failed', (job, error) => logger.error('Background job failed', { jobId: job?.id, name: job?.name, error: error.message }));

process.on('SIGTERM', async () => { await worker.close(); process.exit(0); });
process.on('SIGINT', async () => { await worker.close(); process.exit(0); });

void scanDueReminders().catch((error) => logger.error('Initial reminder scan failed', { error }));
setInterval(() => void scanDueReminders().catch((error) => logger.error('Reminder scan failed', { error })), 60_000).unref();
