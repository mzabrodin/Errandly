import { Injectable, type OnModuleInit } from '@nestjs/common';

import type { DomainEventMap } from '../common/events/domain-events.js';
import { EventBus } from '../common/events/event-bus.js';
import type { DbExecutor } from '../db/database.js';
import { GroupsApi } from '../groups/index.js';
import { TasksApi } from '../tasks/index.js';
import { UsersApi } from '../users/index.js';
import { NotificationsRepository } from './notifications.repository.js';
import { assignmentRecipients, type Recipient } from './notifications.rules.js';
import type { NewNotificationRow, NotificationData } from './notifications.schema.js';

export interface Subject {
  groupId: string;
  taskId?: string;
  actorId?: string | null;
}

/** Written in the publisher's transaction, so each change notifies exactly once */
@Injectable()
export class NotificationFeed implements OnModuleInit {
  constructor(
    private readonly repository: NotificationsRepository,
    private readonly groups: GroupsApi,
    private readonly tasks: TasksApi,
    private readonly users: UsersApi,
    private readonly bus: EventBus,
  ) {}

  onModuleInit(): void {
    this.bus.onInTransaction('group.created', ({ groupId, userId }, tx) =>
      this.notify([{ userId, type: 'groupCreated' }], { groupId }, tx),
    );
    this.bus.onInTransaction('group.memberJoined', (event, tx) => this.memberJoined(event, tx));
    this.bus.onInTransaction('group.memberLeft', ({ groupId, userId, removedBy }, tx) =>
      removedBy === null || removedBy === userId
        ? Promise.resolve()
        : this.notify([{ userId, type: 'removedFromGroup' }], { groupId, actorId: removedBy }, tx, {
            detached: true,
          }),
    );
    this.bus.onInTransaction('group.roleChanged', ({ groupId, userId, role, actorId }, tx) =>
      userId === actorId
        ? Promise.resolve()
        : this.notify(
            [{ userId, type: role === 'admin' ? 'roleGranted' : 'roleRevoked' }],
            { groupId, actorId },
            tx,
          ),
    );
    this.bus.onInTransaction('task.assigned', (event, tx) => this.taskAssigned(event, tx));
    this.bus.onInTransaction('task.swapProposed', (event, tx) =>
      this.notify(
        [{ userId: event.recipientId, type: 'swapProposed' }],
        { groupId: event.groupId, taskId: event.offeredTaskId, actorId: event.proposerId },
        tx,
      ),
    );
    this.bus.onInTransaction('task.swapDecided', (event, tx) =>
      this.notify(
        [{ userId: event.proposerId, type: event.accepted ? 'swapAccepted' : 'swapDeclined' }],
        {
          groupId: event.groupId,
          taskId: event.accepted ? event.requestedTaskId : event.offeredTaskId,
          actorId: event.recipientId,
        },
        tx,
      ),
    );
  }

  private async memberJoined(
    { groupId, userId }: DomainEventMap['group.memberJoined'],
    tx: DbExecutor,
  ): Promise<void> {
    const admins = await this.groups.admins(groupId, tx);
    await this.notify(
      [
        { userId, type: 'groupJoined' },
        ...admins
          .filter((adminId) => adminId !== userId)
          .map((adminId): Recipient => ({ userId: adminId, type: 'memberJoined' })),
      ],
      { groupId, actorId: userId },
      tx,
    );
  }

  private async taskAssigned(
    event: DomainEventMap['task.assigned'],
    tx: DbExecutor,
  ): Promise<void> {
    const admins = event.assigneeId === null ? await this.groups.admins(event.groupId, tx) : [];
    const recipients = assignmentRecipients(event, admins);
    if (recipients.length === 0) return;
    await this.notify(
      recipients,
      { groupId: event.groupId, taskId: event.taskId, actorId: event.actorId },
      tx,
    );
  }

  async notify(
    recipients: readonly Recipient[],
    subject: Subject,
    tx: DbExecutor,
    { detached = false }: { detached?: boolean } = {},
  ): Promise<void> {
    if (recipients.length === 0) return;
    const data = await this.dataOf(subject, tx);
    const fresh = await this.withoutRepeats(recipients, subject.groupId, data, tx);
    const rows = fresh.map(({ userId, type }): NewNotificationRow => ({
      userId,
      type,
      // Someone removed from the group can no longer open it
      groupId: detached ? null : subject.groupId,
      taskId: subject.taskId ?? null,
      data,
    }));
    await this.repository.insert(rows, tx);
  }

  private async withoutRepeats(
    recipients: readonly Recipient[],
    groupId: string,
    data: NotificationData,
    tx: DbExecutor,
  ): Promise<Recipient[]> {
    const title = data.taskTitle;
    const result: Recipient[] = [];
    for (const recipient of recipients) {
      const repeated =
        recipient.type === 'taskNoAssignee' &&
        title !== undefined &&
        // oxlint-disable-next-line no-await-in-loop -- one transaction connection, so queries run in order anyway
        (await this.repository.hasUnread(recipient.userId, recipient.type, groupId, title, tx));
      if (!repeated) result.push(recipient);
    }
    return result;
  }

  private async dataOf(subject: Subject, tx: DbExecutor): Promise<NotificationData> {
    const names = await this.groups.names([subject.groupId], tx);
    const task = subject.taskId === undefined ? null : await this.tasks.find(subject.taskId, tx);
    const actor =
      subject.actorId === undefined || subject.actorId === null
        ? null
        : await this.users.findById(subject.actorId, tx);
    const groupName = names.get(subject.groupId);
    return {
      ...(groupName !== undefined && { groupName }),
      ...(task && { taskTitle: task.title, dueAt: task.dueAt.toISOString() }),
      ...(actor && { actorName: actor.name }),
    };
  }
}
