import { emailTokens, sessions } from '../src/auth/auth.schema.js';
import { eventPublications } from '../src/common/events/event-publications.schema.js';
import { DataRetention } from '../src/common/retention.js';
import { absences, groups, invites, memberships } from '../src/groups/groups.schema.js';
import {
  notifications,
  taskReminders,
  weeklyDigests,
} from '../src/notifications/notifications.schema.js';
import { tasks, taskSeries } from '../src/tasks/tasks.schema.js';
import { createUser } from './support/factories.js';
import { createTestApp, type TestApp } from './support/test-app.js';

const DAY = 24 * 60 * 60 * 1000;

describe('Data retention (integration)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
  });

  afterAll(async () => {
    await t.close();
  });

  const daysAgo = (days: number): Date => new Date(t.clock.now().getTime() - days * DAY);

  /** Inserts rows to be purged (`old*`) and rows to be kept (`kept*`) in every purged table */
  async function seed(): Promise<void> {
    const user = await createUser(t.db);
    const userId = user.id;
    const later = new Date(t.clock.now().getTime() + DAY);

    await t.db.insert(sessions).values([
      { id: 'old-session', userId, expiresAt: daysAgo(1) },
      { id: 'kept-session', userId, expiresAt: later },
    ]);
    await t.db.insert(emailTokens).values([
      {
        userId,
        purpose: 'verifyEmail',
        tokenHash: 'old-used',
        expiresAt: later,
        usedAt: daysAgo(1),
      },
      { userId, purpose: 'verifyEmail', tokenHash: 'old-expired', expiresAt: daysAgo(1) },
      { userId, purpose: 'verifyEmail', tokenHash: 'kept-token', expiresAt: later },
    ]);

    const [group] = await t.db.insert(groups).values({ name: 'Room 12' }).returning();
    const groupId = group?.id ?? '';
    await t.db.insert(invites).values([
      { groupId, tokenHash: 'old-expired', expiresAt: daysAgo(31) },
      { groupId, tokenHash: 'old-revoked', expiresAt: later, revokedAt: daysAgo(31) },
      // Still answers "invalid" for a while
      { groupId, tokenHash: 'kept-expired', expiresAt: daysAgo(3) },
      { groupId, tokenHash: 'kept-live', expiresAt: later },
    ]);

    await t.db.insert(memberships).values({ groupId, userId, role: 'admin', color: '#e6f36b' });
    await t.db.insert(absences).values([
      { groupId, userId, startsOn: '2026-09-01', endsOn: '2026-10-09' },
      { groupId, userId, startsOn: '2026-09-01', endsOn: '2026-10-10' },
    ]);

    await t.db.insert(notifications).values([
      { userId, type: 'taskAssigned', readAt: daysAgo(40), createdAt: daysAgo(31) },
      { userId, type: 'taskAssigned', createdAt: daysAgo(91) },
      { userId, type: 'taskOverdue', createdAt: daysAgo(31) },
      { userId, type: 'taskOverdue', readAt: daysAgo(1), createdAt: daysAgo(2) },
    ]);

    const [series] = await t.db
      .insert(taskSeries)
      .values({
        groupId,
        title: 'Dishes',
        difficulty: 2,
        recurrenceType: 'once',
        startsAt: daysAgo(8),
        materializedUntil: daysAgo(8),
      })
      .returning();
    const [task] = await t.db
      .insert(tasks)
      .values({
        seriesId: series?.id ?? '',
        groupId,
        title: 'Dishes',
        dueAt: daysAgo(8),
        difficulty: 2,
      })
      .returning();
    const taskId = task?.id ?? '';
    await t.db.insert(taskReminders).values([
      { taskId, userId, kind: 'overdue', dueAt: daysAgo(8) },
      { taskId, userId, kind: 'dueSoon', dueAt: daysAgo(1) },
    ]);
    await t.db.insert(weeklyDigests).values([
      { userId, weekStart: '2026-10-05' },
      { userId, weekStart: '2026-11-02' },
    ]);

    const event = { listener: 'test.listener', eventType: 'task.changed', payload: {} };
    await t.db.insert(eventPublications).values([
      { ...event, completedAt: daysAgo(8) },
      { ...event, publishedAt: daysAgo(31), attempts: 5, nextAttemptAt: null },
      { ...event, completedAt: daysAgo(1) },
      // Gave up recently, and one still waiting for its next attempt
      { ...event, publishedAt: daysAgo(2), attempts: 5, nextAttemptAt: null },
      { ...event, publishedAt: daysAgo(31), attempts: 2, nextAttemptAt: later },
    ]);
  }

  it('deletes only what is past its retention period, in every module', async () => {
    await seed();

    await expect(t.app.get(DataRetention).purge()).resolves.toEqual({
      sessions: 1,
      email_tokens: 2,
      invites: 2,
      absences: 1,
      notifications: 2,
      task_reminders: 1,
      weekly_digests: 1,
      event_publications: 2,
    });

    expect((await t.db.select().from(sessions)).map((row) => row.id)).toEqual(['kept-session']);
    expect((await t.db.select().from(emailTokens)).map((row) => row.tokenHash)).toEqual([
      'kept-token',
    ]);
    expect(new Set((await t.db.select().from(invites)).map((row) => row.tokenHash))).toEqual(
      new Set(['kept-expired', 'kept-live']),
    );
    expect((await t.db.select().from(absences)).map((row) => row.endsOn)).toEqual(['2026-10-10']);
    expect(await t.db.$count(notifications)).toBe(2);
    expect((await t.db.select().from(taskReminders)).map((row) => row.kind)).toEqual(['dueSoon']);
    expect((await t.db.select().from(weeklyDigests)).map((row) => row.weekStart)).toEqual([
      '2026-11-02',
    ]);
    expect(await t.db.$count(eventPublications)).toBe(3);
  });

  it('finds nothing more on a second run', async () => {
    await seed();
    await t.app.get(DataRetention).purge();

    const again = await t.app.get(DataRetention).purge();

    expect(Object.values(again).every((count) => count === 0)).toBe(true);
  });
});
