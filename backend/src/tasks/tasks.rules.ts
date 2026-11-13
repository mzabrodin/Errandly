import { TZDate } from '@date-fns/tz';
import { addDays, addMonths, format, getISODay } from 'date-fns';

import { HORIZON_DAYS, type TaskStatus } from '../common/domain.js';
import type { RecurrenceDto } from './dto/recurrence.dto.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const HORIZON_MS = HORIZON_DAYS * DAY_MS;
export const UNDO_WINDOW_MS = DAY_MS;
export const LOAD_WINDOW_MS = 28 * DAY_MS;
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
