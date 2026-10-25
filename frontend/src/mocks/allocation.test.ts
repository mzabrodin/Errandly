import { pickAssignee, type AllocationMember, type AllocationTask } from './allocation';

const anya: AllocationMember = { userId: 'anya', name: 'Аня', absences: [] };
const bohdan: AllocationMember = {
  userId: 'bohdan',
  name: 'Богдан',
  absences: [],
};

function done(assigneeId: string, dueAt: string, difficulty: number, seriesId = 's-other') {
  return { assigneeId, dueAt, difficulty, seriesId } satisfies AllocationTask;
}

describe('pickAssignee', () => {
  it('assigns to the member with the lowest load (BDD scenario 1)', () => {
    const tasks = [
      done('anya', '2026-10-20T10:00:00Z', 6),
      done('bohdan', '2026-10-20T10:00:00Z', 3),
    ];
    const assignee = pickAssignee([anya, bohdan], tasks, {
      seriesId: 'floor',
      dueAt: '2026-10-25T10:00:00Z',
    });
    expect(assignee).toBe('bohdan');
  });

  it('ignores tasks older than 4 weeks', () => {
    const tasks = [
      done('anya', '2026-09-01T10:00:00Z', 10),
      done('bohdan', '2026-10-20T10:00:00Z', 1),
    ];
    expect(
      pickAssignee([anya, bohdan], tasks, {
        seriesId: 's',
        dueAt: '2026-10-25T10:00:00Z',
      }),
    ).toBe('anya');
  });

  it('skips absent members (BDD scenario 2)', () => {
    const away = {
      ...bohdan,
      absences: [{ from: '2026-10-01', to: '2026-10-07' }],
    };
    const tasks = [done('anya', '2026-09-30T10:00:00Z', 6)];
    expect(
      pickAssignee([anya, away], tasks, {
        seriesId: 's',
        dueAt: '2026-10-03T10:00:00Z',
      }),
    ).toBe('anya');
  });

  it('on equal load picks who has not done this task the longest', () => {
    const tasks = [
      done('anya', '2026-10-20T10:00:00Z', 2, 'trash'),
      done('bohdan', '2026-10-13T10:00:00Z', 2, 'trash'),
    ];
    expect(
      pickAssignee([anya, bohdan], tasks, {
        seriesId: 'trash',
        dueAt: '2026-10-25T10:00:00Z',
      }),
    ).toBe('bohdan');
  });

  it('returns null when nobody is available', () => {
    const away = {
      ...anya,
      absences: [{ from: '2026-10-01', to: '2026-10-31' }],
    };
    expect(
      pickAssignee([away], [], {
        seriesId: 's',
        dueAt: '2026-10-10T10:00:00Z',
      }),
    ).toBeNull();
  });
});
