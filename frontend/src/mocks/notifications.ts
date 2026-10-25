import type { AppNotification, NotificationType } from '../shared/api/types';
import { computeStatus, db, id } from './db';

type Payload = Pick<AppNotification, 'groupId' | 'taskId' | 'data'>;

/** Створює сповіщення в «вхідних» користувача */
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
 * На сервері прострочення фіксує фоновий процес (FR-25). У моках — під час
 * запиту сповіщень: по одному на кожну прострочену задачу користувача.
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
