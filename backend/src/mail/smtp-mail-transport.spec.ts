import type { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

import type { EnvironmentVariables } from '../config/env.validation.js';
import { SmtpMailTransport } from './smtp-mail-transport.js';

vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn<typeof nodemailer.createTransport>() },
}));

const sendMail = vi.fn<(options: object) => Promise<{ messageId: string }>>();

function createTransport(env: Partial<EnvironmentVariables> = {}): SmtpMailTransport {
  const values: Partial<EnvironmentVariables> = {
    SMTP_HOST: 'localhost',
    SMTP_PORT: 1025,
    SMTP_SECURE: false,
    SMTP_FROM: 'Errandly <no-reply@errandly.local>',
    ...env,
  };
  const config = {
    get: (key: keyof EnvironmentVariables) => values[key],
  } as unknown as ConfigService<EnvironmentVariables, true>;
  return new SmtpMailTransport(config);
}

describe('SmtpMailTransport', () => {
  beforeEach(() => {
    sendMail.mockReset().mockResolvedValue({ messageId: '<id@mailpit>' });
    vi.mocked(nodemailer.createTransport)
      .mockReset()
      .mockReturnValue({ sendMail } as never);
  });

  it('connects without auth when SMTP_USER is empty', () => {
    createTransport({ SMTP_USER: '' });
    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'localhost',
      port: 1025,
      secure: false,
      auth: undefined,
    });
  });

  it('passes credentials when SMTP_USER is set', () => {
    createTransport({ SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'me', SMTP_PASS: 'secret' });
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ auth: { user: 'me', pass: 'secret' } }),
    );
  });

  it('detects a local SMTP server', () => {
    expect(createTransport({ SMTP_HOST: 'mailpit' }).isLocal).toBe(true);
    expect(createTransport({ SMTP_HOST: 'smtp.gmail.com' }).isLocal).toBe(false);
  });

  it('sends from SMTP_FROM and returns the message id', async () => {
    const mail = { to: 'bob@errandly.dev', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' };

    await expect(createTransport().send(mail)).resolves.toBe('<id@mailpit>');
    expect(sendMail).toHaveBeenCalledWith({ from: 'Errandly <no-reply@errandly.local>', ...mail });
  });
});
