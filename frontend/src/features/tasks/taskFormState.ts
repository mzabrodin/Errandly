import type { TFunction } from 'i18next';

import { ApiError } from '../../shared/api/client';
import type { Recurrence, Task, TaskInput } from '../../shared/api/types';
import {
  addDays,
  addHours,
  atTime,
  fromLocalInputValue,
  isoWeekday,
  now,
  startOfHour,
  toIso,
  toLocalInputValue,
} from '../../shared/lib/dates';

export type RecurrenceType = Recurrence['type'];

export const RECURRENCE_TYPES: readonly RecurrenceType[] = ['once', 'daily', 'weekly', 'monthly'];

export function isRecurrenceType(value: string): value is RecurrenceType {
  return RECURRENCE_TYPES.some((type) => type === value);
}

export interface FormState {
  title: string;
  description: string;
  dueAt: string;
  difficulty: number;
  recurrenceType: RecurrenceType;
  weekdays: number[];
  assigneeId: string;
}

export type SetField = <K extends keyof FormState>(key: K, value: FormState[K]) => void;

export type Errors = Partial<Record<'title' | 'dueAt' | 'weekdays', string>>;

export function initialState(task: Task | null, defaultDay?: Date): FormState {
  if (task) {
    return {
      title: task.title,
      description: task.description,
      dueAt: toLocalInputValue(task.dueAt),
      difficulty: task.difficulty,
      recurrenceType: task.recurrence.type,
      weekdays:
        task.recurrence.type === 'weekly' ? task.recurrence.weekdays : [isoWeekday(task.dueAt)],
      assigneeId: task.manuallyAssigned && task.assigneeId !== null ? task.assigneeId : '',
    };
  }
  // Day from the calendar or tomorrow; time 19:00 (or the next hour if it is already late today)
  let tomorrowEvening = atTime(defaultDay ?? addDays(now(), 1), 19, 0);
  if (tomorrowEvening.getTime() < Date.now()) {
    tomorrowEvening = startOfHour(addHours(now(), 2));
  }
  return {
    title: '',
    description: '',
    dueAt: toLocalInputValue(tomorrowEvening),
    difficulty: 2,
    recurrenceType: 'once',
    weekdays: [isoWeekday(tomorrowEvening)],
    assigneeId: '',
  };
}

/** Until weekdays are picked by hand, they follow the due date */
export function withDueAt(state: FormState, dueAt: string, weekdaysTouched: boolean): FormState {
  const weekdays =
    weekdaysTouched || dueAt === '' ? state.weekdays : [isoWeekday(fromLocalInputValue(dueAt))];
  return { ...state, dueAt, weekdays };
}

function toRecurrence(state: FormState): Recurrence {
  if (state.recurrenceType === 'weekly') {
    return { type: 'weekly', weekdays: state.weekdays.toSorted((a, b) => a - b) };
  }
  return { type: state.recurrenceType };
}

export function toTaskInput(state: FormState): TaskInput {
  return {
    title: state.title.trim(),
    description: state.description.trim(),
    dueAt: toIso(fromLocalInputValue(state.dueAt)),
    difficulty: state.difficulty,
    recurrence: toRecurrence(state),
    assigneeId: state.assigneeId === '' ? null : state.assigneeId,
  };
}

/** Form validation; dueChanged tells whether the due date was changed (only a new one cannot be in the past) */
export function validateForm(state: FormState, dueChanged: boolean, t: TFunction): Errors {
  const next: Errors = {};
  const title = state.title.trim();
  if (title === '') next.title = t('taskForm.errors.titleRequired');
  else if (title.length > 100) next.title = t('taskForm.errors.titleTooLong');
  if (state.dueAt === '') next.dueAt = t('taskForm.errors.dueRequired');
  else if (dueChanged && fromLocalInputValue(state.dueAt).getTime() < Date.now()) {
    next.dueAt = t('taskForm.errors.dueInPast');
  }
  if (state.recurrenceType === 'weekly' && state.weekdays.length === 0) {
    next.weekdays = t('taskForm.errors.noWeekdays');
  }
  return next;
}

/** Error for a specific field from the server response */
export function serverFieldError(error: unknown, field: string, t: TFunction): string | undefined {
  const code = error instanceof ApiError ? error.details.fields?.[field] : undefined;
  if (code === 'inPast') return t('taskForm.errors.dueInPast');
  if (code === 'required') return t('taskForm.errors.titleRequired');
  if (code === 'tooLong') return t('taskForm.errors.titleTooLong');
  return undefined;
}
