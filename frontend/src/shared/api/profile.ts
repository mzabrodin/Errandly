import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { sessionKey } from './auth';
import { api, http, unwrap } from './client';
import type { ProfilePatch, User } from './types';

export function useUpdateProfile(): UseMutationResult<User, Error, ProfilePatch> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfilePatch) => unwrap(api.PATCH('/api/me', { body: patch })),
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
      unwrap(api.POST('/api/me/password', { body: input })),
  });
}

export function useDeleteAccount(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.DELETE('/api/me')),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(sessionKey, null);
    },
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
  return useAvatarMutation(() => unwrap(api.DELETE('/api/me/avatar')));
}
