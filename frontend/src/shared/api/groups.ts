import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { http } from './client';
import type { Group, GroupRole, GroupSummary, Invite, InviteInfo } from './types';

export const groupKeys = {
  all: ['groups'] as const,
  detail: (id: string) => ['groups', id] as const,
};

export function useGroups(): UseQueryResult<GroupSummary[]> {
  return useQuery({
    queryKey: groupKeys.all,
    queryFn: () => http.get<GroupSummary[]>('/groups'),
  });
}

export function useGroup(groupId: string): UseQueryResult<Group> {
  return useQuery({
    queryKey: groupKeys.detail(groupId),
    queryFn: () => http.get<Group>(`/groups/${groupId}`),
  });
}

export function useCreateGroup(): UseMutationResult<Group, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => http.post<Group>('/groups', { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: groupKeys.all }),
  });
}

export function useCreateInvite(
  groupId: string,
): UseMutationResult<Invite, Error, string | undefined> {
  return useMutation({
    mutationFn: (email?: string) => http.post<Invite>(`/groups/${groupId}/invites`, { email }),
  });
}

export function useInviteInfo(token: string, enabled: boolean): UseQueryResult<InviteInfo> {
  return useQuery({
    queryKey: ['invites', token],
    queryFn: () => http.get<InviteInfo>(`/invites/${token}`),
    enabled,
    retry: false,
  });
}

export function useAcceptInvite(): UseMutationResult<{ groupId: string }, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => http.post<{ groupId: string }>(`/invites/${token}/accept`),
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
    http.delete(`/groups/${groupId}/members/${userId}`),
  );
}

/** Передача / зняття прав адміністратора (FR-16) */
export function useSetMemberRole(
  groupId: string,
): UseMutationResult<unknown, Error, { userId: string; role: GroupRole }> {
  return useGroupMutation(groupId, ({ userId, role }: { userId: string; role: GroupRole }) =>
    http.patch(`/groups/${groupId}/members/${userId}`, { role }),
  );
}

export function useLeaveGroup(groupId: string): UseMutationResult<unknown, Error, void> {
  return useGroupMutation(groupId, () => http.post(`/groups/${groupId}/leave`));
}

export function useAddAbsence(
  groupId: string,
): UseMutationResult<unknown, Error, { from: string; to: string }> {
  return useGroupMutation(groupId, (input: { from: string; to: string }) =>
    http.post(`/groups/${groupId}/absences`, input),
  );
}

export function useDeleteAbsence(groupId: string): UseMutationResult<unknown, Error, string> {
  return useGroupMutation(groupId, (absenceId: string) =>
    http.delete(`/groups/${groupId}/absences/${absenceId}`),
  );
}
