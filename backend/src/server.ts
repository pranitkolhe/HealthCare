import app from './app';
import env from './config/env';
import logger from './config/logger';
import prisma from './config/db';
import { verifyTransport } from './shared/mailer';



async function initialiseDependencies() {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
    // Verify SMTP transport if configured
    const smtpOk = await verifyTransport();
    if (!smtpOk) {
      logger.warn('SMTP verification failed or not configured. Emails may not be sent.');
    }
  } catch (err) {
    logger.error('Database connection failed', { error: err });
  }
}

function startServer() {
  const server = app.listen(env.port, () => {
    logger.info(`Backend server listening on http://localhost:${env.port}`);
  });

  // Do not make the HTTP server disappear while a remote database is slow to
  // establish its first connection. /health remains available and the API
  // returns a normal JSON error instead of the browser reporting a CORS or
  // connection failure.
  void initialiseDependencies();

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
    server.close(() => process.exit(1));
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error });
    server.close(() => process.exit(1));
  });
}

startServer();
