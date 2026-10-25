import type { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

import type { EnvironmentVariables } from '../config/env.validation.js';
import { MailService } from './mail.service.js';

vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn<typeof nodemailer.createTransport>() },
}));

const sendMail = vi.fn<(options: object) => Promise<{ messageId: string }>>();

function createService(env: Partial<EnvironmentVariables> = {}): MailService {
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
  return new MailService(config);
}

const invite = {
  inviterName: 'Аня',
  groupName: 'Кімната 12',
  url: 'http://localhost:5173/invite/x',
};

describe('MailService', () => {
  beforeEach(() => {
    sendMail.mockReset().mockResolvedValue({ messageId: '<id@mailpit>' });
    vi.mocked(nodemailer.createTransport)
      .mockReset()
      .mockReturnValue({ sendMail } as never);
  });

  it('connects without auth when SMTP_USER is empty', () => {
    createService({ SMTP_USER: '' });
    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'localhost',
      port: 1025,
      secure: false,
      auth: undefined,
    });
  });

  it('passes credentials when SMTP_USER is set', () => {
    createService({ SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'me', SMTP_PASS: 'secret' });
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ auth: { user: 'me', pass: 'secret' } }),
    );
  });

  it('detects a local SMTP server', () => {
    expect(createService({ SMTP_HOST: 'mailpit' }).isLocalSmtp).toBe(true);
    expect(createService({ SMTP_HOST: 'smtp.gmail.com' }).isLocalSmtp).toBe(false);
  });

  it('sends a rendered template', async () => {
    const id = await createService().send('invite', 'bob@errandly.dev', invite);

    expect(id).toBe('<id@mailpit>');
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Errandly <no-reply@errandly.local>',
        to: 'bob@errandly.dev',
        subject: expect.stringContaining('Кімната 12') as unknown,
      }),
    );
  });
});
