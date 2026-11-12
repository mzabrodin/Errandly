import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { IsEmail, IsIn, IsObject, IsOptional, IsString } from 'class-validator';

import { Public } from '../common/http/auth.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { MailService } from './mail.service.js';
import {
  isTemplateName,
  renderSample,
  templateNames,
  validateTemplateData,
} from './templates/index.js';
import {
  DEFAULT_MAIL_LOCALE,
  isMailLocale,
  MAIL_LOCALES,
  type MailLocale,
} from './templates/locale.js';

class SendDevMailDto {
  @IsString()
  template!: string;

  @IsEmail()
  to!: string;

  @IsObject()
  data!: Record<string, string | number>;

  @IsOptional()
  @IsIn(MAIL_LOCALES)
  locale?: MailLocale;
}

/** For the frontend mock API; only with a local SMTP host, so it cannot become an open relay */
@ApiExcludeController()
@Public()
@Controller('dev/mail')
export class DevMailController {
  private readonly enabled: boolean;

  constructor(
    private readonly mail: MailService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.enabled = config.get('MAIL_DEV_API', { infer: true }) && mail.isLocalSmtp;
  }

  private ensureEnabled(): void {
    if (!this.enabled) throw new NotFoundException();
  }

  @Post()
  async send(@Body() body: SendDevMailDto): Promise<{ messageId: string }> {
    this.ensureEnabled();
    if (!isTemplateName(body.template)) throw new BadRequestException('Unknown template');
    const errors = validateTemplateData(body.template, body.data);
    if (errors.length > 0) throw new BadRequestException(errors);
    const messageId = await this.mail.send(body.template, body.to, body.data, body.locale);
    return { messageId };
  }

  @Get('preview')
  @Header('Content-Type', 'text/html; charset=utf-8')
  index(): string {
    this.ensureEnabled();
    const links = templateNames
      .flatMap((name) =>
        MAIL_LOCALES.map(
          (locale) =>
            `<li><a href="preview/${name}?locale=${locale}">${name} (${locale})</a> — ${renderSample(name, locale).subject}</li>`,
        ),
      )
      .join('');
    return `<!doctype html><meta charset="utf-8"><title>Errandly emails</title><body style="font-family:sans-serif;padding:24px"><h1>Email templates</h1><ul>${links}</ul></body>`;
  }

  @Get('preview/:template')
  @Header('Content-Type', 'text/html; charset=utf-8')
  preview(@Param('template') template: string, @Query('locale') locale?: string): string {
    this.ensureEnabled();
    if (!isTemplateName(template)) throw new NotFoundException();
    return renderSample(template, isMailLocale(locale) ? locale : DEFAULT_MAIL_LOCALE).html;
  }
}
