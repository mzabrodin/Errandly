import { http, HttpResponse } from 'msw';

import { computeStatus, DAY_MS, db, isCompleted, persist } from '../db';
import { syncOverdueNotifications } from '../notifications';
import { API, authorize, currentUser, emptyResponse, error, type GroupParams } from './common';

// Сповіщення в сервісі та статистика групи

export const activityHandlers = [
  // ---------- сповіщення в сервісі ----------
  http.get(`${API}/notifications`, () => {
    const user = currentUser();
    if (!user) return error(401, 'UNAUTHENTICATED');
    syncOverdueNotifications(user.id);
    persist();
    const items = db.notifications
      .filter((item) => item.userId === user.id)
      .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50)
      .map(({ userId: _userId, ...item }) => item);
    return HttpResponse.json({
      items,
      unread: items.filter((item) => !item.read).length,
    });
  }),

  http.post<never, { ids?: string[] } | null>(`${API}/notifications/read`, async ({ request }) => {
    const user = currentUser();
    if (!user) return error(401, 'UNAUTHENTICATED');
    const body: { ids?: string[] } | null = await request.json().catch(() => ({}));
    const ids = body?.ids;
    for (const item of db.notifications) {
      if (item.userId === user.id && (!ids || ids.includes(item.id))) item.read = true;
    }
    persist();
    return emptyResponse();
  }),

  // ---------- статистика ----------
  http.get<GroupParams>(`${API}/groups/:groupId/stats`, ({ params, request }) => {
    const { groupId } = params;
    const auth = authorize(groupId);
    if (auth instanceof Response) return auth;
    const period = new URL(request.url).searchParams.get('period') ?? 'week';
    const since = Date.now() - (period === 'week' ? 7 : 30) * DAY_MS;
    const inPeriod = db.tasks.filter((task) => {
      const due = new Date(task.dueAt).getTime();
      return task.groupId === groupId && due >= since && due <= Date.now();
    });
    return HttpResponse.json(
      db.memberships
        .filter((item) => item.groupId === groupId)
        .map((item) => {
          const own = inPeriod.filter((task) => task.assigneeId === item.userId);
          const done = own.filter((task) => isCompleted(task));
          return {
            userId: item.userId,
            done: done.length,
            overdue: own.filter((task) => computeStatus(task) === 'overdue').length,
            difficulty: done.reduce((sum, task) => sum + task.difficulty, 0),
          };
        }),
    );
  }),
];
