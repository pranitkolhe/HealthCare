import { Queue } from 'bullmq';
import env from '../config/env';
import logger from '../config/logger';

export type BackgroundJobName = 'ai:pre-visit' | 'ai:post-visit' | 'notification:deliver' | 'calendar:sync' | 'calendar:delete';

type BackgroundJobData = { appointmentId?: string; notificationId?: string };

let queue: Queue<any> | null = null;

function redisConnectionOptions() {
  if (!env.redisUrl) throw new Error('REDIS_URL is required');
  const url = new URL(env.redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

function getQueue() {
  if (!env.redisUrl) return null;
  if (!queue) {
    queue = new Queue<any>('healthcare-background', { connection: redisConnectionOptions() });
  }
  return queue;
}

export async function enqueueBackgroundJob(name: BackgroundJobName, data: BackgroundJobData) {
  const backgroundQueue = getQueue();
  if (!backgroundQueue) return false;
  const attempts = name.startsWith('notification') ? 5 : 3;
  try {
    await Promise.race([
      backgroundQueue.add(name, data, { attempts, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 500, removeOnFail: 500 }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Redis queue connection timed out')), 2000)),
    ]);
    return true;
  } catch (error) {
    logger.warn('Background job was not queued; using in-process fallback', { name, error: error instanceof Error ? error.message : error });
    return false;
  }
}

export const getWorkerConnection = redisConnectionOptions;
