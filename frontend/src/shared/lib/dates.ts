import { tz, TZDate } from '@date-fns/tz';
import {
  addDays as addDaysFns,
  addHours as addHoursFns,
  addMonths as addMonthsFns,
  addWeeks as addWeeksFns,
  endOfMonth,
  endOfWeek as endOfWeekFns,
  format,
  formatDistanceToNow,
  getISODay,
  isSameDay as isSameDayFns,
  isSameMonth as isSameMonthFns,
  isToday as isTodayFns,
  isTomorrow,
  isYesterday,
  set,
  startOfDay as startOfDayFns,
  startOfHour as startOfHourFns,
  startOfMonth,
  startOfWeek as startOfWeekFns,
} from 'date-fns';
import { enUS, uk, type Locale as DateLocale } from 'date-fns/locale';
import { useSyncExternalStore } from 'react';

import { currentLocale } from '../i18n';

// Times are stored in UTC and shown in the profile time zone (NFR-COMP-03). Features use these
// helpers instead of date-fns, so days, weeks and "today" follow that zone, not the browser's.

type DateInput = Date | string | number;

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

let displayZone = deviceTimeZone();
const listeners = new Set<() => void>();

export function displayTimeZone(): string {
  return displayZone;
}

export function setDisplayTimeZone(zone: string): void {
  if (zone === displayZone) return;
  displayZone = zone;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-renders the caller when the display zone changes */
export function useDisplayTimeZone(): string {
  return useSyncExternalStore(subscribe, displayTimeZone);
}

function context(): { in: ReturnType<typeof tz> } {
  return { in: tz(displayZone) };
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The moment on the profile's clock; a date-only string ("2026-10-01") is that day's midnight */
export function zoned(value: DateInput): TZDate {
  if (typeof value === 'string') {
    const day = DATE_ONLY.exec(value);
    if (day !== null) {
      return new TZDate(Number(day[1]), Number(day[2]) - 1, Number(day[3]), displayZone);
    }
  }
  return new TZDate(
    value instanceof Date ? value.getTime() : new Date(value).getTime(),
    displayZone,
  );
}

export function now(): TZDate {
  return zoned(Date.now());
}

/** UTC ISO string for the API (a TZDate's own toISOString carries its offset) */
export function toIso(date: Date): string {
  return new Date(date.getTime()).toISOString();
}

// Weeks start on Monday in both languages
export const weekOptions = { weekStartsOn: 1 as const };

export function startOfDay(date: DateInput): TZDate {
  return startOfDayFns(zoned(date), context());
}

export function startOfHour(date: DateInput): TZDate {
  return startOfHourFns(zoned(date), context());
}

export function startOfWeek(date: DateInput): TZDate {
  return startOfWeekFns(zoned(date), { ...weekOptions, ...context() });
}

export function endOfWeek(date: DateInput): TZDate {
  return endOfWeekFns(zoned(date), { ...weekOptions, ...context() });
}

/** Calendar days, so a DST change keeps the wall-clock time */
export function addDays(date: DateInput, amount: number): TZDate {
  return addDaysFns(zoned(date), amount, context());
}

export function addWeeks(date: DateInput, amount: number): TZDate {
  return addWeeksFns(zoned(date), amount, context());
}

export function addMonths(date: DateInput, amount: number): TZDate {
  return addMonthsFns(zoned(date), amount, context());
}

export function addHours(date: DateInput, amount: number): TZDate {
  return addHoursFns(zoned(date), amount, context());
}

/** The same day at hours:minutes:00 */
export function atTime(date: DateInput, hours: number, minutes: number): TZDate {
  return set(zoned(date), { hours, minutes, seconds: 0, milliseconds: 0 }, context());
}

export function isSameDay(left: DateInput, right: DateInput): boolean {
  return isSameDayFns(zoned(left), zoned(right), context());
}

export function isSameMonth(left: DateInput, right: DateInput): boolean {
  return isSameMonthFns(zoned(left), zoned(right), context());
}

export function isToday(date: DateInput): boolean {
  return isTodayFns(zoned(date), context());
}

/** 1 = Monday … 7 = Sunday */
export function isoWeekday(date: DateInput): number {
  return getISODay(zoned(date), context());
}

/** date-fns locale for the current UI language */
export function dateLocale(): DateLocale {
  return currentLocale() === 'en' ? enUS : uk;
}

export function formatTime(value: DateInput): string {
  return format(zoned(value), 'HH:mm');
}

export function formatDayLabel(date: DateInput): 'today' | 'tomorrow' | 'yesterday' | null {
  const day = zoned(date);
  if (isTodayFns(day, context())) return 'today';
  if (isTomorrow(day, context())) return 'tomorrow';
  if (isYesterday(day, context())) return 'yesterday';
  return null;
}

export function formatDate(date: DateInput, pattern = 'd MMMM, EEEEEE'): string {
  return format(zoned(date), pattern, { locale: dateLocale() });
}

export function formatShortDate(value: DateInput): string {
  return format(zoned(value), 'd MMM', { locale: dateLocale() });
}

/** "in 3 hours" / "5 minutes ago" in the current UI language */
export function formatRelative(value: DateInput): string {
  return formatDistanceToNow(new Date(value), { locale: dateLocale(), addSuffix: true });
}

export function weekRange(anchor: DateInput): { from: TZDate; to: TZDate } {
  const from = startOfWeek(anchor);
  return { from, to: addDays(from, 7) };
}

export function monthGridRange(anchor: DateInput): { from: TZDate; to: TZDate } {
  const month = zoned(anchor);
  const from = startOfWeek(startOfMonth(month, context()));
  const to = addDays(endOfWeek(endOfMonth(month, context())), 1);
  return { from: startOfDay(from), to: startOfDay(to) };
}

export function daysBetween(from: Date, to: Date): TZDate[] {
  const days: TZDate[] = [];
  for (let day = zoned(from); day < to; day = addDays(day, 1)) days.push(day);
  return days;
}

/** Groups items by calendar day, preserving order */
export function groupByDay<T>(
  items: T[],
  getDate: (item: T) => DateInput,
): { day: TZDate; items: T[] }[] {
  const groups: { day: TZDate; items: T[] }[] = [];
  for (const item of items) {
    const date = getDate(item);
    const last = groups.at(-1);
    if (last && isSameDay(last.day, date)) last.items.push(item);
    else groups.push({ day: startOfDay(date), items: [item] });
  }
  return groups;
}

/** Value for <input type="datetime-local"> on the profile's clock */
export function toLocalInputValue(date: DateInput): string {
  return format(zoned(date), "yyyy-MM-dd'T'HH:mm");
}

export function toDateInputValue(date: DateInput): string {
  return format(zoned(date), 'yyyy-MM-dd');
}

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Reads a datetime-local value as a time in the profile zone; Invalid Date if malformed */
export function fromLocalInputValue(value: string): TZDate {
  const match = LOCAL_INPUT.exec(value);
  if (match === null) return new TZDate(Number.NaN, displayZone);
  const [year, month, day, hours, minutes] = match.slice(1).map(Number);
  return new TZDate(
    year ?? Number.NaN,
    (month ?? Number.NaN) - 1,
    day ?? Number.NaN,
    hours ?? Number.NaN,
    minutes ?? Number.NaN,
    displayZone,
  );
}
