import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../config/env.validation.js';
import { DevMailController } from './dev-mail.controller.js';
import type { MailService } from './mail.service.js';

const send = vi.fn<MailService['send']>();

function createController(enabled: boolean, isLocalSmtp = true): DevMailController {
  const mail = { isLocalSmtp, send } as unknown as MailService;
  const config = {
    get: () => enabled,
  } as unknown as ConfigService<EnvironmentVariables, true>;
  return new DevMailController(mail, config);
}

const invite = {
  inviterName: 'Anya',
  groupName: 'Room 12',
  url: 'http://localhost:5173/invite/x',
};

describe('DevMailController', () => {
  beforeEach(() => {
    send.mockReset().mockResolvedValue('<id@mailpit>');
  });

  it('is hidden unless MAIL_DEV_API is on', async () => {
    await expect(createController(false).index()).rejects.toThrow(NotFoundException);
  });

  it('is hidden with a real SMTP server', async () => {
    await expect(createController(true, false).index()).rejects.toThrow(NotFoundException);
  });

  it('sends a valid email', async () => {
    const result = await createController(true).send({
      template: 'invite',
      to: 'bob@errandly.dev',
      data: invite,
    });

    expect(result).toEqual({ messageId: '<id@mailpit>' });
    expect(send).toHaveBeenCalledWith('invite', 'bob@errandly.dev', invite, undefined);
  });

  it('passes the recipient language through', async () => {
    await createController(true).send({
      template: 'invite',
      to: 'bob@errandly.dev',
      data: invite,
      locale: 'en',
    });

    expect(send).toHaveBeenCalledWith('invite', 'bob@errandly.dev', invite, 'en');
  });

  it('rejects an unknown template', async () => {
    await expect(
      createController(true).send({ template: 'nope', to: 'bob@errandly.dev', data: {} }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects data that does not match the template, naming the fields', async () => {
    const error: unknown = await createController(true)
      .send({
        template: 'invite',
        to: 'bob@errandly.dev',
        data: { ...invite, url: 'javascript:x' },
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toMatchObject({ response: { message: [expect.stringMatching(/^url: /)] } });
    expect(send).not.toHaveBeenCalled();
  });

  it('lists and renders previews', async () => {
    const controller = createController(true);

    await expect(controller.index()).resolves.toContain('preview/invite?locale=en');
    await expect(controller.preview('invite')).resolves.toContain('lang="uk"');
    await expect(controller.preview('invite', 'en')).resolves.toContain('lang="en"');
    await expect(controller.preview('invite', 'fr')).resolves.toContain('lang="uk"');
    await expect(controller.preview('nope')).rejects.toThrow(NotFoundException);
  });
});
