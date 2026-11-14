import type { TaskView } from '../tasks/index.js';
import { memberStats, periodStart } from './stats.rules.js';

const NOW = new Date('2026-11-16T12:00:00Z');

function task(overrides: Partial<TaskView>): TaskView {
  return {
    id: 't',
    groupId: 'g1',
    title: 'Trash',
    description: '',
    dueAt: new Date('2026-11-15T18:00:00Z'),
    difficulty: 2,
    assigneeId: 'anya',
    completedAt: null,
    ...overrides,
  };
}

describe('stats rules', () => {
  it('looks back 7 or 30 days', () => {
    expect(periodStart('week', NOW)).toEqual(new Date('2026-11-09T12:00:00Z'));
    expect(periodStart('month', NOW)).toEqual(new Date('2026-10-17T12:00:00Z'));
  });

  it('counts done, overdue and done difficulty per current member, zeros included', () => {
    const stats = memberStats(
      ['anya', 'bohdan', 'olena'],
      [
        task({ completedAt: NOW, difficulty: 3 }),
        task({ completedAt: NOW, difficulty: 2 }),
        task({}),
        task({ assigneeId: 'bohdan', dueAt: new Date('2026-11-16T18:00:00Z') }),
        task({ assigneeId: 'left-the-group', completedAt: NOW }),
        task({ assigneeId: null }),
      ],
      NOW,
    );

    expect(stats).toEqual([
      { userId: 'anya', done: 2, overdue: 1, difficulty: 5 },
      { userId: 'bohdan', done: 0, overdue: 0, difficulty: 0 },
      { userId: 'olena', done: 0, overdue: 0, difficulty: 0 },
    ]);
  });
});
