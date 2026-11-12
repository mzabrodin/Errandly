// Demo data for local development, mirroring the frontend mock (frontend/src/mocks/db.ts):
// the same people, groups and chores, so switching VITE_USE_MOCKS off shows a familiar picture
import { createHash, randomUUID } from 'node:crypto';

import { HORIZON_DAYS, memberColor, type RecurrenceType } from '../common/domain.js';
import type {
  absences,
  groups,
  invites,
  memberships,
  NewNotificationRow,
  NewTaskRow,
  NewTaskSeriesRow,
  NewUserRow,
  passwordCredentials,
} from './schema.js';

export const DEMO_PASSWORD = 'Pass1234';

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 14;

export interface SeedData {
  users: NewUserRow[];
  passwordCredentials: (typeof passwordCredentials.$inferInsert)[];
  groups: (typeof groups.$inferInsert)[];
  memberships: (typeof memberships.$inferInsert)[];
  absences: (typeof absences.$inferInsert)[];
  invites: (typeof invites.$inferInsert)[];
  taskSeries: NewTaskSeriesRow[];
  tasks: NewTaskRow[];
  notifications: NewNotificationRow[];
}

interface SeriesSpec {
  title: string;
  description: string;
  difficulty: number;
  recurrence: RecurrenceType;
  weekdays: number[];
  /** Days from today of the first instance */
  startDay: number;
  /** Hour of the day in UTC (Kyiv is UTC+2 in winter) */
  hourUtc: number;
  assigneeId: string | null;
}

type SeedTask = NewTaskRow & { id: string; assigneeId: string | null };

interface Member {
  userId: string;
  name: string;
}

function dayAt(now: Date, days: number, hour = 0): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days, hour));
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isoWeekday(date: Date): number {
  return ((date.getUTCDay() + 6) % 7) + 1;
}

export function occurrences(spec: SeriesSpec, first: Date, until: Date): Date[] {
  if (spec.recurrence === 'once') return [first];
  const result: Date[] = [];
  for (let step = 0; result.length < 400; step += 1) {
    const due =
      spec.recurrence === 'monthly'
        ? new Date(
            Date.UTC(
              first.getUTCFullYear(),
              first.getUTCMonth() + step,
              first.getUTCDate(),
              first.getUTCHours(),
            ),
          )
        : new Date(first.getTime() + step * DAY_MS);
    if (due > until) break;
    if (spec.recurrence !== 'weekly' || spec.weekdays.includes(isoWeekday(due))) result.push(due);
  }
  return result;
}

const PEOPLE = [
  { key: 'anya', name: 'Anya Koval' },
  { key: 'bohdan', name: 'Bohdan Melnyk' },
  { key: 'marta', name: 'Marta Shevchuk' },
  { key: 'oleh', name: 'Oleh Bondar' },
] as const;

function seriesSpecs(anyaId: string): { room: SeriesSpec[]; flat: SeriesSpec[] } {
  const recurring = (spec: Omit<SeriesSpec, 'startDay' | 'assigneeId'>): SeriesSpec => ({
    ...spec,
    startDay: -HISTORY_DAYS,
    assigneeId: null,
  });
  return {
    room: [
      recurring({
        title: 'Take out the trash',
        description: 'Recycling goes in the yellow bins by the entrance',
        difficulty: 2,
        recurrence: 'weekly',
        weekdays: [1, 4],
        hourUtc: 18,
      }),
      recurring({
        title: 'Wash the dishes',
        description: '',
        difficulty: 1,
        recurrence: 'daily',
        weekdays: [],
        hourUtc: 19,
      }),
      recurring({
        title: 'Clean the bathroom',
        description: 'Sink, mirror, floor',
        difficulty: 4,
        recurrence: 'weekly',
        weekdays: [6],
        hourUtc: 10,
      }),
      recurring({
        title: 'Vacuum the room',
        description: '',
        difficulty: 3,
        recurrence: 'weekly',
        weekdays: [3],
        hourUtc: 16,
      }),
      recurring({
        title: 'Water the plants',
        description: 'The monstera only if the soil is dry',
        difficulty: 1,
        recurrence: 'weekly',
        weekdays: [2, 5],
        hourUtc: 7,
      }),
      {
        title: 'Buy cleaning supplies',
        description: 'Dish soap, sponges, trash bags',
        difficulty: 2,
        recurrence: 'once',
        weekdays: [],
        startDay: 2,
        hourUtc: 17,
        assigneeId: anyaId,
      },
    ],
    flat: [
      {
        title: 'Pay the utility bills',
        description: '',
        difficulty: 2,
        recurrence: 'monthly',
        weekdays: [],
        startDay: 5,
        hourUtc: 10,
        assigneeId: null,
      },
    ],
  };
}

