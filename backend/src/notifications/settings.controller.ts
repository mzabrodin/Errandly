import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ApiSession } from '../common/http/api-docs.js';
import { CurrentUser, type RequestUser } from '../common/http/auth.js';
import { SettingsDto, UpdateSettingsDto } from './dto/settings.dto.js';
import { SettingsService } from './settings.service.js';

/**
 * The settings page (FR-32–35, FR-38). Notification preferences are this module's own data;
 * the calendar part comes from the calendar module's public API.
 */
@ApiTags('me')
@ApiSession()
@Controller('me/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Notification and calendar settings. */
  @Get()
  get(@CurrentUser() user: RequestUser): Promise<SettingsDto> {
    return this.settings.get(user.id);
  }

  /**
   * Updates the calendar reminder time and the notification switches; a new reminder time
   * re-syncs every event. Errors: 409 CALENDAR_NOT_CONNECTED (reminderMinutes without a calendar).
   */
  @Patch()
  update(@CurrentUser() user: RequestUser, @Body() body: UpdateSettingsDto): Promise<SettingsDto> {
    return this.settings.update(user.id, body);
  }
}
