import { z } from 'zod';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export enum LogLevel {
  Fatal = 'fatal',
  Error = 'error',
  Warn = 'warn',
  Info = 'info',
  Debug = 'debug',
  Trace = 'trace',
  Silent = 'silent',
}

const port = z.coerce.number().int().min(1).max(65535);

const envSchema = z.object({
  NODE_ENV: z.enum(NodeEnv).default(NodeEnv.Development),
  PORT: port.default(3000),
  // Public origin of the app: CORS, OAuth callbacks and links in emails are built from it
  APP_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:5173'),
  LOG_LEVEL: z.enum(LogLevel).default(LogLevel.Info),
  DATABASE_URL: z.string().optional(),

  // Defaults point at Mailpit (docker compose up -d mailpit)
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: port.default(1025),
  SMTP_SECURE: z.stringbool().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('Errandly <no-reply@errandly.local>'),
  // Dev endpoint /api/dev/mail for the frontend mock API; works only with a local SMTP host
  MAIL_DEV_API: z.stringbool().default(false),
});

export type EnvironmentVariables = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
