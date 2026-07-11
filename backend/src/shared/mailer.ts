import nodemailer from 'nodemailer';
import env from '../config/env';
import logger from '../config/logger';

const transportOptions: any = {};
if (env.smtpHost) transportOptions.host = env.smtpHost;
if (env.smtpPort) transportOptions.port = env.smtpPort;
transportOptions.secure = env.smtpPort === 465; // true for 465, false for other ports

if (env.smtpUser && env.smtpPass) {
  transportOptions.auth = { user: env.smtpUser, pass: env.smtpPass };
}

// const transporter = nodemailer.createTransport(transportOptions);
const transporter = nodemailer.createTransport({
  ...transportOptions,
  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 30000,
});

export async function sendMail(to: string, subject: string, text?: string, html?: string) {
  const from = env.emailFrom || 'no-reply@localhost';
  try {
    const result = await transporter.sendMail({ from, to, subject, text, html });
    logger.info('Email sent', { to, subject, messageId: (result as any).messageId });
    return result;
  } catch (err) {
    logger.error('Failed to send email', { to, subject, error: err });
    throw err;
  }
}

export default { sendMail };

export async function verifyTransport() {
  try {
    await transporter.verify();

    logger.info("SMTP transport verified successfully");

    return true;
  } catch (err: any) {
    logger.error("SMTP transport verification failed", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      syscall: err?.syscall,
      address: err?.address,
      port: err?.port,
      command: err?.command,
      stack: err?.stack,
    });

    return false;
  }
}

// export async function verifyTransport() {
//   try {
//     // @ts-ignore
//     const ok = await (transporter as any).verify();
//     logger.info('SMTP transport verified', { ok });
//     return true;
//   } catch (err) {
//     logger.warn('SMTP transport verification failed', { error: err });
//     return false;
//   }
// }
