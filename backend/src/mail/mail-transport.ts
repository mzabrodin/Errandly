export interface OutgoingMail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Port: how a rendered email leaves the server. SMTP today (Mailpit locally, Gmail in production);
 * an HTTP provider would be another implementation, with no change to MailService.
 */
export abstract class MailTransport {
  /** True when mail never leaves the machine (Mailpit), which unlocks the dev endpoints */
  abstract readonly isLocal: boolean;

  /** Returns the message id */
  abstract send(mail: OutgoingMail): Promise<string>;
}
