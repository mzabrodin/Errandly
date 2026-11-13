import { addMonths } from 'date-fns';

import type {
  AppNotification,
  GroupRole,
  Recurrence,
  Settings,
  Task,
  TaskStatus,
  User,
} from '../shared/api/types';
import { toDateInputValue } from '../shared/lib/dates';
import { pickAssignee, type AllocationMember } from './allocation';

// In-memory "backend" for development without a server. State is kept in localStorage.

interface DbUser extends User {
  password: string;
  failedLogins: number;
  lockedUntil: number | null;
}

interface DbMembership {
  groupId: string;
  userId: string;
  role: GroupRole;
  color: string;
}

interface DbAbsence {
  id: string;
  groupId: string;
  userId: string;
  from: string;
  to: string;
}

type DbTask = Omit<Task, 'status'>;

interface DbInvite {
  token: string;
  groupId: string;
  invitedBy: string;
  expiresAt: string;
  revoked: boolean;
}

export interface Db {
  version: number;
  sessionUserId: string | null;
  users: DbUser[];
  groups: { id: string; name: string }[];
  memberships: DbMembership[];
  absences: DbAbsence[];
  tasks: DbTask[];
  invites: DbInvite[];
  settings: Record<string, Settings>;
  notifications: (AppNotification & { userId: string })[];
}

const STORAGE_KEY = 'errandly-mock-db';
const DB_VERSION = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
export const HORIZON_DAYS = 28;

export const MEMBER_COLORS = [
  '#e6f36b',
  '#8ec3ea',
  '#f6b6cf',
  '#ffb86b',
  '#c9b6f2',
  '#9ee0c0',
  '#ffe27a',
  '#ff9c8a',
];

export function id(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Member colour by position in the group (cycling) */
export function memberColor(index: number): string {
  return MEMBER_COLORS[index % MEMBER_COLORS.length] ?? '#e6f36b';
}

/** Like the backend: the first colour nobody in the group has, then by position */
export function freeMemberColor(taken: readonly string[]): string {
  return MEMBER_COLORS.find((color) => !taken.includes(color)) ?? memberColor(taken.length);
}

export function isCompleted(task: Pick<DbTask, 'completedAt'>): boolean {
  return task.completedAt !== null && task.completedAt !== '';
}

export function computeStatus(task: DbTask, now = Date.now()): TaskStatus {
  if (isCompleted(task)) return 'done';
  if (new Date(task.dueAt).getTime() < now) return 'overdue';
  if (task.assigneeId === null || task.assigneeId === '') return 'unassigned';
  return 'planned';
}

export function withStatus(task: DbTask): Task {
  return { ...task, status: computeStatus(task) };
}

function defaultSettings(): Settings {
  return {
    calendar: {
      connected: false,
      syncStatus: 'ok',
      googleEmail: null,
      lastSyncedAt: null,
    },
    reminderMinutes: 60,
    notifications: {
      assigned: true,
      dueSoon: true,
      overdue: true,
      weeklyDigest: false,
    },
  };
}

/** Dates of the series instances from the first due date to the horizon (FR-21) */
export function occurrences(recurrence: Recurrence, firstDueAt: Date, until: Date): Date[] {
  if (recurrence.type === 'once') return [firstDueAt];

  const result: Date[] = [];
  const cursor = new Date(firstDueAt);
  let monthOffset = 0;

  while (cursor.getTime() <= until.getTime() && result.length < 400) {
    if (recurrence.type === 'daily') {
      result.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    } else if (recurrence.type === 'weekly') {
      const weekday = ((cursor.getDay() + 6) % 7) + 1;
      if (recurrence.weekdays.includes(weekday)) result.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    } else {
      monthOffset += 1;
      result.push(new Date(cursor));
      // Like the backend: a date past the month's end falls on its last day
      cursor.setTime(addMonths(firstDueAt, monthOffset).getTime());
    }
  }
  return result;
}

export function groupMembersForAllocation(db: Db, groupId: string): AllocationMember[] {
  return db.memberships
    .filter((membership) => membership.groupId === groupId)
    .map((membership) => ({
      userId: membership.userId,
      name: db.users.find((user) => user.id === membership.userId)?.name ?? '',
      absences: db.absences.filter(
        (absence) => absence.groupId === groupId && absence.userId === membership.userId,
      ),
    }));
}

export function autoAssign(
  db: Db,
  groupId: string,
  task: Pick<DbTask, 'seriesId' | 'dueAt'>,
): string | null {
  return pickAssignee(
    groupMembersForAllocation(db, groupId),
    db.tasks.filter((other) => other.groupId === groupId),
    task,
  );
}

export interface SeriesInput {
  groupId: string;
  title: string;
  description: string;
  firstDueAt: Date;
  difficulty: number;
  recurrence: Recurrence;
  assigneeId: string | null;
}

/** Creates the series instances and assigns them right away. Returns the created tasks */
export function createSeries(db: Db, input: SeriesInput, seriesId = id('series')): DbTask[] {
  const until = new Date(Date.now() + HORIZON_DAYS * DAY_MS);
  const created: DbTask[] = [];

  for (const due of occurrences(input.recurrence, input.firstDueAt, until)) {
    const dueAt = due.toISOString();
    const assigneeId = input.assigneeId ?? autoAssign(db, input.groupId, { seriesId, dueAt });
    const task: DbTask = {
      id: id('task'),
      seriesId,
      groupId: input.groupId,
      title: input.title,
      description: input.description,
      dueAt,
      difficulty: input.difficulty,
      recurrence: input.recurrence,
      assigneeId,
      manuallyAssigned: input.assigneeId !== null,
      completedAt: null,
    };
    db.tasks.push(task);
    created.push(task);
  }
  return created;
}

function at(daysFromToday: number, hour: number): Date {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() + daysFromToday);
  return date;
}

