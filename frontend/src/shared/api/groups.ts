import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api, unwrap } from './client';
import type { Group, GroupRole, GroupSummary, Invite, InviteInfo } from './types';

export const groupKeys = {
  all: ['groups'] as const,
  detail: (id: string) => ['groups', id] as const,
};

export function useGroups(): UseQueryResult<GroupSummary[]> {
  return useQuery({
    queryKey: groupKeys.all,
    queryFn: () => unwrap(api.GET('/api/groups')),
  });
}

export function useGroup(groupId: string): UseQueryResult<Group> {
  return useQuery({
    queryKey: groupKeys.detail(groupId),
    queryFn: () => unwrap(api.GET('/api/groups/{groupId}', { params: { path: { groupId } } })),
  });
}

export function useCreateGroup(): UseMutationResult<Group, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => unwrap(api.POST('/api/groups', { body: { name } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: groupKeys.all }),
  });
}

export function useCreateInvite(
  groupId: string,
): UseMutationResult<Invite, Error, string | undefined> {
  return useMutation({
    mutationFn: (email?: string) =>
      unwrap(
        api.POST('/api/groups/{groupId}/invites', {
          params: { path: { groupId } },
          body: email === undefined ? {} : { email },
        }),
      ),
  });
}

export function useInviteInfo(token: string, enabled: boolean): UseQueryResult<InviteInfo> {
  return useQuery({
    queryKey: ['invites', token],
    queryFn: () => unwrap(api.GET('/api/invites/{token}', { params: { path: { token } } })),
    enabled,
    retry: false,
  });
}

export function useAcceptInvite(): UseMutationResult<{ groupId: string }, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      unwrap(api.POST('/api/invites/{token}/accept', { params: { path: { token } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: groupKeys.all }),
  });
}

function useGroupMutation<TInput>(
  groupId: string,
  request: (input: TInput) => Promise<unknown>,
): UseMutationResult<unknown, Error, TInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: groupKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['tasks', groupId] });
      void queryClient.invalidateQueries({ queryKey: ['stats', groupId] });
    },
  });
}

export function useRemoveMember(groupId: string): UseMutationResult<unknown, Error, string> {
  return useGroupMutation(groupId, (userId: string) =>
    unwrap(
      api.DELETE('/api/groups/{groupId}/members/{userId}', {
        params: { path: { groupId, userId } },
      }),
    ),
  );
}

/** Grant / revoke admin rights (FR-16) */
export function useSetMemberRole(
  groupId: string,
): UseMutationResult<unknown, Error, { userId: string; role: GroupRole }> {
  return useGroupMutation(groupId, ({ userId, role }: { userId: string; role: GroupRole }) =>
    unwrap(
      api.PATCH('/api/groups/{groupId}/members/{userId}', {
        params: { path: { groupId, userId } },
        body: { role },
      }),
    ),
  );
}

export function useLeaveGroup(groupId: string): UseMutationResult<unknown, Error, void> {
  return useGroupMutation(groupId, () =>
    unwrap(api.POST('/api/groups/{groupId}/leave', { params: { path: { groupId } } })),
  );
}

export function useAddAbsence(
  groupId: string,
): UseMutationResult<unknown, Error, { from: string; to: string }> {
  return useGroupMutation(groupId, (input: { from: string; to: string }) =>
    unwrap(
      api.POST('/api/groups/{groupId}/absences', { params: { path: { groupId } }, body: input }),
    ),
  );
}

export function useDeleteAbsence(groupId: string): UseMutationResult<unknown, Error, string> {
  return useGroupMutation(groupId, (absenceId: string) =>
    unwrap(
      api.DELETE('/api/groups/{groupId}/absences/{absenceId}', {
        params: { path: { groupId, absenceId } },
      }),
    ),
  );
}
