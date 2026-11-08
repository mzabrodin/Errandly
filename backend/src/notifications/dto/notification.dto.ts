import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsUUID } from 'class-validator';

import { NOTIFICATION_TYPES, type NotificationType } from '../../common/domain.js';
import { code } from '../../common/validation/validation.js';

/** Values substituted into the localized notification text */
export class NotificationDataDto {
  groupName?: string;
  taskTitle?: string;
  actorName?: string;
  /** ISO date-time */
  dueAt?: string;
}

export class NotificationDto {
  id!: string;
  @ApiProperty({ enum: NOTIFICATION_TYPES, enumName: 'NotificationType' })
  type!: NotificationType;
  createdAt!: string;
  read!: boolean;
  /** Null when the user is no longer in the group (removedFromGroup) */
  groupId!: string | null;
  taskId!: string | null;
  data!: NotificationDataDto;
}

export class NotificationListDto {
  /** The newest 50, newest first */
  items!: NotificationDto[];
  /** Unread among `items` */
  unread!: number;
}

export class MarkReadDto {
  /** Notifications to mark as read; all of them when omitted */
  @IsOptional()
  @IsArray(code('type'))
  @ArrayMaxSize(100, code('tooLong'))
  @IsUUID('all', { each: true, ...code('invalid') })
  ids?: string[];
}
