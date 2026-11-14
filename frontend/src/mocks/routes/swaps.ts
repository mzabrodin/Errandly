import { http, HttpResponse } from 'msw';

import type { Swap } from '../../shared/api/types';
import { toDateInputValue } from '../../shared/lib/dates';
import { db, id, isCompleted, persist, type Db, type DbSwap } from '../db';
import { pushNotification } from '../notifications';
import {
  API,
  authorize,
  emptyResponse,
  error,
  groupName,
  type GroupParams,
  type TaskParams,
} from './common';

type DbTaskRecord = Db['tasks'][number];

interface SwapParams {
  swapId: string;
}

function findTask(taskId: string): DbTaskRecord | undefined {
  return db.tasks.find((task) => task.id === taskId);
}

function isOpen(task: DbTaskRecord): boolean {
  return !isCompleted(task) && new Date(task.dueAt).getTime() > Date.now();
}

function summary(task: DbTaskRecord): Swap['offeredTask'] {
  return { id: task.id, title: task.title, dueAt: task.dueAt, difficulty: task.difficulty };
}

function isAway(groupId: string, userId: string, dueAt: string): boolean {
  const day = toDateInputValue(new Date(dueAt));
  return db.absences.some(
    (absence) =>
      absence.groupId === groupId &&
      absence.userId === userId &&
      absence.from <= day &&
      day <= absence.to,
  );
}

/** The same rule as swapProblem in backend/src/tasks/tasks.rules.ts */
function swapProblem(swap: Omit<DbSwap, 'id' | 'status' | 'createdAt'>): string | null {
  const offered = findTask(swap.offeredTaskId);
  const requested = findTask(swap.requestedTaskId);
  if (
    !offered ||
    !requested ||
    offered.assigneeId !== swap.proposerId ||
    requested.assigneeId !== swap.recipientId ||
    !isOpen(offered) ||
    !isOpen(requested)
  ) {
    return 'SWAP_STALE';
  }
  const away =
    isAway(swap.groupId, swap.recipientId, offered.dueAt) ||
    isAway(swap.groupId, swap.proposerId, requested.dueAt);
  return away ? 'MEMBER_ABSENT' : null;
}

function toSwap(swap: DbSwap): Swap | null {
  const offered = findTask(swap.offeredTaskId);
  const requested = findTask(swap.requestedTaskId);
  if (!offered || !requested) return null;
  return {
    id: swap.id,
    groupId: swap.groupId,
    status: swap.status,
    proposerId: swap.proposerId,
    recipientId: swap.recipientId,
    offeredTask: summary(offered),
    requestedTask: summary(requested),
    createdAt: swap.createdAt,
  };
}

function swapResponse(swap: DbSwap): Response {
  const body = toSwap(swap);
  return body ? HttpResponse.json(body) : error(404, 'NOT_FOUND');
}

function notify(
  userId: string,
  type: 'swapProposed' | 'swapAccepted' | 'swapDeclined',
  swap: DbSwap,
  actorId: string,
  taskId: string,
): void {
  const task = findTask(taskId);
  pushNotification(userId, type, {
    groupId: swap.groupId,
    taskId,
    data: {
      groupName: groupName(swap.groupId),
      taskTitle: task?.title,
      dueAt: task?.dueAt,
      actorName: db.users.find((user) => user.id === actorId)?.name,
    },
  });
}

function actingOn(swapId: string, side: 'proposer' | 'recipient'): DbSwap | Response {
  const swap = db.swaps.find((item) => item.id === swapId);
  if (!swap) return error(404, 'NOT_FOUND');
  const auth = authorize(swap.groupId);
  if (auth instanceof Response) return auth;
  const actor = side === 'proposer' ? swap.proposerId : swap.recipientId;
  return actor === auth.user.id ? swap : error(403, 'FORBIDDEN');
}

