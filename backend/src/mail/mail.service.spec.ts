import { MailTransport, type OutgoingMail } from './mail-transport.js';
import { MailService } from './mail.service.js';

class FakeTransport extends MailTransport {
  readonly sent: OutgoingMail[] = [];

  constructor(readonly isLocal = true) {
    super();
  }

  send(mail: OutgoingMail): Promise<string> {
    this.sent.push(mail);
    return Promise.resolve('<id@test>');
  }
}

const invite = {
  inviterName: 'Anya',
  groupName: 'Room 12',
  url: 'http://localhost:5173/invite/x',
};

describe('MailService', () => {
  it('reports whether mail stays local', () => {
    expect(new MailService(new FakeTransport(true)).isLocalSmtp).toBe(true);
    expect(new MailService(new FakeTransport(false)).isLocalSmtp).toBe(false);
  });

  it('renders the template and hands it to the transport', async () => {
    const transport = new FakeTransport();

    const id = await new MailService(transport).send('invite', 'bob@errandly.dev', invite);

    expect(id).toBe('<id@test>');
    expect(transport.sent).toEqual([
      expect.objectContaining({
        to: 'bob@errandly.dev',
        subject: 'Anya запрошує вас до «Room 12»',
      }),
    ]);
    expect(transport.sent[0]?.text).toContain('http://localhost:5173/invite/x');
  });

  it('renders the template in the requested language', async () => {
    const transport = new FakeTransport();

    await new MailService(transport).send('invite', 'bob@errandly.dev', invite, 'en');

    expect(transport.sent[0]?.subject).toBe('Anya invites you to “Room 12”');
  });
});