/** A simplified FR-27; the real algorithm belongs to the Assignment module */
function pickAssignee(
  members: Member[],
  absent: (userId: string, day: string) => boolean,
  assigned: SeedTask[],
  dueAt: Date,
): string | null {
  const windowStart = dueAt.getTime() - HORIZON_DAYS * DAY_MS;
  const load = (userId: string): number =>
    assigned
      .filter(
        (task) =>
          task.assigneeId === userId && task.dueAt.getTime() >= windowStart && task.dueAt < dueAt,
      )
      .reduce((sum, task) => sum + task.difficulty, 0);
  const candidates = members
    .filter((member) => !absent(member.userId, isoDate(dueAt)))
    .map((member) => ({ userId: member.userId, name: member.name, load: load(member.userId) }))
    .toSorted((a, b) => (a.load === b.load ? a.name.localeCompare(b.name) : a.load - b.load));
  return candidates[0]?.userId ?? null;
}

function buildTasks(
  now: Date,
  groupId: string,
  specs: SeriesSpec[],
  members: Member[],
  absent: (userId: string, day: string) => boolean,
): { series: NewTaskSeriesRow[]; tasks: SeedTask[] } {
  const until = new Date(now.getTime() + HORIZON_DAYS * DAY_MS);
  const series: NewTaskSeriesRow[] = [];
  const pending: SeedTask[] = [];

  for (const spec of specs) {
    const first = dayAt(now, spec.startDay, spec.hourUtc);
    const seriesId = randomUUID();
    series.push({
      id: seriesId,
      groupId,
      title: spec.title,
      description: spec.description,
      difficulty: spec.difficulty,
      recurrenceType: spec.recurrence,
      weekdays: spec.weekdays,
      startsAt: first,
      materializedUntil: until,
    });
    for (const dueAt of occurrences(spec, first, until)) {
      pending.push({
        id: randomUUID(),
        seriesId,
        groupId,
        title: spec.title,
        description: spec.description,
        dueAt,
        difficulty: spec.difficulty,
        assigneeId: spec.assigneeId,
        manuallyAssigned: spec.assigneeId !== null,
      });
    }
  }

  // Assign in chronological order so the load balances over time, then complete most past tasks
  const tasks: SeedTask[] = [];
  let pastCount = 0;
  for (const row of pending.toSorted((a, b) => a.dueAt.getTime() - b.dueAt.getTime())) {
    const assigneeId = row.assigneeId ?? pickAssignee(members, absent, tasks, row.dueAt);
    const isPast = row.dueAt < now;
    if (isPast) pastCount += 1;
    // Every 7th past task stays overdue
    const completed = isPast && assigneeId !== null && pastCount % 7 !== 0;
    tasks.push({
      ...row,
      assigneeId,
      completedAt: completed ? new Date(row.dueAt.getTime() - 60 * 60 * 1000) : null,
      completedBy: completed ? assigneeId : null,
    });
  }
  return { series, tasks };
}

