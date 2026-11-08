import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api, unwrap } from './client';
import type { CalendarStatus, Settings, SettingsPatch } from './types';

const settingsKey = ['settings'] as const;

export function useSettings(): UseQueryResult<Settings> {
  return useQuery({
    queryKey: settingsKey,
    queryFn: () => unwrap(api.GET('/api/me/settings')),
  });
}

export function useUpdateSettings(): UseMutationResult<Settings, Error, SettingsPatch> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => unwrap(api.PATCH('/api/me/settings', { body: patch })),
    onSuccess: (settings) => queryClient.setQueryData(settingsKey, settings),
  });
}

export function useConnectCalendar(): UseMutationResult<{ url: string }, Error, void> {
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/me/calendar/connect')),
    onSuccess: ({ url }) => window.location.assign(url),
  });
}

/** Calendar endpoints answer with the calendar status only; the rest of the settings stays */
function useCalendarMutation(
  request: () => Promise<CalendarStatus>,
): UseMutationResult<CalendarStatus, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (calendar) =>
      queryClient.setQueryData<Settings>(settingsKey, (current) =>
        current ? { ...current, calendar } : current,
      ),
  });
}

export function useDisconnectCalendar(): UseMutationResult<CalendarStatus, Error, void> {
  return useCalendarMutation(() => unwrap(api.DELETE('/api/me/calendar')));
}

/** Syncs now and resumes a paused sync (FR-35) */
export function useSyncCalendar(): UseMutationResult<CalendarStatus, Error, void> {
  return useCalendarMutation(() => unwrap(api.POST('/api/me/calendar/sync')));
}
