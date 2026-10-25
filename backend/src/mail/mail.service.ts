import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

import type { EnvironmentVariables } from '../config/env.validation.js';
import { renderTemplate, type TemplateName } from './templates/index.js';

const LOCAL_SMTP_HOSTS = new Set(['localhost', '127.0.0.1', 'mailpit']);

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;
  readonly smtpHost: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.smtpHost = config.get('SMTP_HOST', { infer: true });
    const user = config.get('SMTP_USER', { infer: true });
    this.transporter = nodemailer.createTransport({
      host: this.smtpHost,
      port: config.get('SMTP_PORT', { infer: true }),
      secure: config.get('SMTP_SECURE', { infer: true }),
      auth:
        user !== undefined && user !== ''
          ? { user, pass: config.get('SMTP_PASS', { infer: true }) }
          : undefined,
    });
    this.from = config.get('SMTP_FROM', { infer: true });
  }

  /** SMTP-сервер для розробки (Mailpit), який не доставляє листи назовні */
  get isLocalSmtp(): boolean {
    return LOCAL_SMTP_HOSTS.has(this.smtpHost);
  }

  async send(
    template: TemplateName,
    to: string,
    data: Record<string, string | number>,
  ): Promise<string> {
    const mail = renderTemplate(template, data);
    const info = (await this.transporter.sendMail({
      from: this.from,
      to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    })) as { messageId: string };
    this.logger.log(`Sent "${template}" (${info.messageId})`);
    return info.messageId;
  }
}
