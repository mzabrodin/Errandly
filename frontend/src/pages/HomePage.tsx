import { useTranslation } from 'react-i18next';

export function HomePage() {
  const { t } = useTranslation();

  return (
    <main className="page">
      <h1>{t('app.name')}</h1>
      <p>{t('app.tagline')}</p>
    </main>
  );
}
