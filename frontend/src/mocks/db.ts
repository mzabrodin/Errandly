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

// In-memory «бекенд» для розробки без сервера. Стан зберігається в localStorage.

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
const DB_VERSION = 3;
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

/** Колір учасника за порядковим номером у групі (по колу) */
export function memberColor(index: number): string {
  return MEMBER_COLORS[index % MEMBER_COLORS.length] ?? '#e6f36b';
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

/** Дати екземплярів серії від першого терміну до горизонту (FR-21) */
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
      cursor.setTime(firstDueAt.getTime());
      cursor.setMonth(firstDueAt.getMonth() + monthOffset);
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

/** Створює екземпляри серії й одразу розподіляє їх. Повертає створені задачі */
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
  { id: 'u-anya', name: 'Аня Коваль', email: 'anya@errandly.dev' },
  { id: 'u-bohdan', name: 'Богдан Мельник', email: 'bohdan@errandly.dev' },
  { id: 'u-marta', name: 'Марта Шевчук', email: 'marta@errandly.dev' },
  { id: 'u-oleh', name: 'Олег Бондар', email: 'oleh@errandly.dev' },
];

function seedUsers(db: Db): void {
  for (const person of SEED_PEOPLE) {
    db.users.push({
      ...person,
      emailVerified: true,
      timezone: 'Europe/Kyiv',
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
  db.groups.push(
    { id: 'g-room12', name: 'Кімната 12' },
    { id: 'g-podil', name: 'Квартира на Подолі' },
  );
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

// дати рахуються від моменту сідування, тому це функція, а не константа
function seedSeries(): Omit<SeriesInput, 'groupId' | 'assigneeId'>[] {
  return [
    {
      title: 'Винести сміття',
      description: 'Сортоване — у жовті баки біля під’їзду',
      firstDueAt: at(-14, 20),
      difficulty: 2,
      recurrence: { type: 'weekly', weekdays: [1, 4] },
    },
    {
      title: 'Помити посуд',
      description: '',
      firstDueAt: at(-14, 21),
      difficulty: 1,
      recurrence: { type: 'daily' },
    },
    {
      title: 'Прибрати ванну',
      description: 'Раковина, дзеркало, підлога',
      firstDueAt: at(-14, 12),
      difficulty: 4,
      recurrence: { type: 'weekly', weekdays: [6] },
    },
    {
      title: 'Пропилососити кімнату',
      description: '',
      firstDueAt: at(-14, 18),
      difficulty: 3,
      recurrence: { type: 'weekly', weekdays: [3] },
    },
    {
      title: 'Полити вазони',
      description: 'Монстеру — тільки якщо земля суха',
      firstDueAt: at(-14, 9),
      difficulty: 1,
      recurrence: { type: 'weekly', weekdays: [2, 5] },
    },
  ];
}

function seedTasks(db: Db): void {
  // спершу створюємо екземпляри без виконавців, потім розподіляємо в хронологічному порядку
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
    title: 'Купити побутову хімію',
    description: 'Засіб для посуду, губки, пакети для сміття',
    firstDueAt: at(2, 19),
    difficulty: 2,
    recurrence: { type: 'once' },
    assigneeId: 'u-anya',
  });
  createSeries(db, {
    groupId: 'g-podil',
    title: 'Оплатити комуналку',
    description: '',
    firstDueAt: at(5, 12),
    difficulty: 2,
    recurrence: { type: 'monthly' },
    assigneeId: null,
  });

  // історія: більшість минулих задач виконано, кілька — прострочено
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

/** Кілька демо-сповіщень, щоб дзвіночок не був порожнім */
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
      data: { groupName: room.name, actorName: 'Олег Бондар' },
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

/** Знімок бази з localStorage. Сповіщення з'явилися пізніше, тож у старих знімках їх може не бути */
type StoredDb = Omit<Db, 'notifications'> & { notifications?: Db['notifications'] };

// перевіряємо лише версію схеми: структуру знімка гарантує DB_VERSION (пишемо його самі в persist)
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
        // міграція без скидання даних: сповіщення з'явилися пізніше
        const migrated: Db = { ...parsed, notifications: [] };
        seedNotifications(migrated);
        return migrated;
      }
    }
  } catch {
    // сховище недоступне — працюємо лише в пам'яті
  }
  return seed();
}

export const db: Db = load();

export function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // ігноруємо: стан лишиться в пам'яті до перезавантаження
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
  avatarUrl,
}: DbUser): User {
  return {
    id: userId,
    name,
    email,
    emailVerified,
    timezone,
    avatarUrl: avatarUrl ?? null,
  };
}

export function defaultSettingsFor(userId: string): Settings {
  const defaults = defaultSettings();
  const current = db.settings[userId] ?? defaults;
  // доповнюємо збережені раніше налаштування новими полями (без скидання)
  current.calendar = { ...defaults.calendar, ...current.calendar };
  current.notifications = {
    ...defaults.notifications,
    ...current.notifications,
  };
  db.settings[userId] = current;
  return current;
}

export { DAY_MS };
