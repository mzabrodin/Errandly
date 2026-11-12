export interface OutgoingMail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export abstract class MailTransport {
  /** True when mail never leaves the machine (Mailpit), which unlocks the dev endpoints */
  abstract readonly isLocal: boolean;

  abstract send(mail: OutgoingMail): Promise<string>;
}
