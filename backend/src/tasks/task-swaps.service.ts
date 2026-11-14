import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../common/clock.js';
import { DomainError } from '../common/errors/domain-error.js';
import { EventBus } from '../common/events/event-bus.js';
import { DATABASE, type Database, type DbExecutor } from '../db/database.js';
import { GroupsApi, type GroupMember } from '../groups/index.js';
import type { SwapDto, SwapTaskDto } from './dto/swap.dto.js';
import { TaskSwapsRepository } from './task-swaps.repository.js';
import { TasksRepository, type TaskWithSeries } from './tasks.repository.js';
import { swapProblem } from './tasks.rules.js';
import type { TaskSwapRow } from './tasks.schema.js';

interface SwapWithTasks {
  swap: TaskSwapRow;
  offered: TaskWithSeries;
  requested: TaskWithSeries;
}

@Injectable()
export class TaskSwaps {
  // oxlint-disable-next-line max-params -- Nest constructor injection: each parameter is a dependency, never a positional argument
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: TaskSwapsRepository,
    private readonly tasks: TasksRepository,
    private readonly groups: GroupsApi,
    private readonly bus: EventBus,
    private readonly clock: Clock,
  ) {}

  async list(groupId: string, userId: string): Promise<SwapDto[]> {
    await this.groups.requireMember(groupId, userId);
    const [swaps, members] = await Promise.all([
      this.repository.pendingOf(groupId, userId),
      this.groups.members(groupId),
    ]);
    const loaded = await this.withTasks(swaps);
    const now = this.clock.now();
    return loaded
      .filter((item) => problemOf(item, members, now) === null)
      .map((item) => toSwapDto(item));
  }

  async propose(taskId: string, userId: string, requestedTaskId: string): Promise<SwapDto> {
    const offered = await this.tasks.findTask(taskId);
    if (!offered) throw new DomainError('NOT_FOUND');
    await this.groups.requireMember(offered.groupId, userId);
    if (offered.assigneeId !== userId) throw new DomainError('NOT_ASSIGNEE');
    const requested = await this.tasks.findTask(requestedTaskId);
    const recipientId = requested?.assigneeId ?? null;
    if (
      !requested ||
      requested.groupId !== offered.groupId ||
      recipientId === null ||
      recipientId === userId
    ) {
      throw new DomainError('VALIDATION', { fields: { requestedTaskId: 'invalid' } });
    }
    const swapId = await this.db.transaction(async (tx) => {
      const members = await this.groups.members(offered.groupId, tx);
      const problem = swapProblem(
        parties(userId, recipientId, members),
        offered,
        requested,
        this.clock.now(),
      );
      if (problem !== null) throw new DomainError(problem);
      const existing = await this.repository.findPending(offered.id, requested.id, tx);
      if (existing?.proposerId === userId && existing.recipientId === recipientId) {
        return existing.id;
      }
      // The pair was proposed before the tasks changed hands; that proposal no longer applies
      if (existing) await this.repository.decide(existing.id, 'cancelled', this.clock.now(), tx);
      const swap = await this.repository.insert(
        {
          groupId: offered.groupId,
          offeredTaskId: offered.id,
          requestedTaskId: requested.id,
          proposerId: userId,
          recipientId,
        },
        tx,
      );
      await this.bus.publish(tx, 'task.swapProposed', {
        swapId: swap.id,
        groupId: swap.groupId,
        proposerId: userId,
        recipientId,
        offeredTaskId: offered.id,
      });
      return swap.id;
    });
    return this.load(swapId);
  }

  async accept(swapId: string, userId: string): Promise<SwapDto> {
    await this.visibleSwap(swapId, userId, 'recipient');
    await this.db.transaction(async (tx) => {
      const swap = await this.locked(swapId, tx);
      if (swap.status === 'accepted') return;
      if (swap.status !== 'pending') throw new DomainError('SWAP_STALE');
      // A fixed lock order, so two accepts sharing a task cannot deadlock
      const [first, second] = [swap.offeredTaskId, swap.requestedTaskId].toSorted();
      if (first === undefined || second === undefined) throw new Error('A swap has two tasks');
      await this.tasks.lockTask(first, tx);
      await this.tasks.lockTask(second, tx);
      const item = await this.loadTasks(swap, tx);
      const members = await this.groups.members(swap.groupId, tx);
      const problem = problemOf(item, members, this.clock.now());
      if (problem !== null) throw new DomainError(problem);
      await this.handOver(item.offered, swap.recipientId, swap, tx);
      await this.handOver(item.requested, swap.proposerId, swap, tx);
      await this.repository.decide(swapId, 'accepted', this.clock.now(), tx);
      await this.publishDecision(swap, true, tx);
    });
    return this.load(swapId);
  }

  async decline(swapId: string, userId: string): Promise<SwapDto> {
    await this.visibleSwap(swapId, userId, 'recipient');
    await this.db.transaction(async (tx) => {
      const swap = await this.locked(swapId, tx);
      if (swap.status === 'declined') return;
      if (swap.status !== 'pending') throw new DomainError('SWAP_STALE');
      await this.repository.decide(swapId, 'declined', this.clock.now(), tx);
      await this.publishDecision(swap, false, tx);
    });
    return this.load(swapId);
  }

  async cancel(swapId: string, userId: string): Promise<void> {
    await this.visibleSwap(swapId, userId, 'proposer');
    await this.db.transaction(async (tx) => {
      const swap = await this.locked(swapId, tx);
      if (swap.status === 'cancelled') return;
      if (swap.status !== 'pending') throw new DomainError('SWAP_STALE');
      await this.repository.decide(swapId, 'cancelled', this.clock.now(), tx);
    });
  }

  private async handOver(
    task: TaskWithSeries,
    assigneeId: string,
    swap: TaskSwapRow,
    tx: DbExecutor,
  ): Promise<void> {
    const previousAssigneeId = task.assigneeId;
    await this.tasks.updateTask(task.id, { assigneeId, manuallyAssigned: true }, tx);
    await this.bus.publish(tx, 'task.assigned', {
      taskId: task.id,
      groupId: task.groupId,
      assigneeId,
      previousAssigneeId,
      actorId: swap.recipientId,
      bulk: false,
    });
  }

  private publishDecision(swap: TaskSwapRow, accepted: boolean, tx: DbExecutor): Promise<void> {
    return this.bus.publish(tx, 'task.swapDecided', {
      swapId: swap.id,
      groupId: swap.groupId,
      proposerId: swap.proposerId,
      recipientId: swap.recipientId,
      offeredTaskId: swap.offeredTaskId,
      requestedTaskId: swap.requestedTaskId,
      accepted,
    });
  }

  private async visibleSwap(
    swapId: string,
    userId: string,
    side: 'proposer' | 'recipient',
  ): Promise<TaskSwapRow> {
    const swap = await this.repository.find(swapId);
    if (!swap) throw new DomainError('NOT_FOUND');
    await this.groups.requireMember(swap.groupId, userId);
    const actor = side === 'proposer' ? swap.proposerId : swap.recipientId;
    if (actor !== userId) throw new DomainError('FORBIDDEN');
    return swap;
  }

  private async locked(swapId: string, tx: DbExecutor): Promise<TaskSwapRow> {
    const swap = await this.repository.lock(swapId, tx);
    if (!swap) throw new DomainError('NOT_FOUND');
    return swap;
  }

  private async load(swapId: string): Promise<SwapDto> {
    const swap = await this.repository.find(swapId);
    if (!swap) throw new DomainError('NOT_FOUND');
    return toSwapDto(await this.loadTasks(swap));
  }

  private async loadTasks(swap: TaskSwapRow, db?: DbExecutor): Promise<SwapWithTasks> {
    const [item] = await this.withTasks([swap], db);
    if (!item) throw new DomainError('NOT_FOUND');
    return item;
  }

  private async withTasks(swaps: TaskSwapRow[], db?: DbExecutor): Promise<SwapWithTasks[]> {
    const ids = swaps.flatMap((swap) => [swap.offeredTaskId, swap.requestedTaskId]);
    const tasks = new Map((await this.tasks.findTasks(ids, db)).map((task) => [task.id, task]));
    return swaps.flatMap((swap) => {
      const offered = tasks.get(swap.offeredTaskId);
      const requested = tasks.get(swap.requestedTaskId);
      return offered && requested ? [{ swap, offered, requested }] : [];
    });
  }
}

function parties(proposerId: string, recipientId: string, members: GroupMember[]) {
  const absencesOf = (userId: string) =>
    members.find((member) => member.userId === userId)?.absences ?? [];
  return {
    proposerId,
    recipientId,
    proposerAbsences: absencesOf(proposerId),
    recipientAbsences: absencesOf(recipientId),
  };
}

function problemOf(
  { swap, offered, requested }: SwapWithTasks,
  members: GroupMember[],
  now: Date,
): ReturnType<typeof swapProblem> {
  return swapProblem(parties(swap.proposerId, swap.recipientId, members), offered, requested, now);
}

function toSwapTaskDto(task: TaskWithSeries): SwapTaskDto {
  return {
    id: task.id,
    title: task.title,
    dueAt: task.dueAt.toISOString(),
    difficulty: task.difficulty,
  };
}

function toSwapDto({ swap, offered, requested }: SwapWithTasks): SwapDto {
  return {
    id: swap.id,
    groupId: swap.groupId,
    status: swap.status,
    proposerId: swap.proposerId,
    recipientId: swap.recipientId,
    offeredTask: toSwapTaskDto(offered),
    requestedTask: toSwapTaskDto(requested),
    createdAt: swap.createdAt.toISOString(),
  };
}
