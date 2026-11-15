import { eq } from 'drizzle-orm';

import { createDatabase, createPool, type Database } from '../src/db/database.js';
import { truncateAll } from '../src/db/tables.js';
import { groups, memberships } from '../src/groups/groups.schema.js';
import { taskReminders } from '../src/notifications/notifications.schema.js';
import { tasks, taskSeries } from '../src/tasks/tasks.schema.js';
import type { UserRow } from '../src/users/users.schema.js';

const HOUR = 60 * 60 * 1000;

async function seedWhileDown(db: Database, user: UserRow, now: Date) {
  const [group] = await db.insert(groups).values({ name: 'Room 12' }).returning();
  const groupId = group?.id ?? '';
  await db
    .insert(memberships)
    .values({ groupId, userId: user.id, role: 'admin', color: '#e6f36b' });
  const [series] = await db
    .insert(taskSeries)
    .values({
      groupId,
      title: 'Dishes',
      difficulty: 2,
      recurrenceType: 'daily',
      startsAt: new Date(now.getTime() - HOUR),
      materializedUntil: new Date(now.getTime() - HOUR),
    })
    .returning();
  const seriesId = series?.id ?? '';
  const [overdue] = await db
    .insert(tasks)
    .values({
      seriesId,
      groupId,
      title: 'Dishes',
      dueAt: new Date(now.getTime() - HOUR),
      difficulty: 2,
      assigneeId: user.id,
    })
    .returning();
  return { seriesId, overdueId: overdue?.id ?? '' };
}

// SYS-25; the app module is imported only after the scheduler is switched on
describe('Catch-up after downtime (integration)', () => {
  const schedulerEnabled = process.env['SCHEDULER_ENABLED'];

  // The files share one process, and the next ones expect the scheduler off
  afterAll(() => {
    process.env['SCHEDULER_ENABLED'] = schedulerEnabled;
  });

  it('tops up series and records missed reminders as soon as the server starts', async () => {
    process.env['SCHEDULER_ENABLED'] = 'true';
    const { createTestApp, START } = await import('./support/test-app.js');
    const { createUser } = await import('./support/factories.js');
    const pool = createPool(process.env['DATABASE_URL'] ?? '');
    const db = createDatabase(pool, { logQueries: false });
    await truncateAll(db);
    const { seriesId, overdueId } = await seedWhileDown(db, await createUser(db), START);
    await pool.end();

    const t = await createTestApp();
    try {
      await vi.waitFor(async () => {
        expect(await t.db.$count(tasks, eq(tasks.seriesId, seriesId))).toBe(29);
        expect(await t.db.select().from(taskReminders)).toEqual([
          expect.objectContaining({ taskId: overdueId, kind: 'overdue' }),
        ]);
      }, 10_000);
    } finally {
      await t.close();
    }
  }, 30_000);
});
