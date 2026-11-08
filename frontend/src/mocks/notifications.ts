import type { AppNotification, NotificationType } from '../shared/api/types';
import { computeStatus, db, id } from './db';

type Payload = Pick<AppNotification, 'groupId' | 'taskId' | 'data'>;

/** Creates a notification in the user's inbox */
export function pushNotification(
  userId: string | null,
  type: NotificationType,
  payload: Payload,
): void {
  if (userId === null || userId === '') return;
  db.notifications.push({
    id: id('ntf'),
    userId,
    type,
    createdAt: new Date().toISOString(),
    read: false,
    ...payload,
  });
}

/**
 * On the server, a background job detects overdue tasks (FR-25). With mocks this happens
 * when notifications are requested: one per overdue task of the user.
 */
export function syncOverdueNotifications(userId: string): void {
  for (const task of db.tasks) {
    if (task.assigneeId !== userId || computeStatus(task) !== 'overdue') continue;
    const exists = db.notifications.some(
      (item) => item.userId === userId && item.type === 'taskOverdue' && item.taskId === task.id,
    );
    if (exists) continue;
    db.notifications.push({
      id: id('ntf'),
      userId,
      type: 'taskOverdue',
      createdAt: task.dueAt,
      read: false,
      groupId: task.groupId,
      taskId: task.id,
      data: {
        groupName: db.groups.find((group) => group.id === task.groupId)?.name,
        taskTitle: task.title,
        dueAt: task.dueAt,
      },
    });
  }
}
