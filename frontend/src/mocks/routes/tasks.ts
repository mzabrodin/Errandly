import { http, HttpResponse } from 'msw';

import type { TaskInput } from '../../shared/api/types';
import {
  createSeries,
  DAY_MS,
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
  else if (input.title.length > 100) fields['title'] = 'tooLong';
  if (input.dueAt === '') fields['dueAt'] = 'required';
  else if (
    new Date(input.dueAt).getTime() < Date.now() &&
    (previousDueAt === undefined ||
      previousDueAt === '' ||
      new Date(previousDueAt).getTime() !== new Date(input.dueAt).getTime())
  ) {
    fields['dueAt'] = 'inPast';
  }
  if (!(input.difficulty >= 1 && input.difficulty <= 5)) fields['difficulty'] = 'range';
  if (input.recurrence.type === 'weekly' && input.recurrence.weekdays.length === 0) {
    fields['recurrence'] = 'noWeekdays';
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

/** Призначення задачі: лист (якщо увімкнено) + сповіщення в сервісі новому і попередньому виконавцю */
function onAssigned(
  task: DbTaskRecord,
  actorId: string,
  previousAssigneeId: string | null = null,
): void {
  notifyAssigned(task);
  const actor = db.users.find((user) => user.id === actorId);
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

/** Перебудовує майбутні невиконані екземпляри серії; повертає перший новий */
function rebuildSeries(task: DbTaskRecord, input: TaskInput): DbTaskRecord {
  const now = Date.now();
  db.tasks = db.tasks.filter(
    (item) =>
      !(
        item.seriesId === task.seriesId &&
        !isCompleted(item) &&
        new Date(item.dueAt).getTime() >= now
      ),
  );
  const [first] = createSeries(db, seriesInput(task.groupId, input), task.seriesId);
  return must(first, 'series task');
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

    if (scope === 'series' && task.recurrence.type !== 'once') {
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
    if (
      input.assigneeId !== null &&
      input.assigneeId !== '' &&
      input.assigneeId !== task.assigneeId &&
      !isCompleted(task)
    ) {
      const previous = task.assigneeId;
      task.assigneeId = input.assigneeId;
      task.manuallyAssigned = true;
      onAssigned(task, auth.user.id, previous);
    }
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
    // адміністратор може зняти позначку будь-коли, виконавець — протягом 24 годин
    if (auth.member.role !== 'admin') {
      if (task.assigneeId !== auth.user.id) return error(403, 'NOT_ASSIGNEE');
      if (
        task.completedAt !== null &&
        task.completedAt !== '' &&
        Date.now() - new Date(task.completedAt).getTime() > DAY_MS
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
