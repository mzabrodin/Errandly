import type { Task } from '../../shared/api/types';
import { arrangeTasks } from './filterTasks';

function task(partial: Partial<Task>): Task {
  return {
    id: Math.random().toString(),
    seriesId: 's',
    groupId: 'g',
    title: 'Задача',
    description: '',
    dueAt: '2026-10-25T10:00:00.000Z',
    difficulty: 2,
    recurrence: { type: 'once' },
    status: 'planned',
    assigneeId: 'me',
    manuallyAssigned: false,
    completedAt: null,
    ...partial,
  };
}

const now = new Date('2026-10-25T08:00:00.000Z');

describe('arrangeTasks', () => {
  const tasks = [
    task({ id: 'old-done', dueAt: '2026-10-20T10:00:00.000Z', status: 'done' }),
    task({ id: 'late', dueAt: '2026-10-24T10:00:00.000Z', status: 'overdue' }),
    task({ id: 'today', dueAt: '2026-10-25T18:00:00.000Z' }),
    task({
      id: 'theirs',
      dueAt: '2026-10-26T10:00:00.000Z',
      assigneeId: 'other',
    }),
  ];

  it('shows only my tasks in "mine" scope', () => {
    const { overdue, days } = arrangeTasks(tasks, { scope: 'mine', status: null }, 'me', now);
    expect(overdue.map((item) => item.id)).toEqual(['late']);
    expect(days.flatMap((day) => day.items.map((item) => item.id))).toEqual(['today']);
  });

  it('shows everyone in "all" scope and hides past done tasks', () => {
    const { days } = arrangeTasks(tasks, { scope: 'all', status: null }, 'me', now);
    expect(days.flatMap((day) => day.items.map((item) => item.id))).toEqual(['today', 'theirs']);
  });

  it('filters by status', () => {
    const { overdue, days } = arrangeTasks(tasks, { scope: 'all', status: 'done' }, 'me', now);
    expect(overdue).toEqual([]);
    expect(days.flatMap((day) => day.items.map((item) => item.id))).toEqual(['old-done']);
  });
});
