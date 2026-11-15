import { http, HttpResponse } from 'msw';

import type { TaskInput } from '../../shared/api/types';
import { LIMITS } from '../../shared/lib/limits';
import { UNDO_WINDOW_MS } from '../../shared/lib/time';
import {
  autoAssign,
  createSeries,
  db,
  isCompleted,
  persist,
  withStatus,
  type Db,
  type SeriesInput,
} from '../db';
import { notifyAssigned } from '../mailer';
import { pushNotification } from '../notifications';
import {
  API,
  authorize,
  emptyResponse,
  error,
  groupName,
  membership,
  must,
  type GroupParams,
  type TaskParams,
} from './common';

type DbTaskRecord = Db['tasks'][number];

function validateTask(input: TaskInput, previousDueAt?: string): Record<string, string> | null {
  const fields: Record<string, string> = {};
  if (input.title.trim() === '') fields['title'] = 'required';
  else if (input.title.length > LIMITS.taskTitle) fields['title'] = 'tooLong';
  if (input.dueAt === '') fields['dueAt'] = 'required';
  else if (
    new Date(input.dueAt).getTime() < Date.now() &&
    (previousDueAt === undefined ||
      previousDueAt === '' ||
      new Date(previousDueAt).getTime() !== new Date(input.dueAt).getTime())
  ) {
    fields['dueAt'] = 'inPast';
  }
  if (!(input.difficulty >= LIMITS.difficultyMin && input.difficulty <= LIMITS.difficultyMax))
    fields['difficulty'] = 'range';
  if (input.recurrence.type === 'weekly' && input.recurrence.weekdays.length === 0) {
    fields['recurrence'] = 'noWeekdays';
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

/** FR-29: the other admins, once while the notification about this task title is unread */
function notifyNoAssignee(
  task: DbTaskRecord,
  actorId: string,
  data: Parameters<typeof pushNotification>[2]['data'],
): void {
  const admins = db.memberships.filter(
    (item) => item.groupId === task.groupId && item.role === 'admin' && item.userId !== actorId,
  );
  for (const admin of admins) {
    const repeated = db.notifications.some(
      (item) =>
        item.userId === admin.userId &&
        item.type === 'taskNoAssignee' &&
        item.groupId === task.groupId &&
        !item.read &&
        item.data.taskTitle === task.title,
    );
    if (!repeated) {
      pushNotification(admin.userId, 'taskNoAssignee', {
        groupId: task.groupId,
        taskId: task.id,
        data,
      });
    }
  }
}

/** Task assignment: an email (if enabled) + in-app notifications to the new and previous assignee */
function onAssigned(
  task: DbTaskRecord,
  actorId: string,
  previousAssigneeId: string | null = null,
): void {
  const actor = db.users.find((user) => user.id === actorId);
  notifyAssigned(task, actor?.name);
  const data = {
    groupName: groupName(task.groupId),
    taskTitle: task.title,
    dueAt: task.dueAt,
    actorName: actor?.name,
  };
  if (task.assigneeId !== null && task.assigneeId !== '' && task.assigneeId !== actorId) {
    pushNotification(task.assigneeId, 'taskAssigned', {
      groupId: task.groupId,
      taskId: task.id,
      data,
    });
  }
  if (task.assigneeId === null) notifyNoAssignee(task, actorId, data);
  if (
    previousAssigneeId !== null &&
    previousAssigneeId !== '' &&
    previousAssigneeId !== task.assigneeId &&
    previousAssigneeId !== actorId
  ) {
    pushNotification(previousAssigneeId, 'taskUnassigned', {
      groupId: task.groupId,
      taskId: task.id,
      data,
    });
  }
}

function seriesInput(groupId: string, input: TaskInput): SeriesInput {
  return {
    groupId,
    title: input.title.trim(),
    description: input.description.trim(),
    firstDueAt: new Date(input.dueAt),
    difficulty: input.difficulty,
    recurrence: input.recurrence,
    assigneeId: input.assigneeId,
  };
}

/** Rebuilds the series' future unfinished instances; returns the first new one, else the task */
function rebuildSeries(task: DbTaskRecord, input: TaskInput): DbTaskRecord {
  const now = Date.now();
  const isFuture = (item: DbTaskRecord): boolean => new Date(item.dueAt).getTime() >= now;
  db.tasks = db.tasks.filter(
    (item) => !(item.seriesId === task.seriesId && !isCompleted(item) && isFuture(item)),
  );
  const created = createSeries(db, seriesInput(task.groupId, input), task.seriesId);
  // Dates that already passed keep what they have
  const past = new Set(created.filter((item) => !isFuture(item)));
  db.tasks = db.tasks.filter((item) => !past.has(item));
  return created.find(isFuture) ?? task;
}

/** `series` on a recurring task, or a one-off task that becomes recurring */
function rebuildsSeries(task: DbTaskRecord, scope: string | null, input: TaskInput): boolean {
  if (task.recurrence.type === 'once') return input.recurrence.type !== 'once';
  return scope === 'series';
}

/** A chosen member is a manual assignment; none hands a manual task back to the rotation */
function applyAssignee(task: DbTaskRecord, assigneeId: string | null, actorId: string): void {
  if (isCompleted(task)) return;
  const previous = task.assigneeId;
  if (assigneeId !== null && assigneeId !== '') {
    task.assigneeId = assigneeId;
    task.manuallyAssigned = true;
  } else if (task.manuallyAssigned) {
    // Not counted towards the load of whoever has it now
    task.assigneeId = null;
    task.assigneeId = autoAssign(db, task.groupId, task);
    task.manuallyAssigned = false;
  }
  if (task.assigneeId !== previous) onAssigned(task, actorId, previous);
}

const taskQueryHandlers = [
  http.get<GroupParams>(`${API}/groups/:groupId/tasks`, ({ params, request }) => {
    const { groupId } = params;
    const auth = authorize(groupId);
    if (auth instanceof Response) return auth;
    const url = new URL(request.url);
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '9999';
    const seriesId = url.searchParams.get('seriesId');
    return HttpResponse.json(
      db.tasks
        .filter(
          (task) =>
            task.groupId === groupId &&
            task.dueAt >= from &&
            task.dueAt < to &&
            (seriesId === null || seriesId === '' || task.seriesId === seriesId),
        )
        .toSorted((a, b) => a.dueAt.localeCompare(b.dueAt))
        .map(withStatus),
    );
  }),

  http.get<TaskParams>(`${API}/tasks/:taskId`, ({ params }) => {
    const task = db.tasks.find((item) => item.id === params.taskId);
    if (!task) return error(404, 'NOT_FOUND');
    const auth = authorize(task.groupId);
    if (auth instanceof Response) return auth;
    return HttpResponse.json(withStatus(task));
  }),
];

const taskEditHandlers = [
  http.post<GroupParams, TaskInput>(`${API}/groups/:groupId/tasks`, async ({ params, request }) => {
    const { groupId } = params;
    const auth = authorize(groupId, true);
    if (auth instanceof Response) return auth;
    const input = await request.json();
    const fields = validateTask(input);
    if (fields) return error(400, 'VALIDATION', { fields });
    const first = must(createSeries(db, seriesInput(groupId, input))[0], 'created task');
    persist();
    onAssigned(first, auth.user.id);
    return HttpResponse.json(withStatus(first), { status: 201 });
  }),

  http.patch<TaskParams, TaskInput>(`${API}/tasks/:taskId`, async ({ params, request }) => {
    const task = db.tasks.find((item) => item.id === params.taskId);
    if (!task) return error(404, 'NOT_FOUND');
    const auth = authorize(task.groupId, true);
    if (auth instanceof Response) return auth;
    const scope = new URL(request.url).searchParams.get('scope');
    const input = await request.json();
    const fields = validateTask(input, task.dueAt);
    if (fields) return error(400, 'VALIDATION', { fields });

    if (rebuildsSeries(task, scope, input)) {
      const first = rebuildSeries(task, input);
      persist();
      return HttpResponse.json(withStatus(first));
    }

    Object.assign(task, {
      title: input.title.trim(),
      description: input.description.trim(),
      dueAt: input.dueAt,
      difficulty: input.difficulty,
    });
    applyAssignee(task, input.assigneeId, auth.user.id);
    persist();
    return HttpResponse.json(withStatus(task));
  }),

  http.delete<TaskParams>(`${API}/tasks/:taskId`, ({ params, request }) => {
    const task = db.tasks.find((item) => item.id === params.taskId);
    if (!task) return error(404, 'NOT_FOUND');
    const auth = authorize(task.groupId, true);
    if (auth instanceof Response) return auth;
    const scope = new URL(request.url).searchParams.get('scope');
    db.tasks = db.tasks.filter((item) =>
      scope === 'series'
        ? item.seriesId !== task.seriesId || isCompleted(item)
        : item.id !== task.id,
    );
    persist();
    return emptyResponse();
  }),
];

const taskStateHandlers = [
  http.post<TaskParams>(`${API}/tasks/:taskId/complete`, ({ params }) => {
    const task = db.tasks.find((item) => item.id === params.taskId);
    if (!task) return error(404, 'NOT_FOUND');
    const auth = authorize(task.groupId);
    if (auth instanceof Response) return auth;
    if (task.assigneeId !== auth.user.id) return error(403, 'NOT_ASSIGNEE');
    task.completedAt ??= new Date().toISOString();
    persist();
    return HttpResponse.json(withStatus(task));
  }),

  http.delete<TaskParams>(`${API}/tasks/:taskId/complete`, ({ params }) => {
    const task = db.tasks.find((item) => item.id === params.taskId);
    if (!task) return error(404, 'NOT_FOUND');
    const auth = authorize(task.groupId);
    if (auth instanceof Response) return auth;
    // An admin can unmark at any time, the assignee within 24 hours
    if (auth.member.role !== 'admin') {
      if (task.assigneeId !== auth.user.id) return error(403, 'NOT_ASSIGNEE');
      if (
        task.completedAt !== null &&
        task.completedAt !== '' &&
        Date.now() - new Date(task.completedAt).getTime() > UNDO_WINDOW_MS
      ) {
        return error(409, 'UNDO_EXPIRED');
      }
    }
    task.completedAt = null;
    persist();
    return HttpResponse.json(withStatus(task));
  }),

  http.patch<TaskParams, { assigneeId: string }>(
    `${API}/tasks/:taskId/assignee`,
    async ({ params, request }) => {
      const task = db.tasks.find((item) => item.id === params.taskId);
      if (!task) return error(404, 'NOT_FOUND');
      const auth = authorize(task.groupId, true);
      if (auth instanceof Response) return auth;
      if (isCompleted(task)) return error(409, 'TASK_DONE');
      const { assigneeId } = await request.json();
      if (!membership(task.groupId, assigneeId)) return error(400, 'VALIDATION');
      const previous = task.assigneeId;
      task.assigneeId = assigneeId;
      task.manuallyAssigned = true;
      if (previous !== assigneeId) onAssigned(task, auth.user.id, previous);
      persist();
      return HttpResponse.json(withStatus(task));
    },
  ),
];

export const taskHandlers = [...taskQueryHandlers, ...taskEditHandlers, ...taskStateHandlers];
