import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api, unwrap } from './client';
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
    queryFn: () => unwrap(api.GET('/api/tasks/{taskId}', { params: { path: { taskId } } })),
  });
}

/** All instances of a series, for the completion history on the task page */
export function useSeries(groupId: string, seriesId: string | undefined): UseQueryResult<Task[]> {
  return useQuery({
    queryKey: taskKeys.series(groupId, seriesId ?? ''),
    queryFn: () =>
      unwrap(
        api.GET('/api/groups/{groupId}/tasks', {
          params: { path: { groupId }, query: { seriesId: seriesId ?? '' } },
        }),
      ),
    enabled: Boolean(seriesId),
  });
}

export function useTasks(groupId: string, from: string, to: string): UseQueryResult<Task[]> {
  return useQuery({
    queryKey: taskKeys.range(groupId, from, to),
    queryFn: () =>
      unwrap(
        api.GET('/api/groups/{groupId}/tasks', {
          params: { path: { groupId }, query: { from, to } },
        }),
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
    unwrap(api.POST('/api/groups/{groupId}/tasks', { params: { path: { groupId } }, body: input })),
  );
}

export function useUpdateTask(
  groupId: string,
): UseMutationResult<Task, Error, TaskInput & { id: string; scope: EditScope }> {
  return useTaskMutation(
    groupId,
    ({ id, scope, ...input }: TaskInput & { id: string; scope: EditScope }) =>
      unwrap(
        api.PATCH('/api/tasks/{taskId}', {
          params: { path: { taskId: id }, query: { scope } },
          body: input,
        }),
      ),
  );
}

export function useDeleteTask(
  groupId: string,
): UseMutationResult<unknown, Error, { id: string; scope: EditScope }> {
  return useTaskMutation(groupId, ({ id, scope }: { id: string; scope: EditScope }) =>
    unwrap(
      api.DELETE('/api/tasks/{taskId}', { params: { path: { taskId: id }, query: { scope } } }),
    ),
  );
}

export function useCompleteTask(
  groupId: string,
): UseMutationResult<Task, Error, { id: string; done: boolean }> {
  return useTaskMutation(groupId, ({ id, done }: { id: string; done: boolean }) =>
    unwrap(
      done
        ? api.POST('/api/tasks/{taskId}/complete', { params: { path: { taskId: id } } })
        : api.DELETE('/api/tasks/{taskId}/complete', { params: { path: { taskId: id } } }),
    ),
  );
}

export function useReassignTask(
  groupId: string,
): UseMutationResult<Task, Error, { id: string; assigneeId: string }> {
  return useTaskMutation(groupId, ({ id, assigneeId }: { id: string; assigneeId: string }) =>
    unwrap(
      api.PATCH('/api/tasks/{taskId}/assignee', {
        params: { path: { taskId: id } },
        body: { assigneeId },
      }),
    ),
  );
}
