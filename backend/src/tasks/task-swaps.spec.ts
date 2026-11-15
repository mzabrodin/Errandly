import { FixedClock } from '../common/clock.js';
import { DomainError } from '../common/errors/domain-error.js';
import type { EventBus } from '../common/events/event-bus.js';
import type { Database } from '../db/database.js';
import type { GroupMember, GroupsApi } from '../groups/index.js';
import type { UsersApi } from '../users/index.js';
import { LeastLoadRotationStrategy } from './assignment/least-load-rotation.strategy.js';
import { TaskPlanner } from './task-planner.js';
import type { TaskSwapsRepository } from './task-swaps.repository.js';
import { TaskSwaps } from './task-swaps.service.js';
import type { TaskChanges, TasksRepository, TaskWithSeries } from './tasks.repository.js';
import type { NewTaskSwapRow, TaskSwapRow } from './tasks.schema.js';

const NOW = new Date('2026-11-14T10:00:00Z');
const G = 'g1';

function task(id: string, assigneeId: string | null, dueAt: string, groupId = G): TaskWithSeries {
  return {
    id,
    seriesId: `s-${id}`,
    groupId,
    title: id,
    description: '',
    dueAt: new Date(dueAt),
    difficulty: 2,
    assigneeId,
    manuallyAssigned: false,
    completedAt: null,
    completedBy: null,
    createdAt: NOW,
    updatedAt: NOW,
    series: { recurrenceType: 'once', weekdays: [], timezone: 'Europe/Kyiv' },
  };
}

class FakeTasks {
  readonly locked: string[] = [];

  constructor(readonly rows: TaskWithSeries[]) {}

  findTask(id: string) {
    return Promise.resolve(this.rows.find((row) => row.id === id));
  }

  findTasks(ids: readonly string[]) {
    return Promise.resolve(this.rows.filter((row) => ids.includes(row.id)));
  }

  lockTask(id: string) {
    this.locked.push(id);
    return this.findTask(id);
  }

  updateTask(id: string, changes: TaskChanges) {
    const row = this.rows.find((item) => item.id === id);
    if (row) Object.assign(row, changes);
    return Promise.resolve();
  }
}

class FakeSwaps {
  readonly rows: TaskSwapRow[] = [];

  insert(values: NewTaskSwapRow) {
    const row = {
      id: `w${this.rows.length + 1}`,
      status: 'pending',
      createdAt: NOW,
      decidedAt: null,
      ...values,
    } as TaskSwapRow;
    this.rows.push(row);
    return Promise.resolve(row);
  }

  find(id: string) {
    return Promise.resolve(this.rows.find((row) => row.id === id));
  }

  lock(id: string) {
    return this.find(id);
  }

  findPending(offeredTaskId: string, requestedTaskId: string) {
    return Promise.resolve(
      this.rows.find(
        (row) =>
          row.offeredTaskId === offeredTaskId &&
          row.requestedTaskId === requestedTaskId &&
          row.status === 'pending',
      ),
    );
  }

  pendingOf(groupId: string, userId: string) {
    return Promise.resolve(
      this.rows.filter(
        (row) =>
          row.groupId === groupId &&
          row.status === 'pending' &&
          (row.proposerId === userId || row.recipientId === userId),
      ),
    );
  }

  decide(id: string, status: TaskSwapRow['status'], at: Date) {
    const row = this.rows.find((item) => item.id === id);
    if (row) Object.assign(row, { status, decidedAt: at });
    return Promise.resolve();
  }
}

function setup(members: GroupMember[] = []) {
  const tasks = new FakeTasks([
    task('mine', 'anya', '2026-11-16T18:00:00Z'),
    task('his', 'bohdan', '2026-11-17T18:00:00Z'),
    task('hers', 'olena', '2026-11-18T18:00:00Z'),
    task('free', null, '2026-11-18T18:00:00Z'),
    task('elsewhere', 'bohdan', '2026-11-18T18:00:00Z', 'g2'),
  ]);
  const swaps = new FakeSwaps();
  const published: [string, Record<string, unknown>][] = [];
  const bus = {
    publish: (_tx: unknown, type: string, event: Record<string, unknown>) => {
      published.push([type, event]);
      return Promise.resolve();
    },
  } as unknown as EventBus;
  const groups = {
    requireMember: (groupId: string, userId: string) =>
      groupId === G && userId !== 'stranger'
        ? Promise.resolve('member')
        : Promise.reject(new DomainError('FORBIDDEN')),
    members: () => Promise.resolve(members),
  } as unknown as GroupsApi;
  const db = {
    transaction: <T>(work: (tx: unknown) => Promise<T>) => work('tx'),
  } as unknown as Database;
  const service = new TaskSwaps(
    db,
    swaps as unknown as TaskSwapsRepository,
    tasks as unknown as TasksRepository,
    new TaskPlanner(
      tasks as unknown as TasksRepository,
      groups,
      {} as UsersApi,
      new LeastLoadRotationStrategy(),
      bus,
    ),
    groups,
    bus,
    new FixedClock(NOW),
  );
  return { service, tasks, swaps, published };
}

function assigneeOf(tasks: FakeTasks, id: string): string | null | undefined {
  return tasks.rows.find((row) => row.id === id)?.assigneeId;
}

