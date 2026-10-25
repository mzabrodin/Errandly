import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { http } from './client';
import type { Settings } from './types';

const settingsKey = ['settings'] as const;

export function useSettings(): UseQueryResult<Settings> {
  return useQuery({
    queryKey: settingsKey,
    queryFn: () => http.get<Settings>('/me/settings'),
  });
}

export function useUpdateSettings(): UseMutationResult<
  Settings,
  Error,
  Partial<Pick<Settings, 'reminderMinutes' | 'notifications'>>
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Pick<Settings, 'reminderMinutes' | 'notifications'>>) =>
      http.patch<Settings>('/me/settings', patch),
    onSuccess: (settings) => queryClient.setQueryData(settingsKey, settings),
  });
}

export function useConnectCalendar(): UseMutationResult<{ url: string }, Error, void> {
  return useMutation({
    mutationFn: () => http.post<{ url: string }>('/me/calendar/connect'),
    onSuccess: ({ url }) => window.location.assign(url),
  });
}

export function useDisconnectCalendar(): UseMutationResult<Settings, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => http.delete<Settings>('/me/calendar'),
    onSuccess: (settings) => queryClient.setQueryData(settingsKey, settings),
  });
}
