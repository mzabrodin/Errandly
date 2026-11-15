import { TZDate } from '@date-fns/tz';
import { addDays, format, getISODay, startOfDay } from 'date-fns';

import {
  DEFAULT_EMAIL_REMINDER_MINUTES,
  REMINDER_MINUTES,
  type NotificationType,
} from '../common/domain.js';
import type { DomainEventMap } from '../common/events/domain-events.js';
import { addMs, DAY_MS, MINUTE_MS } from '../common/time.js';
import type { TaskView } from '../tasks/index.js';

export interface Recipient {
  userId: string;
  type: NotificationType;
}

const DIGEST_HOUR = 9;
const DIGEST_DAYS = 7;

export interface PurgeCutoffs {
  readBefore: Date;
  before: Date;
  remindersBefore: Date;
  digestsBefore: string;
}

export function purgeCutoffs(now: Date): PurgeCutoffs {
  return {
    readBefore: addMs(now, -30 * DAY_MS),
    before: addMs(now, -90 * DAY_MS),
    remindersBefore: addMs(now, -7 * DAY_MS),
    digestsBefore: addMs(now, -28 * DAY_MS)
      .toISOString()
      .slice(0, 10),
  };
}

export function assignmentRecipients(
  event: DomainEventMap['task.assigned'],
  admins: readonly string[],
): Recipient[] {
  const { assigneeId, previousAssigneeId, actorId, bulk } = event;
  if (assigneeId === null) {
    return admins
      .filter((userId) => userId !== actorId)
      .map((userId) => ({ userId, type: 'taskNoAssignee' }));
  }
  if (bulk) return [];
  const recipients: Recipient[] = [];
  if (assigneeId !== actorId) recipients.push({ userId: assigneeId, type: 'taskAssigned' });
  if (
    previousAssigneeId !== null &&
    previousAssigneeId !== assigneeId &&
    previousAssigneeId !== actorId
  ) {
    recipients.push({ userId: previousAssigneeId, type: 'taskUnassigned' });
  }
  return recipients;
}

export function isDueSoon(dueAt: Date, reminderMinutes: number, now: Date): boolean {
  const left = dueAt.getTime() - now.getTime();
  return left > 0 && left <= reminderMinutes * MINUTE_MS;
}

export function reminderMinutesOption(minutes: number): (typeof REMINDER_MINUTES)[number] {
  return (
    REMINDER_MINUTES.find((option) => option === minutes) ??
    REMINDER_MINUTES.find((option) => option === DEFAULT_EMAIL_REMINDER_MINUTES) ??
    REMINDER_MINUTES[0]
  );
}

export interface DigestWeek {
  /** The local Monday, yyyy-mm-dd */
  weekStart: string;
  lastWeekFrom: Date;
  lastWeekTo: Date;
  until: Date;
}

/** Monday from 09:00 local; null at any other time */
export function digestWeek(now: Date, timeZone: string): DigestWeek | null {
  const local = new TZDate(now, timeZone);
  if (getISODay(local) !== 1 || local.getHours() < DIGEST_HOUR) return null;
  const monday = startOfDay(local);
  return {
    weekStart: format(monday, 'yyyy-MM-dd'),
    lastWeekFrom: new Date(addDays(monday, -DIGEST_DAYS).getTime()),
    lastWeekTo: new Date(monday.getTime()),
    until: addMs(now, DIGEST_DAYS * DAY_MS),
  };
}

export interface GroupWeek {
  groupId: string;
  done: number;
  overdue: number;
  upcoming: TaskView[];
}

export function summarizeWeek(
  tasks: readonly TaskView[],
  week: Omit<DigestWeek, 'weekStart'>,
  now: Date,
): GroupWeek[] {
  const byGroup = new Map<string, GroupWeek>();
  const groupOf = (groupId: string): GroupWeek => {
    const existing = byGroup.get(groupId);
    if (existing) return existing;
    const created: GroupWeek = { groupId, done: 0, overdue: 0, upcoming: [] };
    byGroup.set(groupId, created);
    return created;
  };
  for (const task of tasks) {
    const due = task.dueAt.getTime();
    if (due >= week.lastWeekFrom.getTime() && due < week.lastWeekTo.getTime()) {
      if (task.completedAt !== null) groupOf(task.groupId).done += 1;
      else if (due < now.getTime()) groupOf(task.groupId).overdue += 1;
    }
    if (task.completedAt === null && due >= now.getTime() && due < week.until.getTime()) {
      groupOf(task.groupId).upcoming.push(task);
    }
  }
  return [...byGroup.values()];
}
