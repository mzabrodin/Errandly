import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api, unwrap } from './client';
import { taskKeys } from './tasks';
import type { Swap } from './types';

export const swapKeys = {
  group: (groupId: string) => ['swaps', groupId] as const,
};

export function useSwaps(groupId: string): UseQueryResult<Swap[]> {
  return useQuery({
    queryKey: swapKeys.group(groupId),
    queryFn: () =>
      unwrap(api.GET('/api/groups/{groupId}/swaps', { params: { path: { groupId } } })),
  });
}

function useSwapMutation<TInput, TResult = unknown>(
  groupId: string,
  request: (input: TInput) => Promise<TResult>,
): UseMutationResult<TResult, Error, TInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    // A failed answer means the swap went stale, so the list is refreshed either way
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: swapKeys.group(groupId) });
      void queryClient.invalidateQueries({ queryKey: taskKeys.group(groupId) });
      void queryClient.invalidateQueries({ queryKey: ['stats', groupId] });
    },
  });
}

export function useProposeSwap(
  groupId: string,
): UseMutationResult<Swap, Error, { taskId: string; requestedTaskId: string }> {
  return useSwapMutation(
    groupId,
    ({ taskId, requestedTaskId }: { taskId: string; requestedTaskId: string }) =>
      unwrap(
        api.POST('/api/tasks/{taskId}/swaps', {
          params: { path: { taskId } },
          body: { requestedTaskId },
        }),
      ),
  );
}

export function useAnswerSwap(
  groupId: string,
): UseMutationResult<Swap, Error, { swapId: string; accept: boolean }> {
  return useSwapMutation(groupId, ({ swapId, accept }: { swapId: string; accept: boolean }) =>
    unwrap(
      accept
        ? api.POST('/api/swaps/{swapId}/accept', { params: { path: { swapId } } })
        : api.POST('/api/swaps/{swapId}/decline', { params: { path: { swapId } } }),
    ),
  );
}

export function useCancelSwap(groupId: string): UseMutationResult<unknown, Error, string> {
  return useSwapMutation(groupId, (swapId: string) =>
    unwrap(api.DELETE('/api/swaps/{swapId}', { params: { path: { swapId } } })),
  );
}
