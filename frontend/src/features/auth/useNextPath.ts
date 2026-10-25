import { useSearchParams } from 'react-router';

/** Безпечна адреса для повернення після входу: лише внутрішні шляхи */
export function useNextPath(fallback = '/app'): string {
  const [params] = useSearchParams();
  const next = params.get('next');
  return next !== null && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}
