import { createLogger, format, transports } from 'winston';
import env from './env';

const logger = createLogger({
  level: env.logLevel,
  format:
    env.nodeEnv === 'production'
      ? format.json()
      : format.combine(format.colorize(), format.timestamp(), format.printf(({ timestamp, level, message, ...meta }) => {
          const metaString = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${level}]: ${message} ${metaString}`;
        })),
  transports: [new transports.Console()]
});

export default logger;