function buildNotifications(
  now: Date,
  userId: string,
  group: { id: string; name: string },
  tasks: SeedTask[],
): NewNotificationRow[] {
  const hoursAgo = (hours: number): Date => new Date(now.getTime() - hours * 60 * 60 * 1000);
  const nextTask = tasks.find((task) => task.assigneeId === userId && task.dueAt > now);
  const base = { userId, groupId: group.id };
  return [
    {
      ...base,
      type: 'groupCreated',
      data: { groupName: group.name },
      readAt: hoursAgo(24 * 13),
      createdAt: hoursAgo(24 * 14),
    },
    {
      ...base,
      type: 'memberJoined',
      data: { groupName: group.name, actorName: 'Oleh Bondar' },
      readAt: hoursAgo(24 * 12),
      createdAt: hoursAgo(24 * 13),
    },
    ...(nextTask
      ? [
          {
            ...base,
            type: 'taskAssigned' as const,
            taskId: nextTask.id,
            data: {
              groupName: group.name,
              taskTitle: nextTask.title,
              dueAt: nextTask.dueAt.toISOString(),
            },
            createdAt: hoursAgo(3),
          },
        ]
      : []),
  ];
}

/** Ids are generated here so rows can reference each other */
export function buildSeed(now: Date, passwordHash: string): SeedData {
  const ids = { anya: randomUUID(), bohdan: randomUUID(), marta: randomUUID(), oleh: randomUUID() };
  const users = PEOPLE.map((person) => ({
    id: ids[person.key],
    name: person.name,
    email: `${person.key}@errandly.dev`,
    emailVerifiedAt: dayAt(now, -30),
    timezone: 'Europe/Kyiv',
    locale: 'uk' as const,
  }));

  const room = {
    id: randomUUID(),
    name: 'Room 12',
    createdBy: ids.anya,
    createdAt: dayAt(now, -HISTORY_DAYS),
  };
  const flat = {
    id: randomUUID(),
    name: 'Podil Flat',
    createdBy: ids.marta,
    createdAt: dayAt(now, -HISTORY_DAYS),
  };

  const roomMembers = PEOPLE.map((person, index) => ({
    groupId: room.id,
    userId: ids[person.key],
    role: index === 0 ? ('admin' as const) : ('member' as const),
    color: memberColor(index),
  }));
  const flatMembers = [
    { groupId: flat.id, userId: ids.marta, role: 'admin' as const, color: memberColor(0) },
    { groupId: flat.id, userId: ids.anya, role: 'member' as const, color: memberColor(1) },
  ];

  const absenceRows = [
    {
      groupId: room.id,
      userId: ids.marta,
      startsOn: isoDate(dayAt(now, -1)),
      endsOn: isoDate(dayAt(now, 1)),
    },
    {
      groupId: room.id,
      userId: ids.oleh,
      startsOn: isoDate(dayAt(now, 3)),
      endsOn: isoDate(dayAt(now, 9)),
    },
  ];
  const absent =
    (groupId: string) =>
    (userId: string, day: string): boolean =>
      absenceRows.some(
        (a) => a.groupId === groupId && a.userId === userId && a.startsOn <= day && day <= a.endsOn,
      );

  const nameOf = (userId: string): string => users.find((user) => user.id === userId)?.name ?? '';
  const toMembers = (rows: { userId: string }[]): Member[] =>
    rows.map((row) => ({ userId: row.userId, name: nameOf(row.userId) }));

  const specs = seriesSpecs(ids.anya);
  const roomTasks = buildTasks(now, room.id, specs.room, toMembers(roomMembers), absent(room.id));
  const flatTasks = buildTasks(now, flat.id, specs.flat, toMembers(flatMembers), absent(flat.id));

  return {
    users,
    passwordCredentials: users.map((user) => ({ userId: user.id, passwordHash })),
    groups: [room, flat],
    memberships: [...roomMembers, ...flatMembers],
    absences: absenceRows,
    // An expired link for trying the "invite is no longer valid" page: /invite/expired-demo
    invites: [
      {
        groupId: room.id,
        invitedBy: ids.anya,
        tokenHash: createHash('sha256').update('expired-demo').digest('hex'),
        expiresAt: dayAt(now, -1),
      },
    ],
    taskSeries: [...roomTasks.series, ...flatTasks.series],
    tasks: [...roomTasks.tasks, ...flatTasks.tasks],
    notifications: buildNotifications(now, ids.anya, room, roomTasks.tasks),
  };
}
