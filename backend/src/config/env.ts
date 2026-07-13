import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  PORT: z.string().default('4000'),
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  REFRESH_COOKIE_NAME: z.string().default('rt'),
  // Leave unset for unrelated frontend/API hosts such as Vercel + Render.
  COOKIE_DOMAIN: z.string().optional(),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  REDIS_URL: z.string().url().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.0-flash'),
  GEMINI_TIMEOUT_MS: z.string().default('10000'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  GOOGLE_TOKEN_ENCRYPTION_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.string().default('60000'),
  RATE_LIMIT_MAX: z.string().default('100'),
  AUTH_RATE_LIMIT_MAX: z.string().default('10'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('debug')
});

type Env = z.infer<typeof envSchema>;

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Environment variable validation failed', parsedEnv.error.format());
  throw new Error('Invalid environment variables');
}

const env: Env = parsedEnv.data;

export default {
  nodeEnv: env.NODE_ENV,
  port: Number(env.PORT),
  databaseUrl: env.DATABASE_URL,
  directUrl: env.DIRECT_URL,
  jwtAccessSecret: env.JWT_ACCESS_SECRET,
  jwtAccessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
  jwtRefreshSecret: env.JWT_REFRESH_SECRET,
  jwtRefreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  refreshCookieName: env.REFRESH_COOKIE_NAME,
  cookieDomain: env.COOKIE_DOMAIN,
  corsOrigin: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
  redisUrl: env.REDIS_URL,
  geminiApiKey: env.GEMINI_API_KEY,
  geminiModel: env.GEMINI_MODEL,
  geminiTimeoutMs: Number(env.GEMINI_TIMEOUT_MS),
  googleClientId: env.GOOGLE_CLIENT_ID,
  googleClientSecret: env.GOOGLE_CLIENT_SECRET,
  googleRedirectUri: env.GOOGLE_REDIRECT_URI,
  googleTokenEncryptionKey: env.GOOGLE_TOKEN_ENCRYPTION_KEY,
  smtpHost: env.SMTP_HOST,
  smtpPort: env.SMTP_PORT ? Number(env.SMTP_PORT) : undefined,
  smtpUser: env.SMTP_USER,
  smtpPass: env.SMTP_PASS,
  emailFrom: env.EMAIL_FROM,
  rateLimitWindowMs: Number(env.RATE_LIMIT_WINDOW_MS),
  rateLimitMax: Number(env.RATE_LIMIT_MAX),
  authRateLimitMax: Number(env.AUTH_RATE_LIMIT_MAX),
  logLevel: env.LOG_LEVEL
};
