import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';

import { useGroups } from '../../shared/api/groups';
import { getLastGroupId } from '../../shared/lib/lastGroup';
import { PageSpinner } from '../../shared/ui/Spinner';

export function GroupHomeRedirect(): JSX.Element {
  const { t } = useTranslation();
  const { data: groups, isPending } = useGroups();

  if (isPending) return <PageSpinner label={t('common.loading')} />;
  const first = groups?.[0];
  if (groups === undefined || first === undefined) return <Navigate to="/groups/new" replace />;

  const lastId = getLastGroupId();
  const target = groups.find((group) => group.id === lastId) ?? first;
  return <Navigate to={`/g/${target.id}/tasks`} replace />;
}