function propose(taskId: string, requestedTaskId: string): Response {
  const offered = findTask(taskId);
  if (!offered) return error(404, 'NOT_FOUND');
  const auth = authorize(offered.groupId);
  if (auth instanceof Response) return auth;
  const userId = auth.user.id;
  if (offered.assigneeId !== userId) return error(403, 'NOT_ASSIGNEE');
  const requested = findTask(requestedTaskId);
  const recipientId = requested?.assigneeId ?? null;
  if (
    !requested ||
    requested.groupId !== offered.groupId ||
    recipientId === null ||
    recipientId === userId
  ) {
    return error(400, 'VALIDATION', { fields: { requestedTaskId: 'invalid' } });
  }
  const proposal = {
    groupId: offered.groupId,
    offeredTaskId: offered.id,
    requestedTaskId: requested.id,
    proposerId: userId,
    recipientId,
  };
  const problem = swapProblem(proposal);
  if (problem !== null) return error(409, problem);
  const existing = db.swaps.find(
    (swap) =>
      swap.offeredTaskId === offered.id &&
      swap.requestedTaskId === requested.id &&
      swap.status === 'pending',
  );
  if (existing?.proposerId === userId && existing.recipientId === recipientId) {
    return swapResponse(existing);
  }
  if (existing) existing.status = 'cancelled';
  const swap: DbSwap = {
    ...proposal,
    id: id('swap'),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  db.swaps.push(swap);
  notify(recipientId, 'swapProposed', swap, userId, offered.id);
  persist();
  return HttpResponse.json(toSwap(swap), { status: 201 });
}

function accept(swap: DbSwap): Response {
  if (swap.status === 'accepted') return swapResponse(swap);
  if (swap.status !== 'pending') return error(409, 'SWAP_STALE');
  const problem = swapProblem(swap);
  if (problem !== null) return error(409, problem);
  const offered = findTask(swap.offeredTaskId);
  const requested = findTask(swap.requestedTaskId);
  if (!offered || !requested) return error(409, 'SWAP_STALE');
  offered.assigneeId = swap.recipientId;
  requested.assigneeId = swap.proposerId;
  offered.manuallyAssigned = true;
  requested.manuallyAssigned = true;
  swap.status = 'accepted';
  notify(swap.proposerId, 'swapAccepted', swap, swap.recipientId, requested.id);
  persist();
  return swapResponse(swap);
}

function decline(swap: DbSwap): Response {
  if (swap.status === 'declined') return swapResponse(swap);
  if (swap.status !== 'pending') return error(409, 'SWAP_STALE');
  swap.status = 'declined';
  notify(swap.proposerId, 'swapDeclined', swap, swap.recipientId, swap.offeredTaskId);
  persist();
  return swapResponse(swap);
}

export const swapHandlers = [
  http.get<GroupParams>(`${API}/groups/:groupId/swaps`, ({ params }) => {
    const auth = authorize(params.groupId);
    if (auth instanceof Response) return auth;
    const userId = auth.user.id;
    const live = db.swaps.filter(
      (swap) =>
        swap.groupId === params.groupId &&
        swap.status === 'pending' &&
        (swap.proposerId === userId || swap.recipientId === userId) &&
        swapProblem(swap) === null,
    );
    return HttpResponse.json(live.map(toSwap).filter((swap) => swap !== null));
  }),

  http.post<TaskParams, { requestedTaskId: string }>(
    `${API}/tasks/:taskId/swaps`,
    async ({ params, request }) => {
      const { requestedTaskId } = await request.json();
      return propose(params.taskId, requestedTaskId);
    },
  ),

  http.post<SwapParams>(`${API}/swaps/:swapId/accept`, ({ params }) => {
    const swap = actingOn(params.swapId, 'recipient');
    return swap instanceof Response ? swap : accept(swap);
  }),

  http.post<SwapParams>(`${API}/swaps/:swapId/decline`, ({ params }) => {
    const swap = actingOn(params.swapId, 'recipient');
    return swap instanceof Response ? swap : decline(swap);
  }),

  http.delete<SwapParams>(`${API}/swaps/:swapId`, ({ params }) => {
    const swap = actingOn(params.swapId, 'proposer');
    if (swap instanceof Response) return swap;
    if (swap.status === 'pending') swap.status = 'cancelled';
    else if (swap.status !== 'cancelled') return error(409, 'SWAP_STALE');
    persist();
    return emptyResponse();
  }),
];
