import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Redirect,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';

import { ApiSession } from '../common/http/api-docs.js';
import { CurrentUser, type RequestUser } from '../common/http/auth.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { appLink } from '../config/urls.js';
import { CalendarService } from './calendar.service.js';
import { CalendarConnectDto, CalendarStatusDto } from './dto/calendar.dto.js';

/** Google Calendar connection, a separate OAuth flow from Google sign-in (FR-32–36, SYS-18–21) */
@ApiTags('calendar')
@ApiSession()
@Controller('me/calendar')
export class CalendarController {
  private readonly settingsUrl: string;

  constructor(
    private readonly calendar: CalendarService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.settingsUrl = appLink(config.get('APP_URL', { infer: true }), '/settings');
  }

  /** Starts the calendar OAuth flow. Errors: 503 SERVICE_UNAVAILABLE (no Google OAuth client). */
  @Post('connect')
  @HttpCode(HttpStatus.OK)
  connect(@CurrentUser() user: RequestUser): CalendarConnectDto {
    return { url: this.calendar.connectUrl(user.id) };
  }

  /** Google's redirect after consent; redirects to /settings?calendar=connected or =error. */
  @Get('callback')
  @Redirect()
  async callback(
    @CurrentUser() user: RequestUser,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ): Promise<{ url: string }> {
    const connected = await this.calendar.complete(user.id, { code, state, error });
    return { url: `${this.settingsUrl}?calendar=${connected ? 'connected' : 'error'}` };
  }

  /** Disconnects the calendar and deletes the tokens and the Errandly calendar. */
  @Delete()
  disconnect(@CurrentUser() user: RequestUser): Promise<CalendarStatusDto> {
    return this.calendar.disconnect(user.id);
  }

  /** Syncs now and resumes a paused sync. Errors: 409 CALENDAR_NOT_CONNECTED. */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  sync(@CurrentUser() user: RequestUser): Promise<CalendarStatusDto> {
    return this.calendar.syncNow(user.id);
  }
}
