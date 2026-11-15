import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { sessionKey } from './auth';
import { api, http, unwrap } from './client';
import { groupKeys } from './groups';
import type { ProfilePatch, User } from './types';

export function useUpdateProfile(): UseMutationResult<User, Error, ProfilePatch> {
  return useUserMutation((patch: ProfilePatch) => unwrap(api.PATCH('/api/me', { body: patch })));
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

function useUserMutation<TInput>(
  request: (input: TInput) => Promise<User>,
): UseMutationResult<User, Error, TInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (user) => {
      queryClient.setQueryData(sessionKey, user);
      // Group member lists show the name and the avatar
      void queryClient.invalidateQueries({ queryKey: groupKeys.all });
    },
  });
}

export function useUploadAvatar(): UseMutationResult<User, Error, Blob> {
  return useUserMutation((image: Blob) => {
    const form = new FormData();
    form.append('file', image, 'avatar');
    return http.upload<User>('/me/avatar', form);
  });
}

export function useRemoveAvatar(): UseMutationResult<User, Error, void> {
  return useUserMutation(() => unwrap(api.DELETE('/api/me/avatar')));
}