const SEED_PEOPLE = [
  { id: 'u-anya', name: 'Anya Koval', email: 'anya@errandly.dev' },
  { id: 'u-bohdan', name: 'Bohdan Melnyk', email: 'bohdan@errandly.dev' },
  { id: 'u-marta', name: 'Marta Shevchuk', email: 'marta@errandly.dev' },
  { id: 'u-oleh', name: 'Oleh Bondar', email: 'oleh@errandly.dev' },
];

function seedUsers(db: Db): void {
  for (const person of SEED_PEOPLE) {
    db.users.push({
      ...person,
      emailVerified: true,
      timezone: 'Europe/Kyiv',
      timezoneAuto: true,
      locale: 'uk',
      password: 'Pass1234',
      failedLogins: 0,
      lockedUntil: null,
      avatarUrl: null,
    });
    db.settings[person.id] = defaultSettings();
  }
  const anyaSettings = db.settings['u-anya'];
  if (anyaSettings) {
    anyaSettings.calendar = {
      connected: true,
      syncStatus: 'ok',
      googleEmail: 'anya.koval@gmail.com',
      lastSyncedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    };
  }
}

function seedGroups(db: Db): void {
  db.groups.push({ id: 'g-room12', name: 'Room 12' }, { id: 'g-podil', name: 'Podil Flat' });
  SEED_PEOPLE.forEach((person, index) =>
    db.memberships.push({
      groupId: 'g-room12',
      userId: person.id,
      role: index === 0 ? 'admin' : 'member',
      color: memberColor(index),
    }),
  );
  db.memberships.push(
    {
      groupId: 'g-podil',
      userId: 'u-marta',
      role: 'admin',
      color: memberColor(0),
    },
    {
      groupId: 'g-podil',
      userId: 'u-anya',
      role: 'member',
      color: memberColor(1),
    },
  );

  db.absences.push({
    id: 'abs-marta',
    groupId: 'g-room12',
    userId: 'u-marta',
    from: toDateInputValue(at(-1, 0)),
    to: toDateInputValue(at(1, 0)),
  });
  db.absences.push({
    id: 'abs-oleh',
    groupId: 'g-room12',
    userId: 'u-oleh',
    from: toDateInputValue(at(3, 0)),
    to: toDateInputValue(at(9, 0)),
  });
}

// Dates are relative to the seeding moment, so this is a function, not a constant
function seedSeries(): Omit<SeriesInput, 'groupId' | 'assigneeId'>[] {
  return [
    {
      title: 'Take out the trash',
      description: 'Recycling goes in the yellow bins by the entrance',
      firstDueAt: at(-14, 20),
      difficulty: 2,
      recurrence: { type: 'weekly', weekdays: [1, 4] },
    },
    {
      title: 'Wash the dishes',
      description: '',
      firstDueAt: at(-14, 21),
      difficulty: 1,
      recurrence: { type: 'daily' },
    },
    {
      title: 'Clean the bathroom',
      description: 'Sink, mirror, floor',
      firstDueAt: at(-14, 12),
      difficulty: 4,
      recurrence: { type: 'weekly', weekdays: [6] },
    },
    {
      title: 'Vacuum the room',
      description: '',
      firstDueAt: at(-14, 18),
      difficulty: 3,
      recurrence: { type: 'weekly', weekdays: [3] },
    },
    {
      title: 'Water the plants',
      description: 'The monstera only if the soil is dry',
      firstDueAt: at(-14, 9),
      difficulty: 1,
      recurrence: { type: 'weekly', weekdays: [2, 5] },
    },
  ];
}

