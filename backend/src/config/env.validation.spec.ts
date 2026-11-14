import {
  DEV_DATABASE_URL,
  DEV_STORAGE,
  DEV_TOKEN_ENCRYPTION_KEY,
  LogLevel,
  NodeEnv,
  validateDatabaseEnv,
  validateEnv,
} from './env.validation.js';

const PRODUCTION_KEY = Buffer.alloc(32, 7).toString('base64');

describe('validateEnv', () => {
  it('applies defaults', () => {
    const env = validateEnv({});

    expect(env.NODE_ENV).toBe(NodeEnv.Development);
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe(LogLevel.Info);
    expect(env.SMTP_SECURE).toBe(false);
    expect(env.RATE_LIMIT_PER_MINUTE).toBe(100);
    expect(env.AUTH_RATE_LIMIT_PER_MINUTE).toBe(10);
  });

  it('converts strings from process.env', () => {
    const env = validateEnv({ PORT: '8080', SMTP_PORT: '465', SMTP_SECURE: 'true' });

    expect(env.PORT).toBe(8080);
    expect(env.SMTP_PORT).toBe(465);
    expect(env.SMTP_SECURE).toBe(true);
  });

  it('treats "false" as false', () => {
    expect(validateEnv({ SMTP_SECURE: 'false' }).SMTP_SECURE).toBe(false);
  });

  it('rejects an invalid APP_URL', () => {
    expect(() => validateEnv({ APP_URL: 'notaurl' })).toThrow(/APP_URL/);
  });

  it('rejects an APP_URL that is not http(s)', () => {
    expect(() => validateEnv({ APP_URL: 'ftp://localhost' })).toThrow(/APP_URL/);
  });

  it('rejects an unknown LOG_LEVEL', () => {
    expect(() => validateEnv({ LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });

  it('defaults DATABASE_URL to the local compose database outside production', () => {
    expect(validateEnv({}).DATABASE_URL).toBe(DEV_DATABASE_URL);
  });

  it('requires DATABASE_URL in production', () => {
    expect(() =>
      validateEnv({ NODE_ENV: 'production', TOKEN_ENCRYPTION_KEY: PRODUCTION_KEY }),
    ).toThrow(/DATABASE_URL/);
    const url = 'postgres://app:secret@db:5432/errandly';
    const env = validateEnv({
      NODE_ENV: 'production',
      DATABASE_URL: url,
      TOKEN_ENCRYPTION_KEY: PRODUCTION_KEY,
    });
    expect(env.DATABASE_URL).toBe(url);
  });

  it('rejects a DATABASE_URL that is not postgres', () => {
    expect(() => validateEnv({ DATABASE_URL: 'mysql://localhost/errandly' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('points storage at the local SeaweedFS outside production', () => {
    expect(validateEnv({})).toMatchObject({
      ...DEV_STORAGE,
      S3_REGION: 'us-east-1',
      S3_BUCKET: 'avatars',
    });
  });

  it('leaves storage to AWS S3 and its credential chain in production when nothing is set', () => {
    const env = validateEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://db/errandly',
      TOKEN_ENCRYPTION_KEY: PRODUCTION_KEY,
    });

    expect(env.S3_ENDPOINT).toBeUndefined();
    expect(env.S3_ACCESS_KEY_ID).toBeUndefined();
  });

  it('keeps storage settings that were set', () => {
    const env = validateEnv({ S3_ENDPOINT: 'https://r2.example.com', S3_ACCESS_KEY_ID: 'id' });

    expect(env).toMatchObject({ S3_ENDPOINT: 'https://r2.example.com', S3_ACCESS_KEY_ID: 'id' });
    expect(env.S3_SECRET_ACCESS_KEY).toBe(DEV_STORAGE.S3_SECRET_ACCESS_KEY);
  });

  it('uses a dev token key outside production and requires one in production', () => {
    expect(validateEnv({}).TOKEN_ENCRYPTION_KEY).toBe(DEV_TOKEN_ENCRYPTION_KEY);
    expect(() =>
      validateEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://db/errandly' }),
    ).toThrow(/TOKEN_ENCRYPTION_KEY/);
  });

  it('lets the migration job run in production with only a database URL', () => {
    const url = 'postgresql://db/errandly';

    expect(validateDatabaseEnv({ NODE_ENV: 'production', DATABASE_URL: url })).toEqual({
      DATABASE_URL: url,
    });
    expect(() => validateDatabaseEnv({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
  });

  it('rejects a token key that is not 32 bytes', () => {
    expect(() => validateEnv({ TOKEN_ENCRYPTION_KEY: 'c2hvcnQ=' })).toThrow(/TOKEN_ENCRYPTION_KEY/);
  });

  it('treats empty Google credentials from compose as unset', () => {
    const env = validateEnv({ GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' });

    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.GOOGLE_CLIENT_SECRET).toBeUndefined();
  });
});
