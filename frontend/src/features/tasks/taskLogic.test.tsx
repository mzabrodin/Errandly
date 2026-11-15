import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
import i18n, { type TFunction } from 'i18next';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';

import { sessionKey } from '../../shared/api/auth';
import { ApiError } from '../../shared/api/client';
import type { Group, Task, User } from '../../shared/api/types';
import { ToastProvider } from '../../shared/ui/Toast';
import { stubApi } from '../../test/api';
import { useNextPath } from '../auth/useNextPath';
import { GroupContext } from '../groups/groupContext';
import { useCurrentGroup } from '../groups/useCurrentGroup';
import { useTaskActions } from './taskActionsContext';
import {
  initialState,
  isRecurrenceType,
  serverFieldError,
  toTaskInput,
  validateForm,
  type FormState,
} from './taskFormState';
import { useOnboardingVisible } from './useOnboardingVisible';
import { canToggleTask, useToggleTask } from './useToggleTask';

const t = ((key: string) => key) as unknown as TFunction;
const HOUR = 60 * 60 * 1000;

const TASK: Task = {
  id: 't1',
  seriesId: 's1',
  groupId: 'g1',
  title: 'Trash',
  description: 'Bins on Monday',
  dueAt: '2026-11-20T18:00:00.000Z',
  difficulty: 3,
  recurrence: { type: 'weekly', weekdays: [5, 1] },
  assigneeId: 'u2',
  manuallyAssigned: true,
  status: 'planned',
  completedAt: null,
};

function form(overrides: Partial<FormState> = {}): FormState {
  return { ...initialState(null), title: 'Trash', ...overrides };
}

describe('task form', () => {
  it('opens an existing task with its manual assignee, and an automatic one as empty', () => {
    expect(initialState(TASK)).toMatchObject({
      title: 'Trash',
      recurrenceType: 'weekly',
      weekdays: [5, 1],
      assigneeId: 'u2',
    });
    expect(initialState({ ...TASK, manuallyAssigned: false }).assigneeId).toBe('');
  });

  it('sends trimmed text, sorted weekdays and no assignee for automatic', () => {
    const input = toTaskInput(
      form({ title: '  Trash ', recurrenceType: 'weekly', weekdays: [5, 1], assigneeId: '' }),
    );

    expect(input).toMatchObject({
      title: 'Trash',
      recurrence: { type: 'weekly', weekdays: [1, 5] },
      assigneeId: null,
    });
    expect(toTaskInput(form({ recurrenceType: 'daily' })).recurrence).toEqual({ type: 'daily' });
  });

  it('checks the title, the due date only when changed, and the weekdays', () => {
    expect(validateForm(form(), true, t)).toEqual({});
    expect(validateForm(form({ title: ' ', dueAt: '' }), true, t)).toEqual({
      title: 'taskForm.errors.titleRequired',
      dueAt: 'taskForm.errors.dueRequired',
    });
    expect(validateForm(form({ title: 'x'.repeat(101) }), true, t).title).toBe(
      'taskForm.errors.titleTooLong',
    );
    const past = form({ dueAt: '2020-01-01T10:00' });
    expect(validateForm(past, true, t).dueAt).toBe('taskForm.errors.dueInPast');
    expect(validateForm(past, false, t).dueAt).toBeUndefined();
    expect(validateForm(form({ recurrenceType: 'weekly', weekdays: [] }), true, t).weekdays).toBe(
      'taskForm.errors.noWeekdays',
    );
  });

  it('shows a server field error next to its own field', () => {
    const error = new ApiError(400, {
      code: 'VALIDATION',
      fields: { dueAt: 'required', assigneeId: 'invalid', difficulty: 'range' },
    });

    expect(serverFieldError(error, 'dueAt', t)).toBe('taskForm.errors.dueRequired');
    expect(serverFieldError(error, 'assigneeId', t)).toBe('taskForm.errors.assigneeInvalid');
    expect(serverFieldError(error, 'difficulty', t)).toBe('taskForm.errors.invalid');
    expect(serverFieldError(error, 'title', t)).toBeUndefined();
    expect(serverFieldError(new Error('offline'), 'title', t)).toBeUndefined();
  });

  it('knows the recurrence types', () => {
    expect(isRecurrenceType('monthly')).toBe(true);
    expect(isRecurrenceType('yearly')).toBe(false);
  });
});

const done = (hoursAgo: number): Task => ({
  ...TASK,
  status: 'done',
  completedAt: new Date(Date.now() - hoursAgo * HOUR).toISOString(),
});

