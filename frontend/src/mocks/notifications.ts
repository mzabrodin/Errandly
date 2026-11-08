import type { AppNotification, NotificationType } from '../shared/api/types';
import { computeStatus, db, id } from './db';

type NotificationData = AppNotification['data'];

/** Like the API data, but values may be missing (a group lookup can fail) */
type LooseData = { [K in keyof NotificationData]?: NotificationData[K] | undefined };

type Payload = Pick<AppNotification, 'groupId' | 'taskId'> & { data: LooseData };

/** Drops undefined values: the JSON contract has optional fields, never undefined ones */
function compactData(data: LooseData): NotificationData {
  const result: NotificationData = {};
  if (data.groupName !== undefined) result.groupName = data.groupName;
  if (data.taskTitle !== undefined) result.taskTitle = data.taskTitle;
  if (data.actorName !== undefined) result.actorName = data.actorName;
  if (data.dueAt !== undefined) result.dueAt = data.dueAt;
  return result;
}

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
    groupId: payload.groupId,
    taskId: payload.taskId,
    data: compactData(payload.data),
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
      data: compactData({
        groupName: db.groups.find((group) => group.id === task.groupId)?.name,
        taskTitle: task.title,
        dueAt: task.dueAt,
      }),
    });
  }
}
