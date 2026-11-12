import { Injectable, Logger } from '@nestjs/common';

import { MailTransport } from './mail-transport.js';
import { renderTemplate, type TemplateName } from './templates/index.js';
import { DEFAULT_MAIL_LOCALE, type MailLocale } from './templates/locale.js';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly transport: MailTransport) {}

  get isLocalSmtp(): boolean {
    return this.transport.isLocal;
  }

  async send(
    template: TemplateName,
    to: string,
    data: Record<string, string | number>,
    locale: MailLocale = DEFAULT_MAIL_LOCALE,
  ): Promise<string> {
    const mail = renderTemplate(template, data, locale);
    const messageId = await this.transport.send({
      to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
    this.logger.log(`Sent "${template}" in ${locale} (${messageId})`);
    return messageId;
  }
}
