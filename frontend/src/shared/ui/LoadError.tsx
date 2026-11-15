import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '../api/errors';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

export function LoadError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <EmptyState
      title={errorMessage(error, t)}
      action={<Button onClick={onRetry}>{t('common.retry')}</Button>}
    />
  );
}
