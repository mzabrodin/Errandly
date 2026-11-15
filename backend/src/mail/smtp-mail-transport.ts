import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

import { SECOND_MS } from '../common/time.js';
import { NodeEnv, type EnvironmentVariables } from '../config/env.validation.js';
import { MailTransport, type OutgoingMail } from './mail-transport.js';

const LOCAL_SMTP_HOSTS = new Set(['localhost', '127.0.0.1', 'mailpit']);

// Well under the dispatcher's 5-minute lease, so a stuck server fails the attempt instead
const CONNECTION_TIMEOUT_MS = 10 * SECOND_MS;
const SOCKET_TIMEOUT_MS = 30 * SECOND_MS;

@Injectable()
export class SmtpMailTransport extends MailTransport implements OnApplicationShutdown {
  readonly isLocal: boolean;
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    super();
    const host = config.get('SMTP_HOST', { infer: true });
    const user = config.get('SMTP_USER', { infer: true });
    const secure = config.get('SMTP_SECURE', { infer: true });
    this.isLocal = LOCAL_SMTP_HOSTS.has(host);
    this.transporter = nodemailer.createTransport({
      host,
      port: config.get('SMTP_PORT', { infer: true }),
      secure,
      // A real server must not fall back to plain text (STARTTLS stripping)
      requireTLS:
        !secure && !this.isLocal && config.get('NODE_ENV', { infer: true }) === NodeEnv.Production,
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      greetingTimeout: CONNECTION_TIMEOUT_MS,
      socketTimeout: SOCKET_TIMEOUT_MS,
      auth:
        user !== undefined && user !== ''
          ? { user, pass: config.get('SMTP_PASS', { infer: true }) }
          : undefined,
    });
    this.from = config.get('SMTP_FROM', { infer: true });
  }

  onApplicationShutdown(): void {
    this.transporter.close();
  }

  async verify(): Promise<void> {
    await this.transporter.verify();
  }

  async send(mail: OutgoingMail): Promise<string> {
    const info = (await this.transporter.sendMail({ from: this.from, ...mail })) as {
      messageId: string;
    };
    return info.messageId;
  }
}
