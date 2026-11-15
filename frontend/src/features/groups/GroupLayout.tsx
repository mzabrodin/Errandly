import { useEffect, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useParams } from 'react-router';

import { ForbiddenView } from '../../pages/ForbiddenView';
import { errorMessage, hasStatus } from '../../shared/api/errors';
import { useGroup } from '../../shared/api/groups';
import { setLastGroupId } from '../../shared/lib/lastGroup';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { PageSpinner } from '../../shared/ui/Spinner';
import { TaskActionsProvider } from '../tasks/TaskActions';
import { GroupContext } from './groupContext';

export function GroupLayout(): JSX.Element {
  const { t } = useTranslation();
  const { groupId = '' } = useParams();
  const { data: group, error, isPending, refetch } = useGroup(groupId);

  useEffect(() => {
    if (group) setLastGroupId(group.id);
  }, [group]);

  if (isPending) return <PageSpinner label={t('common.loading')} />;
  if (hasStatus(error, 403, 404)) {
    return <ForbiddenView />;
  }
  if (error) {
    return (
      <EmptyState
        title={errorMessage(error, t)}
        action={<Button onClick={() => void refetch()}>{t('common.retry')}</Button>}
      />
    );
  }
  return (
    <GroupContext.Provider value={group}>
      <TaskActionsProvider>
        <Outlet />
      </TaskActionsProvider>
    </GroupContext.Provider>
  );
}
