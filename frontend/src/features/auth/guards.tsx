import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router';

import { useSession } from '../../shared/api/auth';
import { PageSpinner } from '../../shared/ui/Spinner';
import { useNextPath } from './useNextPath';

export function RequireAuth(): JSX.Element {
  const { t } = useTranslation();
  const { data: user, isPending } = useSession();
  const location = useLocation();

  if (isPending) return <PageSpinner label={t('common.loading')} />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}

export function RedirectIfAuthed(): JSX.Element {
  const { t } = useTranslation();
  const { data: user, isPending } = useSession();
  const next = useNextPath();

  if (isPending) return <PageSpinner label={t('common.loading')} />;
  if (user) return <Navigate to={next} replace />;
  return <Outlet />;
}
