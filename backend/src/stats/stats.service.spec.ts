import { FixedClock } from '../common/clock.js';
import { DomainError } from '../common/errors/domain-error.js';
import type { GroupsApi } from '../groups/index.js';
import type { TasksApi, TaskView } from '../tasks/index.js';
import { StatsService } from './stats.service.js';

const NOW = new Date('2026-11-15T12:00:00Z');

function setup(member: boolean) {
  const inGroup = vi.fn<TasksApi['inGroup']>().mockResolvedValue([
    {
      assigneeId: 'oleh',
      dueAt: new Date('2026-11-14T12:00:00Z'),
      completedAt: new Date('2026-11-14T10:00:00Z'),
      difficulty: 3,
    } as TaskView,
  ]);
  const groups = {
    requireMember: () =>
      member ? Promise.resolve('member') : Promise.reject(new DomainError('FORBIDDEN')),
    members: () => Promise.resolve([{ userId: 'anya' }, { userId: 'oleh' }]),
  } as unknown as GroupsApi;
  const service = new StatsService(groups, { inGroup } as unknown as TasksApi, new FixedClock(NOW));
  return { service, inGroup };
}

describe('StatsService', () => {
  it('counts every current member over the chosen period', async () => {
    const { service, inGroup } = setup(true);

    await expect(service.forGroup('g1', 'anya', 'week')).resolves.toEqual([
      expect.objectContaining({ userId: 'anya', done: 0, difficulty: 0 }),
      expect.objectContaining({ userId: 'oleh', done: 1, difficulty: 3 }),
    ]);
    expect(inGroup).toHaveBeenCalledWith('g1', new Date('2026-11-08T12:00:00Z'), NOW);
  });

  it('reads nothing for an outsider (FR-40)', async () => {
    const { service, inGroup } = setup(false);

    await expect(service.forGroup('g1', 'stranger', 'month')).rejects.toEqual(
      new DomainError('FORBIDDEN'),
    );
    expect(inGroup).not.toHaveBeenCalled();
  });
});
