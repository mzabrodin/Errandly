import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { http } from './client';
import type { NotificationList } from './types';

const notificationsKey = ['notifications'] as const;

/** In-app notifications; refreshed every 30 s and when returning to the tab */
export function useNotifications(): UseQueryResult<NotificationList> {
  return useQuery({
    queryKey: notificationsKey,
    queryFn: () => http.get<NotificationList>('/notifications'),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useMarkNotificationsRead(): UseMutationResult<void, Error, string[] | undefined> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => http.post<void>('/notifications/read', { ids }),
    // Optimistic: the badge disappears immediately
    onMutate: (ids) => {
      queryClient.setQueryData<NotificationList>(notificationsKey, (current) => {
        if (!current) return current;
        const items = current.items.map((item) =>
          !ids || ids.includes(item.id) ? { ...item, read: true } : item,
        );
        return { items, unread: items.filter((item) => !item.read).length };
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationsKey }),
  });
}

/** After actions that create notifications (new task, new group), refresh the list */
export function useRefreshNotifications(): () => Promise<void> {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: notificationsKey });
}
