import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  isTomorrow,
  isYesterday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { uk } from 'date-fns/locale';

// Терміни зберігаються в UTC, показуються в часовому поясі браузера (NFR-COMP-03)

export const weekOptions = { weekStartsOn: 1 as const, locale: uk };

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
  return format(date, pattern, { locale: uk });
}

export function formatShortDate(iso: string): string {
  return format(new Date(iso), 'd MMM', { locale: uk });
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

/** Групує елементи за календарним днем, зберігаючи порядок */
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

/** Значення для <input type="datetime-local"> у локальному часі */
export function toLocalInputValue(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

export function toDateInputValue(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}
