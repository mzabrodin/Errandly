import type { Task } from '../../shared/api/types';
import { canProposeSwap, swapCandidates } from './swaps';

function task(partial: Partial<Task>): Task {
  return {
    id: Math.random().toString(),
    seriesId: 's',
    groupId: 'g',
    title: 'Task',
    description: '',
    dueAt: '2026-11-20T10:00:00.000Z',
    difficulty: 2,
    recurrence: { type: 'once' },
    status: 'planned',
    assigneeId: 'me',
    manuallyAssigned: false,
    completedAt: null,
    ...partial,
  };
}

describe('canProposeSwap', () => {
  it('offers only my own planned task', () => {
    expect(canProposeSwap(task({}), 'me')).toBe(true);
    expect(canProposeSwap(task({ assigneeId: 'bohdan' }), 'me')).toBe(false);
    expect(canProposeSwap(task({ status: 'done' }), 'me')).toBe(false);
    expect(canProposeSwap(task({ status: 'overdue' }), 'me')).toBe(false);
  });
});

describe('swapCandidates', () => {
  it('groups the other members’ planned tasks by assignee, soonest first', () => {
    const later = task({ id: 'later', assigneeId: 'bohdan', dueAt: '2026-11-22T10:00:00.000Z' });
    const sooner = task({ id: 'sooner', assigneeId: 'bohdan', dueAt: '2026-11-21T10:00:00.000Z' });
    const candidates = swapCandidates(
      [
        later,
        task({ id: 'mine' }),
        task({ id: 'free', assigneeId: null, status: 'unassigned' }),
        task({ id: 'done', assigneeId: 'marta', status: 'done' }),
        task({ id: 'marta', assigneeId: 'marta' }),
        sooner,
      ],
      'me',
    );

    expect([...candidates.keys()]).toEqual(['marta', 'bohdan']);
    expect(candidates.get('bohdan')?.map(({ id }) => id)).toEqual(['sooner', 'later']);
  });
});
