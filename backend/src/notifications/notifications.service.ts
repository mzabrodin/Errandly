import { Injectable } from '@nestjs/common';

import { Clock } from '../common/clock.js';
import type { NotificationDto, NotificationListDto } from './dto/notification.dto.js';
import { NotificationsRepository } from './notifications.repository.js';
import type { NotificationRow } from './notifications.schema.js';

const LIST_SIZE = 50;

function toDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    createdAt: row.createdAt.toISOString(),
    read: row.readAt !== null,
    groupId: row.groupId,
    taskId: row.taskId,
    data: row.data,
  };
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly repository: NotificationsRepository,
    private readonly clock: Clock,
  ) {}

  async list(userId: string): Promise<NotificationListDto> {
    const items = (await this.repository.latest(userId, LIST_SIZE)).map(toDto);
    return { items, unread: items.filter((item) => !item.read).length };
  }

  markRead(userId: string, ids?: string[]): Promise<void> {
    return this.repository.markRead(userId, ids, this.clock.now());
  }
}
