import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { api, unwrap } from './client';
import type { MemberStats, StatsPeriod } from './types';

export function useStats(groupId: string, period: StatsPeriod): UseQueryResult<MemberStats[]> {
  return useQuery({
    queryKey: ['stats', groupId, period],
    queryFn: () =>
      unwrap(
        api.GET('/api/groups/{groupId}/stats', {
          params: { path: { groupId }, query: { period } },
        }),
      ),
  });
}
