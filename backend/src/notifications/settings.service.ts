import { Inject, Injectable } from '@nestjs/common';

import { CalendarApi } from '../calendar/index.js';
import { Clock } from '../common/clock.js';
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationEvent } from '../common/domain.js';
import { DATABASE, type Database } from '../db/database.js';
import type { NotificationPrefsDto, SettingsDto, UpdateSettingsDto } from './dto/settings.dto.js';
import { NotificationsRepository } from './notifications.repository.js';

const SWITCHES: Record<keyof NotificationPrefsDto, NotificationEvent> = {
  assigned: 'taskAssigned',
  dueSoon: 'taskDueSoon',
  overdue: 'taskOverdue',
  weeklyDigest: 'weeklyDigest',
};
const CHANNEL = 'email';

function isSwitch(key: string): key is keyof NotificationPrefsDto {
  return key in SWITCHES;
}

@Injectable()
export class SettingsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: NotificationsRepository,
    private readonly calendar: CalendarApi,
    private readonly clock: Clock,
  ) {}

  async get(userId: string): Promise<SettingsDto> {
    const [calendar, emailReminderMinutes, overrides] = await Promise.all([
      this.calendar.settings(userId),
      this.repository.emailReminderMinutesOf(userId),
      this.repository.preferencesOf(userId),
    ]);
    // Email is the only channel so far
    const enabled = (event: NotificationEvent): boolean =>
      overrides.find((row) => row.event === event)?.enabled ??
      DEFAULT_NOTIFICATION_PREFERENCES[event];
    return {
      calendar: calendar.status,
      calendarReminderMinutes: calendar.reminderMinutes,
      emailReminderMinutes,
      notifications: {
        assigned: enabled(SWITCHES.assigned),
        dueSoon: enabled(SWITCHES.dueSoon),
        overdue: enabled(SWITCHES.overdue),
        weeklyDigest: enabled(SWITCHES.weeklyDigest),
      },
    };
  }

  async update(userId: string, patch: UpdateSettingsDto): Promise<SettingsDto> {
    if (patch.calendarReminderMinutes !== undefined) {
      await this.calendar.setReminderMinutes(userId, patch.calendarReminderMinutes);
    }
    const switches = Object.entries(patch.notifications ?? {});
    const { emailReminderMinutes } = patch;
    if (switches.length > 0 || emailReminderMinutes !== undefined) {
      const now = this.clock.now();
      await this.db.transaction(async (tx) => {
        if (emailReminderMinutes !== undefined) {
          await this.repository.saveEmailReminderMinutes(userId, emailReminderMinutes, now, tx);
        }
        for (const [key, value] of switches) {
          if (!isSwitch(key) || typeof value !== 'boolean') continue;
          const event = SWITCHES[key];
          // oxlint-disable-next-line no-await-in-loop -- one transaction connection, so the writes run in order anyway
          await (value === DEFAULT_NOTIFICATION_PREFERENCES[event]
            ? this.repository.deletePreference(userId, event, CHANNEL, tx)
            : this.repository.savePreference(
                userId,
                { event, channel: CHANNEL, enabled: value },
                now,
                tx,
              ));
        }
      });
    }
    return this.get(userId);
  }
}
