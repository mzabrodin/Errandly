import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ApiSession } from '../common/http/api-docs.js';
import { notImplemented } from '../common/http/stubs.js';
import { SettingsDto, UpdateSettingsDto } from './dto/settings.dto.js';

/**
 * The settings page (FR-32–35, FR-38). Notification preferences are this module's own data;
 * the calendar part comes from the calendar module's public API.
 */
@ApiTags('me')
@ApiSession()
@Controller('me/settings')
export class SettingsController {
  /** Notification and calendar settings. */
  @Get()
  get(): Promise<SettingsDto> {
    return notImplemented();
  }

  /** Updates the reminder offset and notification switches. */
  @Patch()
  update(@Body() body: UpdateSettingsDto): Promise<SettingsDto> {
    return notImplemented(body);
  }
}
