import type { ConfigService } from '@nestjs/config';

import { FixedClock } from '../common/clock.js';
import type { NotificationEvent, ReminderKind } from '../common/domain.js';
import type { EventBus } from '../common/events/event-bus.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import type { Database } from '../db/database.js';
import type { GroupsApi } from '../groups/index.js';
import type { MailService } from '../mail/index.js';
import type { TasksApi, TaskView } from '../tasks/index.js';
import type { UserDto, UsersApi } from '../users/index.js';
import { NotificationEmails } from './notification-emails.js';
import type { NotificationFeed } from './notification-feed.js';
import type { NotificationsRepository } from './notifications.repository.js';
import { ReminderJobs } from './reminder-jobs.js';

const NOW = new Date('2026-11-16T07:00:00Z');
const HOUR = 60 * 60 * 1000;

function user(id: string, overrides: Partial<UserDto> = {}): UserDto {
  return {
    id,
    name: `${id} Koval`,
    email: `${id}@errandly.dev`,
    emailVerified: true,
    timezone: 'Europe/Kyiv',
    timezoneAuto: true,
    locale: 'uk',
    avatarUrl: null,
    ...overrides,
  };
}

function setup() {
  const tasks = new Map<string, TaskView>();
  const users = new Map([
    ['anya', user('anya')],
    ['bohdan', user('bohdan')],
  ]);
  const prefs = new Map<string, boolean>();
  const reminderMinutes = new Map<string, number>();
  const reminders = new Set<string>();
  const digests = new Set<string>();
  const sent: { template: string; to: string; data: Record<string, unknown> }[] = [];
  const published: [string, Record<string, unknown>][] = [];
  const feed: { userId: string; type: string }[] = [];

  const repository = {
    emailEnabled: (userId: string, event: NotificationEvent) =>
      Promise.resolve(prefs.get(`${userId}:${event}`)),
    emailReminderMinutesOf: (userId: string) =>
      Promise.resolve(reminderMinutes.get(userId) ?? 1440),
    emailReminderMinutesOfMany: () => Promise.resolve(reminderMinutes),
    usersWithEmail: (event: NotificationEvent) =>
      Promise.resolve(
        [...prefs]
          .filter(([key, on]) => on && key.endsWith(`:${event}`))
          .map(([key]) => key.split(':')[0] ?? ''),
      ),
    recordReminder: (r: { taskId: string; userId: string; kind: ReminderKind; dueAt: Date }) => {
      const key = `${r.taskId}:${r.userId}:${r.kind}:${r.dueAt.toISOString()}`;
      const fresh = !reminders.has(key);
      reminders.add(key);
      return Promise.resolve(fresh);
    },
    recordDigest: (userId: string, weekStart: string) => {
      const key = `${userId}:${weekStart}`;
      const fresh = !digests.has(key);
      digests.add(key);
      return Promise.resolve(fresh);
    },
  } as unknown as NotificationsRepository;
  const tasksApi = {
    find: (id: string) => Promise.resolve(tasks.get(id) ?? null),
    openAssignedDueBetween: (from: Date, to: Date) =>
      Promise.resolve(
        [...tasks.values()].filter(
          (task) =>
            task.assigneeId !== null &&
            task.completedAt === null &&
            task.dueAt > from &&
            task.dueAt <= to,
        ),
      ),
    assignedTo: (userId: string) =>
      Promise.resolve([...tasks.values()].filter((task) => task.assigneeId === userId)),
  } as unknown as TasksApi;
  const groups = {
    names: (ids: string[]) => Promise.resolve(new Map(ids.map((id) => [id, 'Room 12']))),
  } as unknown as GroupsApi;
  const usersApi = {
    findById: (id: string) => Promise.resolve(users.get(id) ?? null),
    findMany: (ids: string[]) =>
      Promise.resolve(new Map(ids.flatMap((id) => (users.has(id) ? [[id, users.get(id)]] : [])))),
  } as unknown as UsersApi;
  const mail = {
    send: (template: string, to: string, data: Record<string, unknown>) => {
      sent.push({ template, to, data });
      return Promise.resolve('<id>');
    },
  } as unknown as MailService;
  const bus = {
    onAfterCommit: () => undefined,
    publish: (_tx: unknown, type: string, event: Record<string, unknown>) => {
      published.push([type, event]);
      return Promise.resolve();
    },
  } as unknown as EventBus;
  const notificationFeed = {
    notify: (recipients: { userId: string; type: string }[]) => {
      feed.push(...recipients);
      return Promise.resolve();
    },
  } as unknown as NotificationFeed;
  const db = {
    transaction: <T>(work: (tx: unknown) => Promise<T>) => work('tx'),
  } as unknown as Database;
  const config = {
    get: (key: string) => (key === 'APP_URL' ? 'https://errandly.app' : true),
  } as unknown as ConfigService<EnvironmentVariables, true>;
  const clock = new FixedClock(NOW);
  const emails = new NotificationEmails(
    repository,
    tasksApi,
    groups,
    usersApi,
    mail,
    bus,
    clock,
    config,
  );
  const jobs = new ReminderJobs(
    db,
    repository,
    notificationFeed,
    tasksApi,
    usersApi,
    bus,
    clock,
    config,
  );

  function addTask(overrides: Partial<TaskView>): TaskView {
    const created: TaskView = {
      id: `t${tasks.size + 1}`,
      groupId: 'g1',
      title: 'Take out the trash',
      description: '',
      dueAt: new Date(NOW.getTime() + 2 * HOUR),
      difficulty: 2,
      assigneeId: 'bohdan',
      completedAt: null,
      ...overrides,
    };
    tasks.set(created.id, created);
    return created;
  }

  return { emails, jobs, prefs, reminderMinutes, sent, published, feed, addTask, clock };
}

