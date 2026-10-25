import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export function NotFoundPage(): JSX.Element {
  const { t } = useTranslation();

  return (
    <main className="page">
      <h1>{t('notFound.title')}</h1>
      <Link to="/">{t('notFound.back')}</Link>
    </main>
  );
}
