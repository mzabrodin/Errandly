import { Controller, Get, Header, NotFoundException, Param, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';

import { DEFAULT_LOCALE, LOCALES, type Locale } from '../common/domain.js';
import { Public } from '../common/http/auth.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { MailService } from './mail.service.js';
import { isTemplateName, renderSample, templateNames } from './templates/index.js';

function isLocale(value: unknown): value is Locale {
  return LOCALES.some((locale) => locale === value);
}

/** Template samples for development; never exposed next to a real SMTP server */
@ApiExcludeController()
@Public()
@Controller('dev/mail/preview')
export class MailPreviewController {
  private readonly enabled: boolean;

  constructor(mail: MailService, config: ConfigService<EnvironmentVariables, true>) {
    this.enabled = config.get('MAIL_DEV_API', { infer: true }) && mail.isLocalSmtp;
  }

  private ensureEnabled(): void {
    if (!this.enabled) throw new NotFoundException();
  }

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  async index(): Promise<string> {
    this.ensureEnabled();
    const samples = await Promise.all(
      templateNames.flatMap((name) =>
        LOCALES.map(async (locale) => ({ name, locale, mail: await renderSample(name, locale) })),
      ),
    );
    const links = samples
      .map(
        ({ name, locale, mail }) =>
          `<li><a href="preview/${name}?locale=${locale}">${name} (${locale})</a> — ${mail.subject}</li>`,
      )
      .join('');
    return `<!doctype html><meta charset="utf-8"><title>Errandly emails</title><body style="font-family:sans-serif;padding:24px"><h1>Email templates</h1><ul>${links}</ul></body>`;
  }

  @Get(':template')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async preview(
    @Param('template') template: string,
    @Query('locale') locale?: string,
  ): Promise<string> {
    this.ensureEnabled();
    if (!isTemplateName(template)) throw new NotFoundException();
    const mail = await renderSample(template, isLocale(locale) ? locale : DEFAULT_LOCALE);
    return mail.html;
  }
}
