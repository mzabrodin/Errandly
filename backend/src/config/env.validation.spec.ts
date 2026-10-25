import { LogLevel, NodeEnv, validateEnv } from './env.validation.js';

describe('validateEnv', () => {
  it('applies defaults', () => {
    const env = validateEnv({});

    expect(env.NODE_ENV).toBe(NodeEnv.Development);
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe(LogLevel.Info);
    expect(env.SMTP_SECURE).toBe(false);
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
});
