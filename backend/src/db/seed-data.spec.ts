import { LIMITS } from '../common/domain.js';
import { buildSeed } from './seed-data.js';

describe('buildSeed', () => {
  const now = new Date('2026-11-09T12:00:00.000Z');
  const data = buildSeed(now, 'hash');

  it('creates the demo accounts with the given password hash', () => {
    expect(data.users.map((user) => user.email)).toEqual([
      'anya@errandly.dev',
      'bohdan@errandly.dev',
      'marta@errandly.dev',
      'oleh@errandly.dev',
    ]);
    expect(data.passwordCredentials.map((row) => row.userId)).toEqual(
      data.users.map((user) => user.id),
    );
    expect(data.passwordCredentials.every((row) => row.passwordHash === 'hash')).toBe(true);
  });

  it('keeps an admin in every group', () => {
    for (const group of data.groups) {
      const admins = data.memberships.filter((m) => m.groupId === group.id && m.role === 'admin');
      expect(admins.length).toBeGreaterThan(0);
    }
  });

  it('materialises the series up to the 4-week horizon without duplicates', () => {
    const keys = data.tasks.map((task) => `${task.seriesId}|${task.dueAt.toISOString()}`);
    expect(new Set(keys).size).toBe(keys.length);
    const horizon = now.getTime() + 28 * 24 * 60 * 60 * 1000;
    expect(data.tasks.every((task) => task.dueAt.getTime() <= horizon)).toBe(true);
    expect(
      data.tasks.every(
        (task) =>
          task.difficulty >= LIMITS.difficultyMin && task.difficulty <= LIMITS.difficultyMax,
      ),
    ).toBe(true);
  });

  it('assigns only members of the task group who are not absent that day', () => {
    const misassigned = data.tasks.filter((task) => {
      if (task.assigneeId === null || task.manuallyAssigned === true) return false;
      const day = task.dueAt.toISOString().slice(0, 10);
      const isMember = data.memberships.some(
        (m) => m.groupId === task.groupId && m.userId === task.assigneeId,
      );
      const isAbsent = data.absences.some(
        (a) =>
          a.userId === task.assigneeId &&
          a.groupId === task.groupId &&
          a.startsOn <= day &&
          day <= a.endsOn,
      );
      return !isMember || isAbsent;
    });
    expect(misassigned).toEqual([]);
  });

  it('completes most past tasks and leaves future ones open', () => {
    const past = data.tasks.filter((task) => task.dueAt < now);
    const done = past.filter((task) => task.completedAt !== null);
    expect(done.length).toBeGreaterThan(past.length / 2);
    expect(done.length).toBeLessThan(past.length);
    expect(
      data.tasks.filter((task) => task.dueAt > now).every((task) => task.completedAt === null),
    ).toBe(true);
  });

  it('only uses weekdays 1–7 and gives weekly series at least one', () => {
    const weekdays = data.taskSeries.map((series) => series.weekdays ?? []);
    expect(weekdays.flat().every((day) => day >= 1 && day <= 7)).toBe(true);
    const weekly = data.taskSeries.filter((series) => series.recurrenceType === 'weekly');
    expect(weekly.every((series) => (series.weekdays ?? []).length > 0)).toBe(true);
  });
});
