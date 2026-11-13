import type { ConfigService } from '@nestjs/config';

import { FixedClock } from '../common/clock.js';
import type { GroupRole } from '../common/domain.js';
import { DomainError } from '../common/errors/domain-error.js';
import type { EventBus } from '../common/events/event-bus.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import type { Database, DbExecutor } from '../db/database.js';
import type { GroupMember, GroupsApi } from '../groups/index.js';
import type { UserDto, UsersApi } from '../users/index.js';
import { LeastLoadRotationStrategy } from './assignment/least-load-rotation.strategy.js';
import type { CreateTaskDto } from './dto/task.dto.js';
import { SeriesTopUp } from './series-top-up.js';
import { TaskPlanner } from './task-planner.js';
import { TaskRedistribution } from './task-redistribution.js';
import type {
  SeriesChanges,
  TaskChanges,
  TaskFilter,
  TasksRepository,
  TaskWithSeries,
} from './tasks.repository.js';
import type { NewTaskRow, NewTaskSeriesRow, TaskRow, TaskSeriesRow } from './tasks.schema.js';
import { TasksService } from './tasks.service.js';

const NOW = new Date('2026-11-13T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const G = 'g1';
const TX = 'tx' as unknown as DbExecutor;

class FakeRepository {
  series: TaskSeriesRow[] = [];
  tasks: TaskRow[] = [];
  private seq = 0;

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}${this.seq}`;
  }

  insertSeries(values: NewTaskSeriesRow) {
    const row: TaskSeriesRow = {
      id: this.nextId('s'),
      description: '',
      weekdays: [],
      createdBy: null,
      createdAt: NOW,
      timezone: 'Europe/Kyiv',
      endedAt: null,
      assigneeId: null,
      ...values,
    } as TaskSeriesRow;
    this.series.push(row);
    return Promise.resolve(row);
  }

  findSeries(id: string) {
    return Promise.resolve(this.series.find((row) => row.id === id));
  }

  updateSeries(id: string, changes: SeriesChanges) {
    const row = this.series.find((item) => item.id === id);
    if (row) Object.assign(row, changes);
    return Promise.resolve();
  }

  clearSeriesAssignee(groupId: string, userId: string) {
    for (const row of this.series) {
      if (row.groupId === groupId && row.assigneeId === userId) row.assigneeId = null;
    }
    return Promise.resolve();
  }

  deleteSeries(id: string) {
    this.series = this.series.filter((row) => row.id !== id);
    return Promise.resolve();
  }

  seriesToTopUp(threshold: Date) {
    return Promise.resolve(
      this.series.filter(
        (row) =>
          row.materializedUntil < threshold &&
          row.endedAt === null &&
          row.recurrenceType !== 'once',
      ),
    );
  }

  insertTasks(rows: NewTaskRow[]) {
    const inserted: TaskRow[] = [];
    for (const values of rows) {
      const clash = this.tasks.some(
        (task) =>
          task.seriesId === values.seriesId && task.dueAt.getTime() === values.dueAt.getTime(),
      );
      if (clash) continue;
      const row = {
        id: this.nextId('t'),
        description: '',
        assigneeId: null,
        manuallyAssigned: false,
        completedAt: null,
        completedBy: null,
        createdAt: NOW,
        updatedAt: NOW,
        ...values,
      } as TaskRow;
      this.tasks.push(row);
      inserted.push(row);
    }
    return Promise.resolve(inserted);
  }

  private join(task: TaskRow): TaskWithSeries {
    const series = this.series.find((row) => row.id === task.seriesId);
    if (!series) throw new Error(`no series ${task.seriesId}`);
    return {
      ...task,
      series: {
        recurrenceType: series.recurrenceType,
        weekdays: series.weekdays,
        timezone: series.timezone,
      },
    };
  }

  findTask(id: string) {
    const task = this.tasks.find((row) => row.id === id);
    return Promise.resolve(task ? this.join(task) : undefined);
  }

  lockTask(id: string) {
    return Promise.resolve(this.tasks.find((row) => row.id === id));
  }

  updateTask(id: string, changes: TaskChanges) {
    const row = this.tasks.find((item) => item.id === id);
    if (row) Object.assign(row, changes);
    return Promise.resolve();
  }

  deleteTasks(ids: readonly string[]) {
    this.tasks = this.tasks.filter((row) => !ids.includes(row.id));
    return Promise.resolve();
  }

  listTasks(groupId: string, { from, to, seriesId }: TaskFilter) {
    return Promise.resolve(
      this.tasks
        .filter(
          (task) =>
            task.groupId === groupId &&
            (from === undefined || task.dueAt >= from) &&
            (to === undefined || task.dueAt < to) &&
            (seriesId === undefined || task.seriesId === seriesId),
        )
        .toSorted((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
        .map((task) => this.join(task)),
    );
  }

  assignmentHistory(groupId: string, from: Date, to: Date) {
    return Promise.resolve(
      this.tasks
        .filter((task) => task.groupId === groupId && task.dueAt > from && task.dueAt <= to)
        .map(({ seriesId, dueAt, difficulty, assigneeId }) => ({
          seriesId,
          dueAt,
          difficulty,
          assigneeId,
        })),
    );
  }

  openTasksOf(groupId: string, userId: string, after: Date) {
    return Promise.resolve(
      this.tasks
        .filter(
          (task) =>
            task.groupId === groupId &&
            task.assigneeId === userId &&
            task.completedAt === null &&
            task.dueAt > after,
        )
        .toSorted((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
        .map((task) => this.join(task)),
    );
  }

  unfinishedOfSeries(seriesId: string, from?: Date) {
    return Promise.resolve(
      this.tasks.filter(
        (task) =>
          task.seriesId === seriesId &&
          task.completedAt === null &&
          (from === undefined || task.dueAt >= from),
      ),
    );
  }

  countInstances(seriesId: string) {
    return Promise.resolve(this.tasks.filter((task) => task.seriesId === seriesId).length);
  }
}

class FakeGroups {
  roles = new Map<string, GroupRole>([
    ['anya', 'admin'],
    ['bohdan', 'member'],
  ]);
  absences = new Map<string, { from: string; to: string }[]>();

  requireMember(_groupId: string, userId: string) {
    const role = this.roles.get(userId);
    return role === undefined
      ? Promise.reject(new DomainError('FORBIDDEN'))
      : Promise.resolve(role);
  }

  async requireAdmin(groupId: string, userId: string) {
    if ((await this.requireMember(groupId, userId)) !== 'admin') {
      throw new DomainError('ADMIN_ONLY');
    }
  }

  members(): Promise<GroupMember[]> {
    return Promise.resolve(
      [...this.roles].map(([userId, role]) => ({
        userId,
        role,
        absences: this.absences.get(userId) ?? [],
      })),
    );
  }
}

const NAMES: Record<string, string> = { anya: 'Аня', bohdan: 'Богдан', vira: 'Віра' };

const users = {
  findById: (id: string) =>
    Promise.resolve({ id, name: NAMES[id] ?? id, timezone: 'Europe/Kyiv' } as UserDto),
  findMany: (ids: readonly string[]) =>
    Promise.resolve(new Map(ids.map((id) => [id, { id, name: NAMES[id] ?? id } as UserDto]))),
} as unknown as UsersApi;

type Listener = (event: never, tx: DbExecutor) => Promise<void>;

function setup() {
  const repository = new FakeRepository();
  const groups = new FakeGroups();
  const clock = new FixedClock(NOW);
  const published: [string, Record<string, unknown>][] = [];
  const listeners = new Map<string, Listener>();
  const bus = {
    publish: (_tx: unknown, type: string, event: Record<string, unknown>) => {
      published.push([type, event]);
      return Promise.resolve();
    },
    onInTransaction: (type: string, listener: Listener) => {
      listeners.set(type, listener);
    },
  } as unknown as EventBus;
  const db = {
    transaction: <T>(work: (tx: unknown) => Promise<T>) => work('tx'),
  } as unknown as Database;
  const repo = repository as unknown as TasksRepository;
  const groupsApi = groups as unknown as GroupsApi;
  const planner = new TaskPlanner(repo, groupsApi, users, new LeastLoadRotationStrategy(), bus);
  const service = new TasksService(db, repo, planner, groupsApi, users, bus, clock);
  const redistribution = new TaskRedistribution(repo, planner, bus, clock);
  redistribution.onModuleInit();
  const config = { get: () => true } as unknown as ConfigService<EnvironmentVariables, true>;
  const topUp = new SeriesTopUp(db, repo, planner, clock, config);
  return { repository, groups, clock, published, listeners, service, topUp };
}

function input(overrides: Partial<CreateTaskDto> = {}): CreateTaskDto {
  return {
    title: 'Take out the trash',
    description: '',
    difficulty: 2,
    recurrence: { type: 'once' },
    assigneeId: null,
    dueAt: new Date(NOW.getTime() + DAY).toISOString(),
    ...overrides,
  };
}

const weekly = { type: 'weekly' as const, weekdays: [1, 2, 3, 4, 5, 6, 7] };

describe('TasksService', () => {
  it('lets only admins create, and checks a manual assignee is a member', async () => {
    const { service } = setup();

    await expect(service.create(G, 'bohdan', input())).rejects.toEqual(
      new DomainError('ADMIN_ONLY'),
    );
    await expect(service.create(G, 'stranger', input())).rejects.toEqual(
      new DomainError('FORBIDDEN'),
    );
    await expect(service.create(G, 'anya', input({ assigneeId: 'stranger' }))).rejects.toEqual(
      new DomainError('VALIDATION', { fields: { assigneeId: 'invalid' } }),
    );
  });

  it('materialises a series 4 weeks ahead and spreads it by load', async () => {
    const { service, repository, published } = setup();

    const first = await service.create(G, 'anya', input({ recurrence: weekly }));

    expect(first).toMatchObject({ status: 'planned', recurrence: weekly, manuallyAssigned: false });
    expect(repository.tasks).toHaveLength(28);
    const assignedTo = (userId: string) =>
      repository.tasks.filter((task) => task.assigneeId === userId).length;
    expect([assignedTo('anya'), assignedTo('bohdan')]).toEqual([14, 14]);
    expect(published.filter(([type]) => type === 'task.assigned')).toHaveLength(28);
    expect(repository.series[0]).toMatchObject({ timezone: 'Europe/Kyiv', assigneeId: null });
  });

  it('keeps a manual assignee on every instance of the series', async () => {
    const { service, repository } = setup();

    await service.create(G, 'anya', input({ recurrence: { type: 'daily' }, assigneeId: 'bohdan' }));

    expect(new Set(repository.tasks.map((task) => task.assigneeId))).toEqual(new Set(['bohdan']));
    expect(repository.tasks.every((task) => task.manuallyAssigned)).toBe(true);
  });

  it('lists tasks for members only, and answers 404 before 403', async () => {
    const { service } = setup();
    const task = await service.create(G, 'anya', input());

    await expect(service.list(G, 'bohdan', {})).resolves.toHaveLength(1);
    await expect(service.list(G, 'stranger', {})).rejects.toEqual(new DomainError('FORBIDDEN'));
    await expect(service.get(task.id, 'stranger')).rejects.toEqual(new DomainError('FORBIDDEN'));
    await expect(service.get('missing', 'stranger')).rejects.toEqual(new DomainError('NOT_FOUND'));
  });

  it('completes only for the assignee, once, and undoes within 24 hours', async () => {
    const { service, clock, published } = setup();
    const task = await service.create(G, 'anya', input({ assigneeId: 'bohdan' }));

    await expect(service.complete(task.id, 'anya')).rejects.toEqual(
      new DomainError('NOT_ASSIGNEE'),
    );
    await expect(service.complete(task.id, 'bohdan')).resolves.toMatchObject({ status: 'done' });
    await service.complete(task.id, 'bohdan');
    expect(published.filter(([type]) => type === 'task.completed')).toHaveLength(1);

    clock.advance(DAY + 1);
    await expect(service.undoComplete(task.id, 'bohdan')).rejects.toEqual(
      new DomainError('UNDO_EXPIRED'),
    );
    await expect(service.undoComplete(task.id, 'anya')).resolves.toMatchObject({
      completedAt: null,
    });
  });

  it('reassigns by hand, but never a done task', async () => {
    const { service } = setup();
    const task = await service.create(G, 'anya', input({ assigneeId: 'bohdan' }));

    await expect(service.reassign(task.id, 'anya', 'anya')).resolves.toMatchObject({
      assigneeId: 'anya',
      manuallyAssigned: true,
    });
    await expect(service.reassign(task.id, 'anya', 'stranger')).rejects.toBeInstanceOf(DomainError);
    await service.complete(task.id, 'anya');
    await expect(service.reassign(task.id, 'anya', 'bohdan')).rejects.toEqual(
      new DomainError('TASK_DONE'),
    );
  });

  it('checks inPast only when the due date changes', async () => {
    const { service, clock } = setup();
    const task = await service.create(G, 'anya', input());
    clock.advance(2 * DAY);
    const edit = input({ dueAt: task.dueAt, title: 'Renamed' });

    await expect(service.update(task.id, 'anya', 'one', edit)).resolves.toMatchObject({
      title: 'Renamed',
    });
    await expect(
      service.update(
        task.id,
        'anya',
        'one',
        input({ title: 'Renamed', dueAt: new Date(NOW.getTime() + 1000).toISOString() }),
      ),
    ).rejects.toEqual(new DomainError('VALIDATION', { fields: { dueAt: 'inPast' } }));
  });

  it('rebuilds the future of a series and keeps what is done', async () => {
    const { service, repository, clock } = setup();
    const first = await service.create(
      G,
      'anya',
      input({ recurrence: { type: 'daily' }, assigneeId: 'bohdan' }),
    );
    await service.complete(first.id, 'bohdan');
    clock.advance(2 * DAY);

    const rebuilt = await service.update(
      first.id,
      'anya',
      'series',
      input({
        recurrence: { type: 'weekly', weekdays: [1] },
        title: 'Mop the floor',
        dueAt: new Date(clock.now().getTime() + DAY).toISOString(),
      }),
    );

    expect(rebuilt.title).toBe('Mop the floor');
    const future = repository.tasks.filter((task) => task.dueAt > clock.now());
    expect(future.every((task) => task.title === 'Mop the floor')).toBe(true);
    expect(repository.tasks.find((task) => task.id === first.id)?.completedAt).not.toBeNull();
  });

  it('deletes one instance, or the unfinished series while keeping done ones', async () => {
    const { service, repository } = setup();
    const first = await service.create(
      G,
      'anya',
      input({ recurrence: { type: 'daily' }, assigneeId: 'bohdan' }),
    );
    const second = repository.tasks[1];
    await service.complete(first.id, 'bohdan');

    await service.remove(second?.id ?? '', 'anya', 'one');
    expect(repository.tasks).toHaveLength(27);
    await service.remove(first.id, 'anya', 'series');

    expect(repository.tasks.map((task) => task.id)).toEqual([first.id]);
    expect(repository.series[0]?.endedAt).toEqual(NOW);
  });

  it('drops the whole series when nothing done is left', async () => {
    const { service, repository } = setup();
    const task = await service.create(G, 'anya', input());

    await service.remove(task.id, 'anya', 'series');

    expect(repository.series).toHaveLength(0);
  });
});

describe('redistribution', () => {
  it('moves the open tasks of a member who left, manual ones too (FR-15)', async () => {
    const { service, groups, listeners, repository } = setup();
    await service.create(G, 'anya', input({ recurrence: { type: 'daily' }, assigneeId: 'bohdan' }));
    groups.roles.delete('bohdan');

    await listeners.get('group.memberLeft')?.({ groupId: G, userId: 'bohdan' } as never, TX);

    expect(
      repository.tasks.every((task) => task.assigneeId === 'anya' && !task.manuallyAssigned),
    ).toBe(true);
    expect(repository.series[0]?.assigneeId).toBeNull();
  });

  it('moves automatic tasks on absent days and keeps manual ones (FR-17)', async () => {
    const { service, groups, listeners, repository } = setup();
    await service.create(G, 'anya', input({ recurrence: { type: 'daily' } }));
    const manual = await service.create(
      G,
      'anya',
      input({ assigneeId: 'bohdan', title: 'Manual' }),
    );
    groups.absences.set('bohdan', [{ from: '2026-11-01', to: '2026-12-31' }]);

    await listeners.get('group.absenceAdded')?.(
      { groupId: G, userId: 'bohdan', from: '2026-11-01', to: '2026-12-31' } as never,
      TX,
    );

    const bohdans = repository.tasks.filter((task) => task.assigneeId === 'bohdan');
    expect(bohdans.map((task) => task.id)).toEqual([manual.id]);
  });
});

describe('SeriesTopUp', () => {
  it('extends series to 4 weeks ahead, skips ended ones and does nothing twice', async () => {
    const { service, repository, clock, topUp } = setup();
    await service.create(G, 'anya', input({ recurrence: { type: 'daily' } }));
    const ended = await service.create(
      G,
      'anya',
      input({ recurrence: { type: 'daily' }, title: 'Ended' }),
    );
    await service.complete(ended.id, ended.assigneeId ?? '');
    await service.remove(ended.id, 'anya', 'series');
    clock.advance(3 * DAY);

    await expect(topUp.topUp()).resolves.toBe(3);
    await expect(topUp.topUp()).resolves.toBe(0);
    expect(repository.tasks.filter((task) => task.title === 'Ended')).toHaveLength(1);
  });

  it('skips the hourly run while one is going', async () => {
    const { topUp } = setup();
    const spy = vi.spyOn(topUp, 'topUp');

    await Promise.all([topUp.tick(), topUp.tick()]);

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
