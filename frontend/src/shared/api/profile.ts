import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { sessionKey } from './auth';
import { http } from './client';
import type { Settings, User } from './types';

type ProfilePatch = Partial<Pick<User, 'name' | 'timezone' | 'locale'>>;

export function useUpdateProfile(): UseMutationResult<User, Error, ProfilePatch> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfilePatch) => http.patch<User>('/me', patch),
    onSuccess: (user) => {
      queryClient.setQueryData(sessionKey, user);
      // The name is shown in group member lists
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

export function useChangePassword(): UseMutationResult<
  void,
  Error,
  { currentPassword: string; newPassword: string }
> {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      http.post<void>('/me/password', input),
  });
}

export function useDeleteAccount(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => http.delete<void>('/me'),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(sessionKey, null);
    },
  });
}

export function useSyncCalendar(): UseMutationResult<Settings, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => http.post<Settings>('/me/calendar/sync'),
    onSuccess: (settings) => queryClient.setQueryData(['settings'], settings),
  });
}

function useAvatarMutation<TInput>(
  request: (input: TInput) => Promise<User>,
): UseMutationResult<User, Error, TInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (user) => {
      queryClient.setQueryData(sessionKey, user);
      // The avatar is shown to group members
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

export function useUploadAvatar(): UseMutationResult<User, Error, Blob> {
  return useAvatarMutation((image: Blob) => {
    const form = new FormData();
    form.append('file', image, 'avatar');
    return http.upload<User>('/me/avatar', form);
  });
}

export function useRemoveAvatar(): UseMutationResult<User, Error, void> {
  return useAvatarMutation(() => http.delete<User>('/me/avatar'));
}
