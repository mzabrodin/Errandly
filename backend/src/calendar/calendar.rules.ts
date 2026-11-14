import { appLink } from '../config/urls.js';
import type { TaskView } from '../tasks/index.js';
import type { CalendarEvent } from './gateways/calendar-gateway.js';

export const CALENDAR_NAME = 'Errandly';

/** SYS-21 */
export const FAILURES_BEFORE_PAUSE = 5;

export const EVENT_MINUTES = 30;

/** Stable per task, so a retried sync updates the same event (SYS-20) */
export function eventIdFor(taskId: string): string {
  return taskId.replaceAll('-', '').toLowerCase();
}

export function toCalendarEvent(
  task: TaskView,
  options: { timeZone: string; reminderMinutes: number; appUrl: string },
): CalendarEvent {
  const done = task.completedAt !== null;
  const url = appLink(options.appUrl, '/g', task.groupId, 'tasks', task.id);
  const description = task.description.trim();
  return {
    title: done ? `✓ ${task.title}` : task.title,
    description: description === '' ? url : `${description}\n\n${url}`,
    start: task.dueAt,
    end: new Date(task.dueAt.getTime() + EVENT_MINUTES * 60_000),
    timeZone: options.timeZone,
    reminderMinutes: done ? null : options.reminderMinutes,
    url,
  };
}

export interface LinkedEvent {
  connectionId: string;
  externalEventId: string;
}

export interface SyncPlan<L extends LinkedEvent> {
  remove: L[];
  upsertOn: string | null;
}

/** FR-34: only the assignee's calendar shows the task; a paused one waits for its resync */
export function planSync<L extends LinkedEvent>(
  links: readonly L[],
  target: { id: string; paused: boolean } | null,
): SyncPlan<L> {
  return {
    remove: links.filter((link) => link.connectionId !== target?.id),
    upsertOn: target === null || target.paused ? null : target.id,
  };
}
