import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { ButtonLink } from '../shared/ui/Button';
import { Flower } from '../shared/ui/Decor';
import styles from './NotFoundPage.module.css';

export function NotFoundPage(): JSX.Element {
  const { t } = useTranslation();

  return (
    <main className={`${styles.page} grid-paper`}>
      <Flower size={96} color="var(--grass)" />
      <p className={styles.code}>404</p>
      <h1 className={styles.title}>{t('notFound.title')}</h1>
      <p className={styles.text}>{t('notFound.text')}</p>
      <ButtonLink to="/">{t('notFound.back')}</ButtonLink>
    </main>
  );
}
