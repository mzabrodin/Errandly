import type { StatsPeriod } from '../common/domain.js';
import type { TaskView } from '../tasks/index.js';
import type { MemberStatsDto } from './dto/stats.dto.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS: Record<StatsPeriod, number> = { week: 7, month: 30 };

export function periodStart(period: StatsPeriod, now: Date): Date {
  return new Date(now.getTime() - PERIOD_DAYS[period] * DAY_MS);
}

/** Tasks due in the period, counted for whoever holds them now; former members are left out */
export function memberStats(
  memberIds: readonly string[],
  tasks: readonly TaskView[],
  now: Date,
): MemberStatsDto[] {
  return memberIds.map((userId) => {
    const own = tasks.filter((task) => task.assigneeId === userId);
    const done = own.filter((task) => task.completedAt !== null);
    return {
      userId,
      done: done.length,
      overdue: own.filter((task) => task.completedAt === null && task.dueAt < now).length,
      difficulty: done.reduce((sum, task) => sum + task.difficulty, 0),
    };
  });
}
