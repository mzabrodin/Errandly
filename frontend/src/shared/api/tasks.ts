import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { http } from './client';
import type { EditScope, Task, TaskInput } from './types';

export const taskKeys = {
  group: (groupId: string) => ['tasks', groupId] as const,
  range: (groupId: string, from: string, to: string) => ['tasks', groupId, from, to] as const,
  detail: (groupId: string, taskId: string) => ['tasks', groupId, 'detail', taskId] as const,
  series: (groupId: string, seriesId: string) => ['tasks', groupId, 'series', seriesId] as const,
};

export function useTask(groupId: string, taskId: string): UseQueryResult<Task> {
  return useQuery({
    queryKey: taskKeys.detail(groupId, taskId),
    queryFn: () => http.get<Task>(`/tasks/${taskId}`),
  });
}

/** Усі екземпляри серії — для історії виконання на сторінці задачі */
export function useSeries(groupId: string, seriesId: string | undefined): UseQueryResult<Task[]> {
  return useQuery({
    queryKey: taskKeys.series(groupId, seriesId ?? ''),
    queryFn: () =>
      http.get<Task[]>(`/groups/${groupId}/tasks?seriesId=${encodeURIComponent(seriesId ?? '')}`),
    enabled: Boolean(seriesId),
  });
}

export function useTasks(groupId: string, from: string, to: string): UseQueryResult<Task[]> {
  return useQuery({
    queryKey: taskKeys.range(groupId, from, to),
    queryFn: () =>
      http.get<Task[]>(
        `/groups/${groupId}/tasks?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
  });
}

function useTaskMutation<TInput, TResult = unknown>(
  groupId: string,
  request: (input: TInput) => Promise<TResult>,
): UseMutationResult<TResult, Error, TInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.group(groupId) });
      void queryClient.invalidateQueries({ queryKey: ['stats', groupId] });
    },
  });
}

export function useCreateTask(groupId: string): UseMutationResult<Task, Error, TaskInput> {
  return useTaskMutation(groupId, (input: TaskInput) =>
    http.post<Task>(`/groups/${groupId}/tasks`, input),
  );
}

export function useUpdateTask(
  groupId: string,
): UseMutationResult<Task, Error, TaskInput & { id: string; scope: EditScope }> {
  return useTaskMutation(
    groupId,
    ({ id, scope, ...input }: TaskInput & { id: string; scope: EditScope }) =>
      http.patch<Task>(`/tasks/${id}?scope=${scope}`, input),
  );
}

export function useDeleteTask(
  groupId: string,
): UseMutationResult<unknown, Error, { id: string; scope: EditScope }> {
  return useTaskMutation(groupId, ({ id, scope }: { id: string; scope: EditScope }) =>
    http.delete(`/tasks/${id}?scope=${scope}`),
  );
}

export function useCompleteTask(
  groupId: string,
): UseMutationResult<Task, Error, { id: string; done: boolean }> {
  return useTaskMutation(groupId, ({ id, done }: { id: string; done: boolean }) =>
    done ? http.post<Task>(`/tasks/${id}/complete`) : http.delete<Task>(`/tasks/${id}/complete`),
  );
}

export function useReassignTask(
  groupId: string,
): UseMutationResult<Task, Error, { id: string; assigneeId: string }> {
  return useTaskMutation(groupId, ({ id, assigneeId }: { id: string; assigneeId: string }) =>
    http.patch<Task>(`/tasks/${id}/assignee`, { assigneeId }),
  );
}
