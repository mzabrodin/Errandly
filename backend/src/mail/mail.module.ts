import { Module } from '@nestjs/common';

import { DevMailController } from './dev-mail.controller.js';
import { MailService } from './mail.service.js';

@Module({
  controllers: [DevMailController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
