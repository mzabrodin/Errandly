import { TZDate } from '@date-fns/tz';
import { addDays, addMonths, format, getISODay } from 'date-fns';

import {
  HORIZON_DAYS,
  LOAD_WINDOW_DAYS,
  type SwapStatus,
  type TaskStatus,
} from '../common/domain.js';
import { defineTransitions } from '../common/state-machine.js';
import { DAY_MS } from '../common/time.js';
import type { RecurrenceDto } from './dto/recurrence.dto.js';

export const HORIZON_MS = HORIZON_DAYS * DAY_MS;
const UNDO_WINDOW_MS = DAY_MS;
export const LOAD_WINDOW_MS = LOAD_WINDOW_DAYS * DAY_MS;
const MAX_OCCURRENCES = 400;

export interface OccurrenceWindow {
  after?: Date;
  until: Date;
}

/** Steps on the series' local clock (DST-safe); monthly dates clamp to the month's end */
export function occurrences(
  recurrence: RecurrenceDto,
  first: Date,
  timeZone: string,
  { after, until }: OccurrenceWindow,
): Date[] {
  const inWindow = (date: Date): boolean =>
    date.getTime() <= until.getTime() && (after === undefined || date.getTime() > after.getTime());
  if (recurrence.type === 'once') return inWindow(first) ? [first] : [];

  const start = new TZDate(first, timeZone);
  const result: Date[] = [];
  for (let step = 0; result.length < MAX_OCCURRENCES; step += 1) {
    const candidate = recurrence.type === 'monthly' ? addMonths(start, step) : addDays(start, step);
    if (candidate.getTime() > until.getTime()) break;
    const matches =
      recurrence.type !== 'weekly' || recurrence.weekdays.includes(getISODay(candidate));
    if (matches && inWindow(candidate)) result.push(new Date(candidate.getTime()));
  }
  return result;
}

export function localDay(at: Date, timeZone: string): string {
  return format(new TZDate(at, timeZone), 'yyyy-MM-dd');
}

/** FR-17: absences are whole local days, inclusive */
export function isAbsentOn(
  absences: readonly { from: string; to: string }[],
  at: Date,
  timeZone: string,
): boolean {
  const day = localDay(at, timeZone);
  return absences.some(({ from, to }) => from <= day && day <= to);
}

export interface SwapTask {
  assigneeId: string | null;
  completedAt: Date | null;
  dueAt: Date;
  series: { timezone: string };
}

export interface SwapParties {
  proposerId: string;
  recipientId: string;
  proposerAbsences: readonly { from: string; to: string }[];
  recipientAbsences: readonly { from: string; to: string }[];
}

/** FR-26: a pending swap is accepted, declined or cancelled once; the decision is final */
export const SWAP_TRANSITIONS = defineTransitions<SwapStatus>({
  pending: ['accepted', 'declined', 'cancelled'],
  accepted: [],
  declined: [],
  cancelled: [],
});

export function swapProblem(
  parties: SwapParties,
  offered: SwapTask,
  requested: SwapTask,
  now: Date,
): 'SWAP_STALE' | 'MEMBER_ABSENT' | null {
  const open = (task: SwapTask): boolean =>
    task.completedAt === null && task.dueAt.getTime() > now.getTime();
  if (
    offered.assigneeId !== parties.proposerId ||
    requested.assigneeId !== parties.recipientId ||
    !open(offered) ||
    !open(requested)
  ) {
    return 'SWAP_STALE';
  }
  const recipientAway = isAbsentOn(
    parties.recipientAbsences,
    offered.dueAt,
    offered.series.timezone,
  );
  const proposerAway = isAbsentOn(
    parties.proposerAbsences,
    requested.dueAt,
    requested.series.timezone,
  );
  return recipientAway || proposerAway ? 'MEMBER_ABSENT' : null;
}

export function taskStatus(
  task: { completedAt: Date | null; dueAt: Date; assigneeId: string | null },
  now: Date,
): TaskStatus {
  if (task.completedAt !== null) return 'done';
  if (task.dueAt.getTime() < now.getTime()) return 'overdue';
  if (task.assigneeId === null) return 'unassigned';
  return 'planned';
}

export function canUndo(completedAt: Date, now: Date): boolean {
  return now.getTime() - completedAt.getTime() <= UNDO_WINDOW_MS;
}

export function toRecurrence(series: {
  recurrenceType: RecurrenceDto['type'];
  weekdays: number[];
}): RecurrenceDto {
  return series.recurrenceType === 'weekly'
    ? { type: 'weekly', weekdays: series.weekdays.toSorted((a, b) => a - b) }
    : { type: series.recurrenceType };
}
