import { Controller, Delete, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ApiSession } from '../common/http/api-docs.js';
import { notImplemented } from '../common/http/stubs.js';
import { CalendarConnectDto, CalendarStatusDto } from './dto/calendar.dto.js';

/** Google Calendar connection, a separate OAuth flow from Google sign-in (FR-32–36, SYS-18–21) */
@ApiTags('calendar')
@ApiSession()
@Controller('me/calendar')
export class CalendarController {
  /** Starts the calendar OAuth flow; after consent Google returns to /settings?calendar=connected. */
  @Post('connect')
  @HttpCode(HttpStatus.OK)
  connect(): Promise<CalendarConnectDto> {
    return notImplemented();
  }

  /** Disconnects the calendar and deletes the stored tokens. */
  @Delete()
  disconnect(): Promise<CalendarStatusDto> {
    return notImplemented();
  }

  /** Syncs now and resumes a paused sync. Errors: 409 CALENDAR_NOT_CONNECTED. */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  sync(): Promise<CalendarStatusDto> {
    return notImplemented();
  }
}
