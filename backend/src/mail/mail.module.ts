import { Module } from '@nestjs/common';

import { MailHealth } from './mail-health.js';
import { MailPreviewController } from './mail-preview.controller.js';
import { MailTransport } from './mail-transport.js';
import { MailService } from './mail.service.js';
import { SmtpMailTransport } from './smtp-mail-transport.js';

@Module({
  controllers: [MailPreviewController],
  providers: [MailService, MailHealth, { provide: MailTransport, useClass: SmtpMailTransport }],
  exports: [MailService, MailHealth],
})
export class MailModule {}
