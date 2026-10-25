import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { IsEmail, IsObject, IsString } from 'class-validator';

import type { EnvironmentVariables } from '../config/env.validation.js';
import { MailService } from './mail.service.js';
import {
  isTemplateName,
  renderSample,
  templateNames,
  validateTemplateData,
} from './templates/index.js';

class SendDevMailDto {
  @IsString()
  template!: string;

  @IsEmail()
  to!: string;

  @IsObject()
  data!: Record<string, string | number>;
}

/**
 * Лише для розробки: дає мок-API фронтенду надсилати листи в Mailpit
 * і показує прев'ю шаблонів. Вмикається MAIL_DEV_API=true і працює тільки
 * з локальним SMTP, щоб не стати відкритим поштовим релеєм.
 */
@ApiExcludeController()
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
    const messageId = await this.mail.send(body.template, body.to, body.data);
    return { messageId };
  }

  @Get('preview')
  @Header('Content-Type', 'text/html; charset=utf-8')
  index(): string {
    this.ensureEnabled();
    const links = templateNames
      .map(
        (name) => `<li><a href="preview/${name}">${name}</a> — ${renderSample(name).subject}</li>`,
      )
      .join('');
    return `<!doctype html><meta charset="utf-8"><title>Errandly emails</title><body style="font-family:sans-serif;padding:24px"><h1>Шаблони листів</h1><ul>${links}</ul></body>`;
  }

  @Get('preview/:template')
  @Header('Content-Type', 'text/html; charset=utf-8')
  preview(@Param('template') template: string): string {
    this.ensureEnabled();
    if (!isTemplateName(template)) throw new NotFoundException();
    return renderSample(template).html;
  }
}
