import { Injectable, Logger } from '@nestjs/common';

import { MailTransport } from './mail-transport.js';
import { renderTemplate, type TemplateName } from './templates/index.js';
import { DEFAULT_MAIL_LOCALE, type MailLocale } from './templates/locale.js';

/** Public API of the mail module: renders a template and hands it to the transport */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly transport: MailTransport) {}

  /** Development SMTP server (Mailpit) that does not deliver emails outside */
  get isLocalSmtp(): boolean {
    return this.transport.isLocal;
  }

  /** Renders the template in the recipient's language and sends it */
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
