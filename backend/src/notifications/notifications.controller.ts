import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ApiSession } from '../common/http/api-docs.js';
import { notImplemented } from '../common/http/stubs.js';
import { MarkReadDto, NotificationListDto } from './dto/notification.dto.js';

/** In-app notifications (the bell); the frontend polls every 30 s and on window focus */
@ApiTags('notifications')
@ApiSession()
@Controller('notifications')
export class NotificationsController {
  /** The newest 50 notifications and how many of them are unread. */
  @Get()
  list(): Promise<NotificationListDto> {
    return notImplemented();
  }

  /** Marks the given notifications, or all of them, as read. */
  @Post('read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(@Body() body: MarkReadDto): Promise<void> {
    return notImplemented(body);
  }
}
