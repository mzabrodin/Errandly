import { waitFor } from '@testing-library/react';

import { renderApiHook, stubApi } from '../../test/api';
import { deviceTimeZone } from '../lib/dates';
import { sessionKey, useLogin, useLogout, useRegister, useSession } from './auth';
import { useMarkNotificationsRead } from './notifications';
import { useDeleteAccount, useUpdateProfile, useUploadAvatar } from './profile';
import { useSyncCalendar, useUpdateSettings } from './settings';
import { useStats } from './stats';
import { useTasks } from './tasks';
import type { NotificationList, Settings, User } from './types';

const USER = {
  id: 'u1',
  name: 'Anya',
  email: 'anya@errandly.dev',
  emailVerified: true,
} as User;

const SETTINGS = {
  calendar: { connected: true, syncStatus: 'paused' },
  calendarReminderMinutes: 60,
} as Settings;

describe('session', () => {
  it('is the signed-in user, or null after a 401', async () => {
    stubApi(() => ({ body: USER }));
    const signedIn = renderApiHook(useSession);
    await waitFor(() => expect(signedIn.result.current.data).toEqual(USER));

    stubApi(() => ({ status: 401, body: { code: 'UNAUTHENTICATED' } }));
    const signedOut = renderApiHook(useSession);
    await waitFor(() => expect(signedOut.result.current.data).toBeNull());
  });

  it('fails on anything else, so the page shows an error instead of the sign-in form', async () => {
    stubApi(() => ({ status: 503, body: { code: 'SERVICE_UNAVAILABLE' } }));
    const { result } = renderApiHook(useSession);

    await waitFor(() => expect(result.current.error).toMatchObject({ status: 503 }));
  });

  it('starts after sign-in and registration, with the device language and time zone', async () => {
    const calls = stubApi(() => ({ body: USER }));
    const login = renderApiHook(useLogin);
    await login.result.current.mutateAsync({ email: USER.email, password: 'Pass1234' });
    const register = renderApiHook(useRegister);
    await register.result.current.mutateAsync({ name: 'Anya', email: USER.email, password: 'x' });

    expect(login.queryClient.getQueryData(sessionKey)).toEqual(USER);
    expect(register.queryClient.getQueryData(sessionKey)).toEqual(USER);
    expect(calls[1]?.body).toMatchObject({ locale: 'uk', timezone: deviceTimeZone() });
  });

  it('forgets everything cached on sign-out and on account deletion', async () => {
    stubApi(() => ({ status: 204 }));
    for (const useEnd of [useLogout, useDeleteAccount]) {
      const { result, queryClient } = renderApiHook(useEnd);
      queryClient.setQueryData(['groups'], [{ id: 'g1' }]);
      // oxlint-disable-next-line no-await-in-loop -- one hook after the other
      await result.current.mutateAsync();

      expect(queryClient.getQueryData(['groups'])).toBeUndefined();
      expect(queryClient.getQueryData(sessionKey)).toBeNull();
    }
  });
});

describe('profile', () => {
  it('updates the session and refreshes the groups that show the name and photo', async () => {
    stubApi(() => ({ body: { ...USER, name: 'Anna' } }));
    const { result, queryClient, invalidated } = renderApiHook(useUpdateProfile);

    await result.current.mutateAsync({ name: 'Anna' });

    expect(queryClient.getQueryData(sessionKey)).toMatchObject({ name: 'Anna' });
    expect(invalidated()).toEqual([['groups']]);
  });

  it('uploads the avatar as multipart form data', async () => {
    const calls = stubApi(() => ({ body: { ...USER, avatarUrl: '/api/avatars/a.webp' } }));
    const { result, queryClient } = renderApiHook(useUploadAvatar);

    await result.current.mutateAsync(new Blob(['image'], { type: 'image/webp' }));

    expect(calls.map(({ method, path }) => `${method} ${path}`)).toEqual(['POST /api/me/avatar']);
    expect(calls[0]?.body).toEqual(['file']);
    expect(queryClient.getQueryData(sessionKey)).toMatchObject({
      avatarUrl: '/api/avatars/a.webp',
    });
  });
});

describe('settings', () => {
  it('replaces the settings with what the server saved', async () => {
    stubApi(() => ({ body: { ...SETTINGS, calendarReminderMinutes: 30 } }));
    const { result, queryClient } = renderApiHook(useUpdateSettings);

    await result.current.mutateAsync({ calendarReminderMinutes: 30 });

    expect(queryClient.getQueryData(['settings'])).toMatchObject({ calendarReminderMinutes: 30 });
  });

  it('puts the calendar status from a sync into the cached settings', async () => {
    stubApi(() => ({ body: { connected: true, syncStatus: 'ok' } }));
    const { result, queryClient } = renderApiHook(useSyncCalendar);
    queryClient.setQueryData(['settings'], SETTINGS);

    await result.current.mutateAsync();

    expect(queryClient.getQueryData(['settings'])).toEqual({
      ...SETTINGS,
      calendar: { connected: true, syncStatus: 'ok' },
    });
  });
});

describe('notifications', () => {
  it('marks as read at once, then refreshes from the server', async () => {
    stubApi(() => ({ status: 204 }));
    const { result, queryClient, invalidated } = renderApiHook(useMarkNotificationsRead);
    const list = {
      items: [
        { id: 'n1', read: false },
        { id: 'n2', read: false },
      ],
      unread: 2,
    } as NotificationList;
    queryClient.setQueryData(['notifications'], list);

    await result.current.mutateAsync(['n1']);

    expect(queryClient.getQueryData(['notifications'])).toMatchObject({
      items: [
        { id: 'n1', read: true },
        { id: 'n2', read: false },
      ],
      unread: 1,
    });
    await waitFor(() => expect(invalidated()).toEqual([['notifications']]));
  });
});

describe('queries', () => {
  it('ask for the range and the period they are given', async () => {
    const calls = stubApi(() => ({ body: [] }));
    const from = '2026-11-01T00:00:00.000Z';
    const to = '2026-12-01T00:00:00.000Z';

    const tasks = renderApiHook(() => useTasks('g1', from, to));
    const stats = renderApiHook(() => useStats('g1', 'month'));
    await waitFor(() => expect(tasks.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(stats.result.current.isSuccess).toBe(true));

    expect(calls.map(({ path, search }) => decodeURIComponent(`${path}${search}`))).toEqual([
      `/api/groups/g1/tasks?from=${from}&to=${to}`,
      '/api/groups/g1/stats?period=month',
    ]);
  });
});
