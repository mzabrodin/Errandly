import { Injectable } from '@nestjs/common';

import { EventBus } from '../common/events/event-bus.js';
import type { DbExecutor } from '../db/database.js';
import { GroupsApi } from '../groups/index.js';
import { UsersApi } from '../users/index.js';
import {
  AssignmentStrategy,
  type AssignedTask,
  type Candidate,
} from './assignment/assignment-strategy.js';
import { TasksRepository, type TaskWithSeries } from './tasks.repository.js';
import { LOAD_WINDOW_MS, occurrences, toRecurrence, type OccurrenceWindow } from './tasks.rules.js';
import type { TaskRow, TaskSeriesRow } from './tasks.schema.js';

@Injectable()
export class TaskPlanner {
  constructor(
    private readonly repository: TasksRepository,
    private readonly groups: GroupsApi,
    private readonly users: UsersApi,
    private readonly strategy: AssignmentStrategy,
    private readonly bus: EventBus,
  ) {}

  /** Earlier instances count towards the load of later ones */
  async materialize(
    series: TaskSeriesRow,
    window: OccurrenceWindow,
    actorId: string | null,
    tx: DbExecutor,
  ): Promise<TaskRow[]> {
    const { assigneeId } = series;
    const dates = occurrences(toRecurrence(series), series.startsAt, series.timezone, window);
    await this.repository.updateSeries(series.id, { materializedUntil: window.until }, tx);
    const [first] = dates;
    const last = dates.at(-1);
    if (first === undefined || last === undefined) return [];

    const assign =
      assigneeId === null ? await this.assigner(series.groupId, first, last, tx) : null;
    const rows = dates.map((dueAt) => ({
      seriesId: series.id,
      groupId: series.groupId,
      title: series.title,
      description: series.description,
      dueAt,
      difficulty: series.difficulty,
      assigneeId:
        assign === null
          ? assigneeId
          : assign({ seriesId: series.id, dueAt, difficulty: series.difficulty }, series.timezone),
      manuallyAssigned: assigneeId !== null,
    }));
    const inserted = await this.repository.insertTasks(rows, tx);
    for (const task of inserted) {
      // oxlint-disable-next-line no-await-in-loop -- one transaction connection, so the inserts run in order anyway
      await this.bus.publish(tx, 'task.assigned', {
        taskId: task.id,
        groupId: task.groupId,
        assigneeId: task.assigneeId,
        previousAssigneeId: null,
        actorId,
      });
    }
    return inserted.toSorted((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  }

  async reassign(
    groupId: string,
    instances: readonly TaskWithSeries[],
    tx: DbExecutor,
  ): Promise<void> {
    const [first] = instances;
    const last = instances.at(-1);
    if (first === undefined || last === undefined) return;
    const assign = await this.assigner(groupId, first.dueAt, last.dueAt, tx);
    for (const task of instances) {
      const assigneeId = assign(task, task.series.timezone);
      if (assigneeId === task.assigneeId && !task.manuallyAssigned) continue;
      // oxlint-disable-next-line no-await-in-loop -- one transaction connection, so the updates run in order anyway
      await this.repository.updateTask(task.id, { assigneeId, manuallyAssigned: false }, tx);
      if (assigneeId === task.assigneeId) continue;
      // oxlint-disable-next-line no-await-in-loop -- see above
      await this.bus.publish(tx, 'task.assigned', {
        taskId: task.id,
        groupId,
        assigneeId,
        previousAssigneeId: task.assigneeId,
        actorId: null,
      });
    }
  }

  async isMember(groupId: string, userId: string, tx: DbExecutor): Promise<boolean> {
    const members = await this.groups.members(groupId, tx);
    return members.some((member) => member.userId === userId);
  }

  private async assigner(
    groupId: string,
    from: Date,
    to: Date,
    tx: DbExecutor,
  ): Promise<(task: Omit<AssignedTask, 'assigneeId'>, timeZone: string) => string | null> {
    // In sequence: queries on one transaction connection must not overlap
    const candidates = await this.candidates(groupId, tx);
    const history = await this.repository.assignmentHistory(
      groupId,
      new Date(from.getTime() - LOAD_WINDOW_MS),
      to,
      tx,
    );
    return (task, timeZone) => {
      const assigneeId = this.strategy.pick(candidates, history, {
        seriesId: task.seriesId,
        dueAt: task.dueAt,
        timeZone,
      });
      history.push({ ...task, assigneeId });
      return assigneeId;
    };
  }

  private async candidates(groupId: string, tx: DbExecutor): Promise<Candidate[]> {
    const members = await this.groups.members(groupId, tx);
    const users = await this.users.findMany(
      members.map((member) => member.userId),
      tx,
    );
    return members.map((member) => ({
      userId: member.userId,
      name: users.get(member.userId)?.name ?? '',
      absences: member.absences,
    }));
  }
}
