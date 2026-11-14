import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../common/clock.js';
import { EventBus } from '../common/events/event-bus.js';
import { DATABASE, type Database } from '../db/database.js';
import { CalendarRepository } from './calendar.repository.js';
import type { CalendarConnectionRow } from './calendar.schema.js';
import type { CalendarStatusDto } from './dto/calendar.dto.js';

export interface CalendarSettings {
  status: CalendarStatusDto;
  reminderMinutes: number;
}

export function toStatus(connection: CalendarConnectionRow | undefined): CalendarStatusDto {
  if (!connection) {
    return { connected: false, syncStatus: 'ok', googleEmail: null, lastSyncedAt: null };
  }
  return {
    connected: true,
    syncStatus: connection.syncStatus,
    googleEmail: connection.accountEmail,
    lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class CalendarApi {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: CalendarRepository,
    private readonly bus: EventBus,
    private readonly clock: Clock,
  ) {}

  async settings(userId: string): Promise<CalendarSettings> {
    const [connection, reminderMinutes] = await Promise.all([
      this.repository.findByUser(userId),
      this.repository.reminderMinutesOf(userId),
    ]);
    return { status: toStatus(connection), reminderMinutes };
  }

  /** Connected calendars get the new reminder on every event through a resync */
  async setReminderMinutes(userId: string, minutes: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      if ((await this.repository.reminderMinutesOf(userId, tx)) === minutes) return;
      await this.repository.saveReminderMinutes(userId, minutes, this.clock.now(), tx);
      if (await this.repository.findByUser(userId, tx)) {
        await this.bus.publish(tx, 'calendar.resyncRequested', { userId });
      }
    });
  }
}
