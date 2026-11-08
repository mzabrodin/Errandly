import { useSearchParams } from 'react-router';

/** Safe return address after sign-in: internal paths only */
export function useNextPath(fallback = '/app'): string {
  const [params] = useSearchParams();
  const next = params.get('next');
  return next !== null && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}
