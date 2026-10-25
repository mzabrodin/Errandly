import { startOfDay } from 'date-fns';

import type { Task, TaskStatus } from '../../shared/api/types';
import { groupByDay } from '../../shared/lib/dates';

export type TaskScope = 'mine' | 'all';

export interface TaskFilters {
  scope: TaskScope;
  status: TaskStatus | null;
}

export interface ArrangedTasks {
  overdue: Task[];
  days: { day: Date; items: Task[] }[];
}

/** Розкладає задачі на «прострочені» та «за днями» відповідно до фільтрів (FR-23) */
export function arrangeTasks(
  tasks: Task[],
  filters: TaskFilters,
  userId: string,
  now = new Date(),
): ArrangedTasks {
  const visible = tasks.filter(
    (task) =>
      (filters.scope === 'all' || task.assigneeId === userId) &&
      (filters.status === null || task.status === filters.status),
  );

  if (filters.status !== null) {
    const ordered =
      filters.status === 'done'
        ? visible.toSorted((a, b) => b.dueAt.localeCompare(a.dueAt))
        : visible;
    return {
      overdue: [],
      days: groupByDay(ordered, (task) => new Date(task.dueAt)),
    };
  }

  const today = startOfDay(now).getTime();
  return {
    overdue: visible.filter((task) => task.status === 'overdue'),
    days: groupByDay(
      visible.filter(
        (task) => task.status !== 'overdue' && new Date(task.dueAt).getTime() >= today,
      ),
      (task) => new Date(task.dueAt),
    ),
  };
}
