import { Module } from '@nestjs/common';

import { DevMailController } from './dev-mail.controller.js';
import { MailTransport } from './mail-transport.js';
import { MailService } from './mail.service.js';
import { SmtpMailTransport } from './smtp-mail-transport.js';

@Module({
  controllers: [DevMailController],
  providers: [MailService, { provide: MailTransport, useClass: SmtpMailTransport }],
  exports: [MailService],
})
export class MailModule {}
