import type { DomainEventMap, EventType } from '../common/events/domain-events.js';
import type { EventBus } from '../common/events/event-bus.js';
import type { DbExecutor } from '../db/database.js';
import type { GroupsApi } from '../groups/index.js';
import type { TasksApi, TaskView } from '../tasks/index.js';
import type { UserDto, UsersApi } from '../users/index.js';
import { NotificationFeed } from './notification-feed.js';
import type { NotificationsRepository } from './notifications.repository.js';
import type { NewNotificationRow } from './notifications.schema.js';

const TX = 'tx' as unknown as DbExecutor;
const G = 'g1';

type Listener = (event: never, tx: DbExecutor) => Promise<void>;

function setup({ unread = false } = {}) {
  const listeners = new Map<string, Listener>();
  const inserted: NewNotificationRow[] = [];
  const repository = {
    insert: (rows: NewNotificationRow[]) => {
      inserted.push(...rows);
      return Promise.resolve();
    },
    hasUnread: () => Promise.resolve(unread),
  } as unknown as NotificationsRepository;
  const groups = {
    admins: () => Promise.resolve(['anya', 'oleh']),
    names: () => Promise.resolve(new Map([[G, 'Room 12']])),
  } as unknown as GroupsApi;
  const tasks = {
    find: () =>
      Promise.resolve({ title: 'Trash', dueAt: new Date('2026-11-20T18:00:00Z') } as TaskView),
  } as unknown as TasksApi;
  const users = {
    findById: (id: string) => Promise.resolve({ id, name: `Name of ${id}` } as UserDto),
  } as unknown as UsersApi;
  const bus = {
    onInTransaction: (type: string, listener: Listener) => listeners.set(type, listener),
  } as unknown as EventBus;
  new NotificationFeed(repository, groups, tasks, users, bus).onModuleInit();
  const emit = <K extends EventType>(type: K, event: DomainEventMap[K]) =>
    listeners.get(type)?.(event as never, TX);
  const sent = () => inserted.map(({ userId, type }) => `${userId}:${type}`);
  return { emit, inserted, sent };
}

describe('NotificationFeed', () => {
  it('greets a new member and tells the other admins', async () => {
    const { emit, sent, inserted } = setup();

    await emit('group.memberJoined', { groupId: G, userId: 'oleh' });

    expect(sent()).toEqual(['oleh:groupJoined', 'anya:memberJoined']);
    expect(inserted[0]?.data).toEqual({ groupName: 'Room 12', actorName: 'Name of oleh' });
  });

  it('tells a removed member without linking the group, but not one who left', async () => {
    const { emit, inserted } = setup();

    await emit('group.memberLeft', { groupId: G, userId: 'oleh', removedBy: 'anya' });
    await emit('group.memberLeft', { groupId: G, userId: 'bohdan', removedBy: null });
    await emit('group.memberLeft', { groupId: G, userId: 'vira', removedBy: 'vira' });

    expect(inserted).toEqual([
      expect.objectContaining({ userId: 'oleh', type: 'removedFromGroup', groupId: null }),
    ]);
  });

  it('tells about a role change made by someone else only', async () => {
    const { emit, sent } = setup();

    await emit('group.roleChanged', { groupId: G, userId: 'oleh', role: 'admin', actorId: 'anya' });
    await emit('group.roleChanged', {
      groupId: G,
      userId: 'oleh',
      role: 'member',
      actorId: 'anya',
    });
    await emit('group.roleChanged', {
      groupId: G,
      userId: 'anya',
      role: 'member',
      actorId: 'anya',
    });

    expect(sent()).toEqual(['oleh:roleGranted', 'oleh:roleRevoked']);
  });

  it('describes the task in the notification', async () => {
    const { emit, inserted } = setup();

    await emit('task.assigned', {
      taskId: 't1',
      groupId: G,
      assigneeId: 'oleh',
      previousAssigneeId: null,
      actorId: 'anya',
      bulk: false,
    });

    expect(inserted).toEqual([
      {
        userId: 'oleh',
        type: 'taskAssigned',
        groupId: G,
        taskId: 't1',
        data: {
          groupName: 'Room 12',
          taskTitle: 'Trash',
          dueAt: '2026-11-20T18:00:00.000Z',
          actorName: 'Name of anya',
        },
      },
    ]);
  });

  it('does not repeat "nobody can take it" while the admin has not read the last one', async () => {
    const unassigned = {
      taskId: 't1',
      groupId: G,
      assigneeId: null,
      previousAssigneeId: 'oleh',
      actorId: null,
      bulk: false,
    };

    const fresh = setup();
    await fresh.emit('task.assigned', unassigned);
    const repeated = setup({ unread: true });
    await repeated.emit('task.assigned', unassigned);

    expect(fresh.sent()).toEqual(
      expect.arrayContaining(['anya:taskNoAssignee', 'oleh:taskNoAssignee']),
    );
    expect(repeated.sent()).not.toContain('anya:taskNoAssignee');
  });

  it('tells about swaps the side that has to act or that asked', async () => {
    const { emit, inserted } = setup();
    const swap = {
      swapId: 's1',
      groupId: G,
      offeredTaskId: 't1',
      requestedTaskId: 't2',
      proposerId: 'oleh',
      recipientId: 'anya',
    };

    await emit('task.swapProposed', swap);
    await emit('task.swapDecided', { ...swap, accepted: true });
    await emit('task.swapDecided', { ...swap, accepted: false });

    expect(inserted.map(({ userId, type, taskId }) => [userId, type, taskId])).toEqual([
      ['anya', 'swapProposed', 't1'],
      ['oleh', 'swapAccepted', 't2'],
      ['oleh', 'swapDeclined', 't1'],
    ]);
  });
});
