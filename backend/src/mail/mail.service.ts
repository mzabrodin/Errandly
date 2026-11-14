import { Injectable, Logger } from '@nestjs/common';

import { DEFAULT_LOCALE, type Locale } from '../common/domain.js';
import { MailTransport } from './mail-transport.js';
import { renderTemplate, type MailData, type TemplateName } from './templates/index.js';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly transport: MailTransport) {}

  get isLocalSmtp(): boolean {
    return this.transport.isLocal;
  }

  /** Data that does not match the template's schema throws: that is a bug in the caller */
  async send<T extends TemplateName>(
    template: T,
    to: string,
    data: MailData<T>,
    locale: Locale = DEFAULT_LOCALE,
  ): Promise<string> {
    const mail = await renderTemplate(template, data, locale);
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