describe('TaskSwaps', () => {
  it('proposes a swap once, however often it is asked', async () => {
    const { service, swaps, published } = setup();

    const first = await service.propose('mine', 'anya', 'his');
    const again = await service.propose('mine', 'anya', 'his');

    expect(again.id).toBe(first.id);
    expect(first).toMatchObject({
      status: 'pending',
      proposerId: 'anya',
      recipientId: 'bohdan',
      offeredTask: { id: 'mine', dueAt: '2026-11-16T18:00:00.000Z' },
      requestedTask: { id: 'his' },
    });
    expect(swaps.rows).toHaveLength(1);
    expect(published).toEqual([
      [
        'task.swapProposed',
        {
          swapId: first.id,
          groupId: G,
          proposerId: 'anya',
          recipientId: 'bohdan',
          offeredTaskId: 'mine',
        },
      ],
    ]);
  });

  it('only lets the assignee offer a task', async () => {
    await expect(setup().service.propose('his', 'anya', 'mine')).rejects.toMatchObject({
      code: 'NOT_ASSIGNEE',
    });
  });

  it.each(['free', 'elsewhere', 'mine', 'missing'])(
    'rejects %s as the requested task',
    async (requested) => {
      const { service } = setup();

      await expect(service.propose('mine', 'anya', requested)).rejects.toMatchObject({
        code: 'VALIDATION',
        details: { fields: { requestedTaskId: 'invalid' } },
      });
    },
  );

  it('refuses a swap that leaves a task with someone who is away', async () => {
    const { service } = setup([
      { userId: 'bohdan', role: 'member', absences: [{ from: '2026-11-16', to: '2026-11-16' }] },
    ]);

    await expect(service.propose('mine', 'anya', 'his')).rejects.toMatchObject({
      code: 'MEMBER_ABSENT',
    });
  });

  it('swaps both assignees when the recipient accepts, locking the tasks in a fixed order', async () => {
    const { service, tasks, published } = setup();
    const swap = await service.propose('mine', 'anya', 'his');
    published.length = 0;

    const accepted = await service.accept(swap.id, 'bohdan');

    expect(accepted.status).toBe('accepted');
    expect(assigneeOf(tasks, 'mine')).toBe('bohdan');
    expect(assigneeOf(tasks, 'his')).toBe('anya');
    expect(tasks.rows.find((row) => row.id === 'mine')?.manuallyAssigned).toBe(true);
    expect(tasks.locked).toEqual(['his', 'mine']);
    expect(published.map(([type]) => type)).toEqual([
      'task.assigned',
      'task.assigned',
      'task.swapDecided',
    ]);
    expect(published[0]?.[1]).toMatchObject({
      taskId: 'mine',
      assigneeId: 'bohdan',
      previousAssigneeId: 'anya',
      actorId: 'bohdan',
    });
    expect(published[2]?.[1]).toMatchObject({ accepted: true });
  });

  it('treats a second accept as done and does not swap back', async () => {
    const { service, tasks } = setup();
    const swap = await service.propose('mine', 'anya', 'his');
    await service.accept(swap.id, 'bohdan');

    await service.accept(swap.id, 'bohdan');

    expect(assigneeOf(tasks, 'mine')).toBe('bohdan');
  });

  it('refuses to accept once a task changed hands, and stops listing the swap', async () => {
    const { service, tasks, swaps } = setup();
    const swap = await service.propose('mine', 'anya', 'his');
    await tasks.updateTask('his', { assigneeId: 'olena' });

    await expect(service.accept(swap.id, 'bohdan')).rejects.toMatchObject({ code: 'SWAP_STALE' });
    expect(assigneeOf(tasks, 'mine')).toBe('anya');
    expect(await service.list(G, 'anya')).toEqual([]);
    expect(swaps.rows[0]?.status).toBe('pending');
  });

  it('only lets the recipient answer and only the proposer cancel', async () => {
    const { service } = setup();
    const swap = await service.propose('mine', 'anya', 'his');

    await expect(service.accept(swap.id, 'anya')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(service.decline(swap.id, 'olena')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(service.cancel(swap.id, 'bohdan')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(service.accept(swap.id, 'stranger')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(service.accept('missing', 'bohdan')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('leaves the tasks alone when the recipient declines', async () => {
    const { service, tasks, published } = setup();
    const swap = await service.propose('mine', 'anya', 'his');

    const declined = await service.decline(swap.id, 'bohdan');
    await service.decline(swap.id, 'bohdan');

    expect(declined.status).toBe('declined');
    expect(assigneeOf(tasks, 'mine')).toBe('anya');
    expect(published.filter(([type]) => type === 'task.swapDecided')).toEqual([
      ['task.swapDecided', expect.objectContaining({ accepted: false })],
    ]);
    await expect(service.accept(swap.id, 'bohdan')).rejects.toMatchObject({ code: 'SWAP_STALE' });
  });

  it('lets the proposer withdraw a pending swap', async () => {
    const { service } = setup();
    const swap = await service.propose('mine', 'anya', 'his');

    await service.cancel(swap.id, 'anya');
    await service.cancel(swap.id, 'anya');

    expect(await service.list(G, 'bohdan')).toEqual([]);
    await expect(service.accept(swap.id, 'bohdan')).rejects.toMatchObject({ code: 'SWAP_STALE' });
  });

  it('lists the pending swaps to both sides and nobody else', async () => {
    const { service } = setup();
    const swap = await service.propose('mine', 'anya', 'his');

    expect((await service.list(G, 'anya')).map(({ id }) => id)).toEqual([swap.id]);
    expect((await service.list(G, 'bohdan')).map(({ id }) => id)).toEqual([swap.id]);
    expect(await service.list(G, 'olena')).toEqual([]);
    await expect(service.list(G, 'stranger')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('replaces an old proposal of the same pair after the tasks changed hands', async () => {
    const { service, tasks, swaps } = setup();
    const old = await service.propose('his', 'bohdan', 'hers');
    await tasks.updateTask('his', { assigneeId: 'anya' });

    const fresh = await service.propose('his', 'anya', 'hers');

    expect(fresh.id).not.toBe(old.id);
    expect(swaps.rows.map(({ status }) => status)).toEqual(['cancelled', 'pending']);
  });
});
