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
  inviterName: 'Аня',
  groupName: 'Кімната 12',
  url: 'http://localhost:5173/invite/x',
};

describe('DevMailController', () => {
  beforeEach(() => {
    send.mockReset().mockResolvedValue('<id@mailpit>');
  });

  it('is hidden unless MAIL_DEV_API is on', () => {
    expect(() => createController(false).index()).toThrow(NotFoundException);
  });

  it('is hidden with a real SMTP server', () => {
    expect(() => createController(true, false).index()).toThrow(NotFoundException);
  });

  it('sends a valid email', async () => {
    const result = await createController(true).send({
      template: 'invite',
      to: 'bob@errandly.dev',
      data: invite,
    });

    expect(result).toEqual({ messageId: '<id@mailpit>' });
    expect(send).toHaveBeenCalledWith('invite', 'bob@errandly.dev', invite);
  });

  it('rejects an unknown template', async () => {
    await expect(
      createController(true).send({ template: 'nope', to: 'bob@errandly.dev', data: {} }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects incomplete data', async () => {
    await expect(
      createController(true).send({ template: 'invite', to: 'bob@errandly.dev', data: {} }),
    ).rejects.toThrow(BadRequestException);
    expect(send).not.toHaveBeenCalled();
  });

  it('lists and renders previews', () => {
    const controller = createController(true);

    expect(controller.index()).toContain('preview/invite');
    expect(controller.preview('invite')).toContain('<html');
    expect(() => controller.preview('nope')).toThrow(NotFoundException);
  });
});