function seedTasks(db: Db): void {
  // Create instances without assignees first, then assign them in chronological order
  for (const item of seedSeries()) {
    createSeries(db, { ...item, groupId: 'g-room12', assigneeId: 'pending' });
  }
  const pending = db.tasks.filter((task) => task.assigneeId === 'pending');
  for (const task of pending) task.assigneeId = null;
  for (const task of pending.toSorted((a, b) => a.dueAt.localeCompare(b.dueAt))) {
    task.assigneeId = autoAssign(db, 'g-room12', task);
    task.manuallyAssigned = false;
  }
  createSeries(db, {
    groupId: 'g-room12',
    title: 'Buy cleaning supplies',
    description: 'Dish soap, sponges, trash bags',
    firstDueAt: at(2, 19),
    difficulty: 2,
    recurrence: { type: 'once' },
    assigneeId: 'u-anya',
  });
  createSeries(db, {
    groupId: 'g-podil',
    title: 'Pay the utility bills',
    description: '',
    firstDueAt: at(5, 12),
    difficulty: 2,
    recurrence: { type: 'monthly' },
    assigneeId: null,
  });

  // History: most past tasks are done, a few are overdue
  let counter = 0;
  for (const task of db.tasks) {
    const due = new Date(task.dueAt).getTime();
    if (due < Date.now()) {
      counter += 1;
      if (counter % 7 !== 0) task.completedAt = new Date(due - 60 * 60 * 1000).toISOString();
    }
  }
}

function seed(): Db {
  const db: Db = {
    version: DB_VERSION,
    sessionUserId: null,
    users: [],
    groups: [],
    memberships: [],
    absences: [],
    tasks: [],
    invites: [],
    settings: {},
    notifications: [],
  };

  seedUsers(db);
  seedGroups(db);
  seedTasks(db);

  db.invites.push({
    token: 'expired-demo',
    groupId: 'g-room12',
    invitedBy: 'u-anya',
    expiresAt: at(-1, 0).toISOString(),
    revoked: false,
  });

  seedNotifications(db);
  return db;
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

/** A few demo notifications so the bell is not empty */
function seedNotifications(target: Db): void {
  const room = target.groups.find((group) => group.id === 'g-room12');
  if (!room) return;
  const [nextAnyaTask] = target.tasks
    .filter((task) => task.assigneeId === 'u-anya' && new Date(task.dueAt).getTime() > Date.now())
    .toSorted((a, b) => a.dueAt.localeCompare(b.dueAt));
  const base = { read: false, groupId: room.id, userId: 'u-anya' };
  target.notifications.push(
    {
      ...base,
      id: id('ntf'),
      type: 'groupCreated',
      createdAt: hoursAgo(24 * 14),
      read: true,
      taskId: null,
      data: { groupName: room.name },
    },
    {
      ...base,
      id: id('ntf'),
      type: 'memberJoined',
      createdAt: hoursAgo(24 * 13),
      read: true,
      taskId: null,
      data: { groupName: room.name, actorName: 'Oleh Bondar' },
    },
    ...(nextAnyaTask
      ? [
          {
            ...base,
            id: id('ntf'),
            type: 'taskAssigned' as const,
            createdAt: hoursAgo(3),
            taskId: nextAnyaTask.id,
            data: {
              groupName: room.name,
              taskTitle: nextAnyaTask.title,
              dueAt: nextAnyaTask.dueAt,
            },
          },
        ]
      : []),
  );
}

/** Database snapshot from localStorage. Notifications were added later, so older snapshots may lack them */
type StoredDb = Omit<Db, 'notifications'> & { notifications?: Db['notifications'] };

// Only the schema version is checked: DB_VERSION guarantees the snapshot shape (we write it ourselves in persist)
function isStoredDb(value: unknown): value is StoredDb {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    value.version === DB_VERSION
  );
}

function load(): Db {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null && raw !== '') {
      const parsed: unknown = JSON.parse(raw);
      if (isStoredDb(parsed)) {
        const { notifications } = parsed;
        if (notifications) return { ...parsed, notifications };
        // Migration without a data reset: notifications were added later
        const migrated: Db = { ...parsed, notifications: [] };
        seedNotifications(migrated);
        return migrated;
      }
    }
  } catch {
    // Storage unavailable: work in memory only
  }
  return seed();
}

export const db: Db = load();

export function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Ignore: state stays in memory until reload
  }
}

export function resetDb(): void {
  Object.assign(db, seed());
  persist();
}

export function publicUser({
  id: userId,
  name,
  email,
  emailVerified,
  timezone,
  timezoneAuto,
  locale,
  avatarUrl,
}: DbUser): User {
  return {
    id: userId,
    name,
    email,
    emailVerified,
    timezone,
    timezoneAuto,
    locale,
    avatarUrl: avatarUrl ?? null,
  };
}

export function defaultSettingsFor(userId: string): Settings {
  const defaults = defaultSettings();
  const current = db.settings[userId] ?? defaults;
  // Fill previously saved settings with new fields (without a reset)
  current.calendar = { ...defaults.calendar, ...current.calendar };
  current.notifications = {
    ...defaults.notifications,
    ...current.notifications,
  };
  db.settings[userId] = current;
  return current;
}

export { DAY_MS };
