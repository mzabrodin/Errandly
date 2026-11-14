import type { CalendarApi } from '../calendar/index.js';
import { FixedClock } from '../common/clock.js';
import type { Database } from '../db/database.js';
import type { NotificationsRepository, PreferenceOverride } from './notifications.repository.js';
import { SettingsService } from './settings.service.js';

const NOW = new Date('2026-11-14T10:00:00Z');

function setup() {
  let overrides: PreferenceOverride[] = [];
  const reminders: number[] = [];
  let emailMinutes = 1440;
  const repository = {
    emailReminderMinutesOf: () => Promise.resolve(emailMinutes),
    saveEmailReminderMinutes: (_userId: string, minutes: number) => {
      emailMinutes = minutes;
      return Promise.resolve();
    },
    preferencesOf: () => Promise.resolve(overrides),
    savePreference: (_userId: string, override: PreferenceOverride) => {
      overrides = [...overrides.filter((row) => row.event !== override.event), override];
      return Promise.resolve();
    },
    deletePreference: (_userId: string, event: string) => {
      overrides = overrides.filter((row) => row.event !== event);
      return Promise.resolve();
    },
  } as unknown as NotificationsRepository;
  const calendar = {
    settings: () =>
      Promise.resolve({
        status: {
          connected: true,
          syncStatus: 'ok',
          googleEmail: 'a@gmail.com',
          lastSyncedAt: null,
        },
        reminderMinutes: reminders.at(-1) ?? 60,
      }),
    setReminderMinutes: (_userId: string, minutes: number) => {
      reminders.push(minutes);
      return Promise.resolve();
    },
  } as unknown as CalendarApi;
  const db = {
    transaction: <T>(work: (tx: unknown) => Promise<T>) => work('tx'),
  } as unknown as Database;
  const service = new SettingsService(db, repository, calendar, new FixedClock(NOW));
  return { service, reminders, overrides: () => overrides };
}

describe('SettingsService', () => {
  it('shows the defaults merged with stored overrides', async () => {
    const { service } = setup();

    expect(await service.get('anya')).toEqual({
      calendar: {
        connected: true,
        syncStatus: 'ok',
        googleEmail: 'a@gmail.com',
        lastSyncedAt: null,
      },
      calendarReminderMinutes: 60,
      emailReminderMinutes: 1440,
      notifications: { assigned: true, dueSoon: true, overdue: true, weeklyDigest: false },
    });
  });

  it('stores a switch only while it differs from the default (FR-38)', async () => {
    const { service, overrides } = setup();

    await service.update('anya', { notifications: { dueSoon: false, weeklyDigest: true } });
    expect(overrides()).toEqual([
      { event: 'taskDueSoon', channel: 'email', enabled: false },
      { event: 'weeklyDigest', channel: 'email', enabled: true },
    ]);

    const settings = await service.update('anya', { notifications: { dueSoon: true } });
    expect(overrides().map((row) => row.event)).toEqual(['weeklyDigest']);
    expect(settings.notifications).toMatchObject({ dueSoon: true, weeklyDigest: true });
  });

  it('keeps the calendar and email reminders apart', async () => {
    const { service, reminders } = setup();

    const settings = await service.update('anya', {
      calendarReminderMinutes: 180,
      emailReminderMinutes: 60,
    });

    expect(reminders).toEqual([180]);
    expect(settings).toMatchObject({ calendarReminderMinutes: 180, emailReminderMinutes: 60 });
  });
});
