import {
  useMutation,
  useQueryClient,
  type QueryKey,
  type UseMutationResult,
} from '@tanstack/react-query';

/**
 * A mutation that refreshes `keys` afterwards. `settled` also refreshes after a failure, for
 * answers that fail because the data on screen went stale.
 */
export function useInvalidatingMutation<TInput, TResult>(
  request: (input: TInput) => Promise<TResult>,
  keys: readonly QueryKey[],
  when: 'success' | 'settled' = 'success',
): UseMutationResult<TResult, Error, TInput> {
  const queryClient = useQueryClient();
  const refresh = (): void => {
    for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
  };
  return useMutation({
    mutationFn: request,
    ...(when === 'success' ? { onSuccess: refresh } : { onSettled: refresh }),
  });
}
