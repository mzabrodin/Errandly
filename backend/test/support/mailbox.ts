import { MailTransport, type OutgoingMail } from '../../src/mail/mail-transport.js';

/** Records outgoing mail instead of sending it; `failNext` emulates an SMTP outage */
export class RecordingMailTransport extends MailTransport {
  readonly isLocal = true;
  readonly sent: OutgoingMail[] = [];
  private failures = 0;

  failNext(count = 1): void {
    this.failures = count;
  }

  send(mail: OutgoingMail): Promise<string> {
    if (this.failures > 0) {
      this.failures -= 1;
      return Promise.reject(new Error('SMTP is down'));
    }
    this.sent.push(mail);
    return Promise.resolve(`<test-${this.sent.length}@errandly.test>`);
  }

  clear(): void {
    this.sent.length = 0;
    this.failures = 0;
  }

  to(address: string): OutgoingMail[] {
    return this.sent.filter((mail) => mail.to === address);
  }

  /** The token of the newest link `<path>/<token>` sent to `address` */
  lastToken(address: string, path: string): string {
    const pattern = new RegExp(`${path}/([\\w-]+)`);
    const token = this.to(address)
      .map((mail) => pattern.exec(mail.text)?.[1])
      .findLast((value) => value !== undefined);
    if (token === undefined) throw new Error(`No ${path} link was sent to ${address}`);
    return token;
  }
}
