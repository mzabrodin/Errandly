import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ApiSession } from '../common/http/api-docs.js';
import { CurrentUser, type RequestUser } from '../common/http/auth.js';
import { MarkReadDto, NotificationListDto } from './dto/notification.dto.js';
import { NotificationsService } from './notifications.service.js';

/** In-app notifications (the bell); the frontend polls every 30 s and on window focus */
@ApiTags('notifications')
@ApiSession()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** The newest 50 notifications and how many of them are unread. */
  @Get()
  list(@CurrentUser() user: RequestUser): Promise<NotificationListDto> {
    return this.notifications.list(user.id);
  }

  /** Marks the given notifications, or all of them, as read. */
  @Post('read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(@CurrentUser() user: RequestUser, @Body() body: MarkReadDto): Promise<void> {
    return this.notifications.markRead(user.id, body.ids);
  }
}
