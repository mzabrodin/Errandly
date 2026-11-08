import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  formatDistanceToNow,
  isSameDay,
  isToday,
  isTomorrow,
  isYesterday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { enUS, uk, type Locale as DateLocale } from 'date-fns/locale';

import { currentLocale } from '../i18n';

// Due dates are stored in UTC and shown in the browser's time zone (NFR-COMP-03)

// Weeks start on Monday in both languages
export const weekOptions = { weekStartsOn: 1 as const };

/** date-fns locale for the current UI language */
export function dateLocale(): DateLocale {
  return currentLocale() === 'en' ? enUS : uk;
}

export function formatTime(iso: string): string {
  return format(new Date(iso), 'HH:mm');
}

export function formatDayLabel(date: Date): 'today' | 'tomorrow' | 'yesterday' | null {
  if (isToday(date)) return 'today';
  if (isTomorrow(date)) return 'tomorrow';
  if (isYesterday(date)) return 'yesterday';
  return null;
}

export function formatDate(date: Date, pattern = 'd MMMM, EEEEEE'): string {
  return format(date, pattern, { locale: dateLocale() });
}

export function formatShortDate(iso: string): string {
  return format(new Date(iso), 'd MMM', { locale: dateLocale() });
}

/** "in 3 hours" / "5 minutes ago" in the current UI language */
export function formatRelative(iso: string): string {
  return formatDistanceToNow(new Date(iso), { locale: dateLocale(), addSuffix: true });
}

export function weekRange(anchor: Date): { from: Date; to: Date } {
  const from = startOfDay(startOfWeek(anchor, weekOptions));
  return { from, to: addDays(from, 7) };
}

export function monthGridRange(anchor: Date): { from: Date; to: Date } {
  const from = startOfWeek(startOfMonth(anchor), weekOptions);
  const to = addDays(endOfWeek(endOfMonth(anchor), weekOptions), 1);
  return { from: startOfDay(from), to: startOfDay(to) };
}

export function daysBetween(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  for (let day = from; day < to; day = addDays(day, 1)) days.push(day);
  return days;
}

/** Groups items by calendar day, preserving order */
export function groupByDay<T>(items: T[], getDate: (item: T) => Date): { day: Date; items: T[] }[] {
  const groups: { day: Date; items: T[] }[] = [];
  for (const item of items) {
    const date = getDate(item);
    const last = groups.at(-1);
    if (last && isSameDay(last.day, date)) last.items.push(item);
    else groups.push({ day: startOfDay(date), items: [item] });
  }
  return groups;
}

/** Value for <input type="datetime-local"> in local time */
export function toLocalInputValue(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

export function toDateInputValue(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}
