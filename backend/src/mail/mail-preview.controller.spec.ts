import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../config/env.validation.js';
import { MailPreviewController } from './mail-preview.controller.js';
import type { MailService } from './mail.service.js';

function createController(enabled: boolean, isLocalSmtp = true): MailPreviewController {
  const mail = { isLocalSmtp } as unknown as MailService;
  const config = {
    get: () => enabled,
  } as unknown as ConfigService<EnvironmentVariables, true>;
  return new MailPreviewController(mail, config);
}

describe('MailPreviewController', () => {
  it('is hidden unless MAIL_DEV_API is on', async () => {
    await expect(createController(false).index()).rejects.toThrow(NotFoundException);
  });

  it('is hidden with a real SMTP server', async () => {
    await expect(createController(true, false).index()).rejects.toThrow(NotFoundException);
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
