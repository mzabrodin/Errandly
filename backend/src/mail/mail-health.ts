import { Injectable, Logger } from '@nestjs/common';

import { errorMessage } from '../common/errors/error-message.js';
import { MailTransport } from './mail-transport.js';

/** For the readiness check, without handing out the transport itself */
@Injectable()
export class MailHealth {
  private readonly logger = new Logger(MailHealth.name);

  constructor(private readonly transport: MailTransport) {}

  async isUp(): Promise<boolean> {
    try {
      await this.transport.verify();
      return true;
    } catch (error: unknown) {
      this.logger.warn(`The mail server is unreachable: ${errorMessage(error)}`);
      return false;
    }
  }
}