function assigned(taskId: string, overrides: Record<string, unknown> = {}) {
  return {
    taskId,
    groupId: 'g1',
    assigneeId: 'bohdan',
    previousAssigneeId: null,
    actorId: null,
    bulk: false,
    ...overrides,
  };
}

describe('NotificationEmails', () => {
  it('emails the new assignee, naming whoever assigned the task by hand', async () => {
    const { emails, sent, addTask } = setup();
    const task = addTask({});

    await emails.assigned(assigned(task.id));
    await emails.assigned(assigned(task.id, { actorId: 'anya' }));

    expect(sent.map(({ template, to }) => [template, to])).toEqual([
      ['taskAssigned', 'bohdan@errandly.dev'],
      ['taskAssigned', 'bohdan@errandly.dev'],
    ]);
    expect(sent[0]?.data).toMatchObject({
      name: 'bohdan',
      groupName: 'Room 12',
      url: `https://errandly.app/g/g1/tasks/${task.id}`,
    });
    expect(sent[0]?.data).not.toHaveProperty('actorName');
    expect(sent[1]?.data).toMatchObject({ actorName: 'anya Koval' });
  });

  it('sends nothing for bulk instances, own actions, a turned-off switch or a stale task', async () => {
    const { emails, sent, prefs, addTask } = setup();
    const task = addTask({});
    const done = addTask({ completedAt: NOW });

    await emails.assigned(assigned(task.id, { bulk: true }));
    await emails.assigned(assigned(task.id, { actorId: 'bohdan' }));
    await emails.assigned(assigned(task.id, { assigneeId: 'anya' }));
    await emails.assigned(assigned(done.id));
    prefs.set('bohdan:taskAssigned', false);
    await emails.assigned(assigned(task.id));

    expect(sent).toEqual([]);
  });

  it('sends the due-soon email with the user’s reminder time', async () => {
    const { emails, sent, reminderMinutes, addTask } = setup();
    const task = addTask({});
    reminderMinutes.set('bohdan', 180);

    await emails.reminder({ taskId: task.id, userId: 'bohdan', kind: 'dueSoon' });
    await emails.reminder({ taskId: task.id, userId: 'bohdan', kind: 'overdue' });

    expect(sent.map(({ template }) => template)).toEqual(['taskDueSoon', 'taskOverdue']);
    expect(sent[0]?.data).toMatchObject({ reminderMinutes: 180 });
  });

  it('skips a digest with nothing to say', async () => {
    const { emails, sent, prefs } = setup();
    prefs.set('anya:weeklyDigest', true);

    await emails.digest({
      userId: 'anya',
      lastWeekFrom: '2026-11-08T22:00:00.000Z',
      lastWeekTo: '2026-11-15T22:00:00.000Z',
      until: '2026-11-23T07:00:00.000Z',
    });

    expect(sent).toEqual([]);
  });
});

describe('ReminderJobs', () => {
  it('queues each due-soon reminder once, by the assignee’s reminder time', async () => {
    const { jobs, published, reminderMinutes, addTask } = setup();
    const soon = addTask({ dueAt: new Date(NOW.getTime() + 2 * HOUR) });
    addTask({ dueAt: new Date(NOW.getTime() + 2 * HOUR), assigneeId: 'anya' });
    reminderMinutes.set('anya', 60);

    expect(await jobs.dueSoon()).toBe(1);
    expect(await jobs.dueSoon()).toBe(0);
    expect(published).toEqual([
      ['notification.reminderDue', { taskId: soon.id, userId: 'bohdan', kind: 'dueSoon' }],
    ]);
  });

  it('notifies about a task that just went overdue, once', async () => {
    const { jobs, feed, published, addTask } = setup();
    const late = addTask({ dueAt: new Date(NOW.getTime() - HOUR) });
    addTask({ dueAt: new Date(NOW.getTime() - 3 * 24 * HOUR) });

    expect(await jobs.overdue()).toBe(1);
    expect(await jobs.overdue()).toBe(0);
    expect(feed).toEqual([{ userId: 'bohdan', type: 'taskOverdue' }]);
    expect(published).toEqual([
      ['notification.reminderDue', { taskId: late.id, userId: 'bohdan', kind: 'overdue' }],
    ]);
  });

  it('queues the weekly digest on Monday morning for those who turned it on', async () => {
    const { jobs, prefs, published, clock } = setup();
    prefs.set('anya:weeklyDigest', true);

    expect(await jobs.digests()).toBe(1);
    expect(await jobs.digests()).toBe(0);
    clock.advance(24 * HOUR);
    expect(await jobs.digests()).toBe(0);
    expect(published).toEqual([
      [
        'notification.digestDue',
        {
          userId: 'anya',
          lastWeekFrom: '2026-11-08T22:00:00.000Z',
          lastWeekTo: '2026-11-15T22:00:00.000Z',
          until: '2026-11-23T07:00:00.000Z',
        },
      ],
    ]);
  });
});
