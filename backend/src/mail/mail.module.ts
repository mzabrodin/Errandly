import { Module } from '@nestjs/common';

import { DevMailController } from './dev-mail.controller.js';
import { MailHealth } from './mail-health.js';
import { MailTransport } from './mail-transport.js';
import { MailService } from './mail.service.js';
import { SmtpMailTransport } from './smtp-mail-transport.js';

@Module({
  controllers: [DevMailController],
  providers: [MailService, MailHealth, { provide: MailTransport, useClass: SmtpMailTransport }],
  exports: [MailService, MailHealth],
})
export class MailModule {}
