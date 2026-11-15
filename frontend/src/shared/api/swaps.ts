import { useQuery, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';

import { api, unwrap } from './client';
import { useInvalidatingMutation } from './mutation';
import { statsKeys } from './stats';
import { swapKeys } from './swapKeys';
import { taskKeys } from './tasks';
import type { Swap } from './types';

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
  // A failed answer means the swap went stale, so the list is refreshed either way
  return useInvalidatingMutation(
    request,
    [swapKeys.group(groupId), taskKeys.group(groupId), statsKeys.group(groupId)],
    'settled',
  );
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
