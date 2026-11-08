import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

import type { EnvironmentVariables } from '../config/env.validation.js';
import { MailTransport, type OutgoingMail } from './mail-transport.js';

const LOCAL_SMTP_HOSTS = new Set(['localhost', '127.0.0.1', 'mailpit']);

@Injectable()
export class SmtpMailTransport extends MailTransport {
  readonly isLocal: boolean;
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    super();
    const host = config.get('SMTP_HOST', { infer: true });
    const user = config.get('SMTP_USER', { infer: true });
    this.isLocal = LOCAL_SMTP_HOSTS.has(host);
    this.transporter = nodemailer.createTransport({
      host,
      port: config.get('SMTP_PORT', { infer: true }),
      secure: config.get('SMTP_SECURE', { infer: true }),
      auth:
        user !== undefined && user !== ''
          ? { user, pass: config.get('SMTP_PASS', { infer: true }) }
          : undefined,
    });
    this.from = config.get('SMTP_FROM', { infer: true });
  }

  async send(mail: OutgoingMail): Promise<string> {
    const info = (await this.transporter.sendMail({ from: this.from, ...mail })) as {
      messageId: string;
    };
    return info.messageId;
  }
}