describe('canToggleTask (FR-24)', () => {
  it('lets only the assignee mark a task done', () => {
    expect(canToggleTask(TASK, { isMine: true, isAdmin: false })).toBe(true);
    expect(canToggleTask(TASK, { isMine: false, isAdmin: true })).toBe(false);
  });

  it('lets the assignee undo within 24 hours and an admin at any time', () => {
    expect(canToggleTask(done(23), { isMine: true, isAdmin: false })).toBe(true);
    expect(canToggleTask(done(25), { isMine: true, isAdmin: false })).toBe(false);
    expect(canToggleTask(done(25), { isMine: false, isAdmin: true })).toBe(true);
  });
});

const nextOf = (search: string) =>
  renderHook(useNextPath, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[`/login${search}`]}>{children}</MemoryRouter>
    ),
  }).result.current;

describe('useNextPath', () => {
  it('returns only to a path inside the app', () => {
    expect(nextOf('?next=/g/g1/tasks')).toBe('/g/g1/tasks');
    expect(nextOf('?next=//evil.example')).toBe('/app');
    expect(nextOf('?next=https://evil.example')).toBe('/app');
    expect(nextOf('')).toBe('/app');
  });
});

const ME = { id: 'u1', name: 'Anya' } as User;
const GROUP = {
  id: 'g1',
  name: 'Room 12',
  role: 'admin',
  members: [
    { userId: 'u1', name: 'Anya' },
    { userId: 'u2', name: 'Oleh' },
  ],
} as Group;

describe('useCurrentGroup', () => {
  it('derives the caller, their role and member lookups', () => {
    const client = new QueryClient();
    client.setQueryData(sessionKey, ME);
    const { result } = renderHook(useCurrentGroup, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>
          <GroupContext.Provider value={GROUP}>{children}</GroupContext.Provider>
        </QueryClientProvider>
      ),
    });

    expect(result.current).toMatchObject({ me: ME, isAdmin: true });
    expect(result.current.memberOf('u2')?.name).toBe('Oleh');
    expect(result.current.memberOf(null)).toBeUndefined();
    expect(result.current.memberOf('gone')).toBeUndefined();
  });

  it('is a programming error outside a group page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    expect(() => renderHook(useCurrentGroup, { wrapper })).toThrow('inside GroupLayout');
    expect(() => renderHook(useTaskActions)).toThrow('inside TaskActionsProvider');
  });
});

function renderToggle() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return renderHook(() => useToggleTask('g1'), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    ),
  }).result;
}

describe('useToggleTask', () => {
  it('marks a task done and offers a quick undo', async () => {
    const calls = stubApi(() => ({ body: TASK }));
    const result = renderToggle();

    act(() => result.current.toggle(TASK));
    const undo = await screen.findByRole('button', { name: i18n.t('common.undo'), hidden: true });
    fireEvent.click(undo);

    await waitFor(() =>
      expect(calls.map(({ method, path }) => `${method} ${path}`)).toEqual([
        'POST /api/tasks/t1/complete',
        'DELETE /api/tasks/t1/complete',
      ]),
    );
    expect(await screen.findByText(i18n.t('tasks.undoToast'))).toBeInTheDocument();
  });

  it('explains why an old completion can no longer be undone', async () => {
    stubApi(() => ({ status: 409, body: { code: 'UNDO_EXPIRED' } }));
    const result = renderToggle();

    act(() => result.current.toggle({ ...TASK, status: 'done', completedAt: TASK.dueAt }));

    expect(await screen.findByText(i18n.t('tasks.undoExpired'))).toBeInTheDocument();
  });
});

const NEW_GROUP = { id: 'g1', role: 'admin', members: [] } as unknown as Group;

describe('useOnboardingVisible', () => {
  afterEach(() => localStorage.clear());

  it('stays hidden per group once dismissed', () => {
    const client = new QueryClient();
    client.setQueryData(sessionKey, { id: 'u1' });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <GroupContext.Provider value={NEW_GROUP}>{children}</GroupContext.Provider>
      </QueryClientProvider>
    );
    const first = renderHook(() => useOnboardingVisible(0), { wrapper }).result;
    expect(first.current.visible).toBe(true);

    act(() => first.current.hide());

    expect(first.current.visible).toBe(false);
    expect(renderHook(() => useOnboardingVisible(0), { wrapper }).result.current.visible).toBe(
      false,
    );
  });
});
