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

/** Local compose database; production must set DATABASE_URL explicitly */
export const DEV_DATABASE_URL = 'postgresql://errandly:errandly@localhost:5432/errandly';

export const DEV_STORAGE = {
  S3_ENDPOINT: 'http://localhost:8333',
  S3_ACCESS_KEY_ID: 'errandly',
  S3_SECRET_ACCESS_KEY: 'errandly-dev-secret',
} as const;

const envSchema = z.object({
  NODE_ENV: z.enum(NodeEnv).default(NodeEnv.Development),
  PORT: port.default(3000),
  // Public origin of the app: CORS, OAuth callbacks and links in emails are built from it
  APP_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:5173'),
  LOG_LEVEL: z.enum(LogLevel).default(LogLevel.Info),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
  /** 0 turns after-commit delivery off */
  EVENTS_POLL_INTERVAL_MS: z.coerce.number().int().min(0).default(2000),
  SCHEDULER_ENABLED: z.stringbool().default(true),
  /** Per IP (NFR-SEC-07) */
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(100),
  AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(10),

  // Defaults point at Mailpit (docker compose up -d mailpit)
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: port.default(1025),
  SMTP_SECURE: z.stringbool().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('Errandly <no-reply@errandly.local>'),
  // Dev endpoint /api/dev/mail for the frontend mock API; works only with a local SMTP host
  MAIL_DEV_API: z.stringbool().default(false),

  // Dev defaults point at SeaweedFS; in production, unset means AWS S3 and its credential chain
  S3_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(1).default('avatars'),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
});

const isProduction = (env: { NODE_ENV: NodeEnv }): boolean => env.NODE_ENV === NodeEnv.Production;

function devStorage(env: { NODE_ENV: NodeEnv }, key: keyof typeof DEV_STORAGE): string | undefined {
  return isProduction(env) ? undefined : DEV_STORAGE[key];
}

const refinedSchema = envSchema
  .refine((env) => !isProduction(env) || env.DATABASE_URL !== undefined, {
    message: 'DATABASE_URL is required in production',
    path: ['DATABASE_URL'],
  })
  .transform((env) => ({
    ...env,
    DATABASE_URL: env.DATABASE_URL ?? DEV_DATABASE_URL,
    S3_ENDPOINT: env.S3_ENDPOINT ?? devStorage(env, 'S3_ENDPOINT'),
    S3_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID ?? devStorage(env, 'S3_ACCESS_KEY_ID'),
    S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY ?? devStorage(env, 'S3_SECRET_ACCESS_KEY'),
  }));

export type EnvironmentVariables = z.infer<typeof refinedSchema>;

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const result = refinedSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
