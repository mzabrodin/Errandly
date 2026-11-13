import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../common/clock.js';
import type { EditScope } from '../common/domain.js';
import { DomainError } from '../common/errors/domain-error.js';
import { EventBus } from '../common/events/event-bus.js';
import { DATABASE, type Database, type DbExecutor } from '../db/database.js';
import { GroupsApi } from '../groups/index.js';
import { UsersApi } from '../users/index.js';
import type { CreateTaskDto, TaskDto, TasksQueryDto, UpdateTaskDto } from './dto/task.dto.js';
import { TaskPlanner } from './task-planner.js';
import { toTaskDto } from './tasks.mapper.js';
import { TasksRepository, type TaskWithSeries } from './tasks.repository.js';
import { canUndo, HORIZON_MS } from './tasks.rules.js';
import type { TaskRow, TaskSeriesRow } from './tasks.schema.js';

@Injectable()
export class TasksService {
  // oxlint-disable-next-line max-params -- Nest constructor injection: each parameter is a dependency, never a positional argument
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: TasksRepository,
    private readonly planner: TaskPlanner,
    private readonly groups: GroupsApi,
    private readonly users: UsersApi,
    private readonly bus: EventBus,
    private readonly clock: Clock,
  ) {}

  async list(groupId: string, userId: string, query: TasksQueryDto): Promise<TaskDto[]> {
    await this.groups.requireMember(groupId, userId);
    const tasks = await this.repository.listTasks(groupId, {
      ...(query.from !== undefined && { from: new Date(query.from) }),
      ...(query.to !== undefined && { to: new Date(query.to) }),
      ...(query.seriesId !== undefined && { seriesId: query.seriesId }),
    });
    const now = this.clock.now();
    return tasks.map((task) => toTaskDto(task, now));
  }

  async get(taskId: string, userId: string): Promise<TaskDto> {
    const task = await this.visibleTask(taskId, userId);
    return toTaskDto(task, this.clock.now());
  }

  async create(groupId: string, userId: string, input: CreateTaskDto): Promise<TaskDto> {
    const now = this.clock.now();
    const firstId = await this.db.transaction(async (tx) => {
      await this.groups.requireAdmin(groupId, userId, tx);
      await this.assertAssignable(groupId, input.assigneeId, tx);
      const series = await this.repository.insertSeries(
        {
          groupId,
          ...seriesFields(input),
          timezone: await this.timezoneOf(userId, tx),
          assigneeId: input.assigneeId,
          materializedUntil: now,
          createdBy: userId,
        },
        tx,
      );
      const [first] = await this.materialize(series, userId, now, tx);
      if (!first) throw new Error('A new series produced no instance');
      return first.id;
    });
    return this.load(firstId);
  }

  async update(
    taskId: string,
    userId: string,
    scope: EditScope,
    input: UpdateTaskDto,
  ): Promise<TaskDto> {
    const task = await this.adminTask(taskId, userId);
    const now = this.clock.now();
    if (task.dueAt.getTime() !== new Date(input.dueAt).getTime() && new Date(input.dueAt) < now) {
      throw new DomainError('VALIDATION', { fields: { dueAt: 'inPast' } });
    }
    const resultId = await this.db.transaction(async (tx) => {
      await this.assertAssignable(task.groupId, input.assigneeId, tx);
      return scope === 'series' && task.series.recurrenceType !== 'once'
        ? this.rebuildSeries(task, userId, input, now, tx)
        : this.updateOne(task, userId, input, tx);
    });
    return this.load(resultId);
  }

  async remove(taskId: string, userId: string, scope: EditScope): Promise<void> {
    const task = await this.adminTask(taskId, userId);
    await this.db.transaction(async (tx) => {
      if (scope === 'one') {
        await this.deleteInstances([task], tx);
        return;
      }
      await this.deleteInstances(
        await this.repository.unfinishedOfSeries(task.seriesId, undefined, tx),
        tx,
      );
      if ((await this.repository.countInstances(task.seriesId, tx)) === 0) {
        await this.repository.deleteSeries(task.seriesId, tx);
      } else {
        await this.repository.updateSeries(task.seriesId, { endedAt: this.clock.now() }, tx);
      }
    });
  }

  async complete(taskId: string, userId: string): Promise<TaskDto> {
    const task = await this.visibleTask(taskId, userId);
    await this.db.transaction(async (tx) => {
      const current = await this.locked(taskId, tx);
      if (current.assigneeId !== userId) throw new DomainError('NOT_ASSIGNEE');
      if (current.completedAt !== null) return;
      await this.repository.updateTask(
        taskId,
        { completedAt: this.clock.now(), completedBy: userId },
        tx,
      );
      await this.bus.publish(tx, 'task.completed', {
        taskId,
        groupId: task.groupId,
        userId,
        done: true,
      });
    });
    return this.load(taskId);
  }

  async undoComplete(taskId: string, userId: string): Promise<TaskDto> {
    const task = await this.visibleTask(taskId, userId);
    await this.db.transaction(async (tx) => {
      const role = await this.groups.requireMember(task.groupId, userId, tx);
      const current = await this.locked(taskId, tx);
      if (role !== 'admin') {
        if (current.assigneeId !== userId) throw new DomainError('NOT_ASSIGNEE');
        if (current.completedAt !== null && !canUndo(current.completedAt, this.clock.now())) {
          throw new DomainError('UNDO_EXPIRED');
        }
      }
      if (current.completedAt === null) return;
      await this.repository.updateTask(taskId, { completedAt: null, completedBy: null }, tx);
      await this.bus.publish(tx, 'task.completed', {
        taskId,
        groupId: task.groupId,
        userId,
        done: false,
      });
    });
    return this.load(taskId);
  }

  async reassign(taskId: string, userId: string, assigneeId: string): Promise<TaskDto> {
    const task = await this.adminTask(taskId, userId);
    await this.db.transaction(async (tx) => {
      const current = await this.locked(taskId, tx);
      if (current.completedAt !== null) throw new DomainError('TASK_DONE');
      await this.assertAssignable(task.groupId, assigneeId, tx);
      await this.setAssignee(current, assigneeId, userId, tx);
    });
    return this.load(taskId);
  }

  private async updateOne(
    task: TaskWithSeries,
    userId: string,
    input: UpdateTaskDto,
    tx: DbExecutor,
  ): Promise<string> {
    const current = await this.locked(task.id, tx);
    await this.repository.updateTask(
      task.id,
      {
        title: input.title,
        description: input.description,
        dueAt: new Date(input.dueAt),
        difficulty: input.difficulty,
      },
      tx,
    );
    await this.bus.publish(tx, 'task.changed', { taskId: task.id, groupId: task.groupId });
    if (input.assigneeId !== null && current.completedAt === null) {
      await this.setAssignee(current, input.assigneeId, userId, tx);
    }
    return task.id;
  }

  private async rebuildSeries(
    task: TaskWithSeries,
    userId: string,
    input: UpdateTaskDto,
    now: Date,
    tx: DbExecutor,
  ): Promise<string> {
    const series = await this.repository.findSeries(task.seriesId, tx);
    if (!series) throw new DomainError('NOT_FOUND');
    await this.deleteInstances(await this.repository.unfinishedOfSeries(series.id, now, tx), tx);
    const changes = {
      ...seriesFields(input),
      timezone: await this.timezoneOf(userId, tx),
      assigneeId: input.assigneeId,
      endedAt: null,
    };
    await this.repository.updateSeries(series.id, changes, tx);
    const [first] = await this.materialize({ ...series, ...changes }, userId, now, tx);
    // Every new date clashed with a completed instance: show the edited one
    return first?.id ?? task.id;
  }

  private materialize(
    series: TaskSeriesRow,
    actorId: string,
    now: Date,
    tx: DbExecutor,
  ): Promise<TaskRow[]> {
    return this.planner.materialize(
      series,
      { until: new Date(Math.max(now.getTime() + HORIZON_MS, series.startsAt.getTime())) },
      actorId,
      tx,
    );
  }

  private async setAssignee(
    task: TaskRow,
    assigneeId: string,
    actorId: string,
    tx: DbExecutor,
  ): Promise<void> {
    await this.repository.updateTask(task.id, { assigneeId, manuallyAssigned: true }, tx);
    if (assigneeId === task.assigneeId) return;
    await this.bus.publish(tx, 'task.assigned', {
      taskId: task.id,
      groupId: task.groupId,
      assigneeId,
      previousAssigneeId: task.assigneeId,
      actorId,
    });
  }

  private async deleteInstances(instances: readonly TaskRow[], tx: DbExecutor): Promise<void> {
    await this.repository.deleteTasks(
      instances.map((task) => task.id),
      tx,
    );
    for (const task of instances) {
      // oxlint-disable-next-line no-await-in-loop -- one transaction connection, so the inserts run in order anyway
      await this.bus.publish(tx, 'task.deleted', {
        taskId: task.id,
        groupId: task.groupId,
        assigneeId: task.assigneeId,
      });
    }
  }

  private async assertAssignable(
    groupId: string,
    assigneeId: string | null,
    tx: DbExecutor,
  ): Promise<void> {
    if (assigneeId === null || (await this.planner.isMember(groupId, assigneeId, tx))) return;
    throw new DomainError('VALIDATION', { fields: { assigneeId: 'invalid' } });
  }

  private async timezoneOf(userId: string, tx: DbExecutor): Promise<string> {
    const user = await this.users.findById(userId, tx);
    if (!user) throw new DomainError('UNAUTHENTICATED');
    return user.timezone;
  }

  /** 404 before 403 */
  private async visibleTask(taskId: string, userId: string): Promise<TaskWithSeries> {
    const task = await this.repository.findTask(taskId);
    if (!task) throw new DomainError('NOT_FOUND');
    await this.groups.requireMember(task.groupId, userId);
    return task;
  }

  private async adminTask(taskId: string, userId: string): Promise<TaskWithSeries> {
    const task = await this.repository.findTask(taskId);
    if (!task) throw new DomainError('NOT_FOUND');
    await this.groups.requireAdmin(task.groupId, userId);
    return task;
  }

  private async locked(taskId: string, tx: DbExecutor): Promise<TaskRow> {
    const task = await this.repository.lockTask(taskId, tx);
    if (!task) throw new DomainError('NOT_FOUND');
    return task;
  }

  private async load(taskId: string): Promise<TaskDto> {
    const task = await this.repository.findTask(taskId);
    if (!task) throw new DomainError('NOT_FOUND');
    return toTaskDto(task, this.clock.now());
  }
}

function seriesFields(input: CreateTaskDto | UpdateTaskDto) {
  return {
    title: input.title,
    description: input.description,
    difficulty: input.difficulty,
    recurrenceType: input.recurrence.type,
    weekdays: input.recurrence.type === 'weekly' ? input.recurrence.weekdays : [],
    startsAt: new Date(input.dueAt),
  };
}
