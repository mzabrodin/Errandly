import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, ValidateNested } from 'class-validator';

import { CalendarStatusDto } from '../../calendar/index.js';
import { REMINDER_MINUTES } from '../../common/domain.js';
import { code } from '../../common/validation/validation.js';

export class NotificationPrefsDto {
  /** Email when a task is assigned to me */
  assigned!: boolean;
  /** Reminder before the due time */
  dueSoon!: boolean;
  /** Email when my task becomes overdue */
  overdue!: boolean;
  weeklyDigest!: boolean;
}

/** The settings page; composed from the notifications and calendar modules */
export class SettingsDto {
  calendar!: CalendarStatusDto;
  /** The popup on each calendar event, minutes before the due time */
  calendarReminderMinutes!: number;
  /** When the dueSoon email goes out, minutes before the due time */
  emailReminderMinutes!: number;
  notifications!: NotificationPrefsDto;
}

export class UpdateNotificationPrefsDto {
  @IsOptional()
  @IsBoolean(code('type'))
  assigned?: boolean;

  @IsOptional()
  @IsBoolean(code('type'))
  dueSoon?: boolean;

  @IsOptional()
  @IsBoolean(code('type'))
  overdue?: boolean;

  @IsOptional()
  @IsBoolean(code('type'))
  weeklyDigest?: boolean;
}

/** Partial settings update; `notifications` is merged into the current values */
export class UpdateSettingsDto {
  /** 15, 30, 60, 180 or 1440 */
  @IsOptional()
  @IsIn(REMINDER_MINUTES, code('invalid'))
  calendarReminderMinutes?: number;

  /** 15, 30, 60, 180 or 1440 */
  @IsOptional()
  @IsIn(REMINDER_MINUTES, code('invalid'))
  emailReminderMinutes?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateNotificationPrefsDto)
  notifications?: UpdateNotificationPrefsDto;
}
