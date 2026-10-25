import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router';

import { Asterisk, Clouds, Flower, Hills } from '../shared/ui/Decor';
import { Logo } from '../shared/ui/Logo';
import styles from './AuthLayout.module.css';

export function AuthLayout(): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className={styles.layout}>
      <aside className={styles.sky}>
        <Clouds />
        <Hills />
        <Link to="/" className={styles.brand} aria-label={t('notFound.back')}>
          <Logo size={20} />
        </Link>
        <Link to="/" className={styles.hero} tabIndex={-1} aria-hidden>
          <span className={styles.bigLogo}>
            errandly
            <Asterisk className={styles.star} size={56} color="var(--lime)" />
          </span>
          <span className={styles.tag}>{t('app.tagline')}</span>
        </Link>
        <Flower className={styles.flower} size={110} color="var(--ink)" />
      </aside>
      <main className={`${styles.main} grid-paper`}>
        <div className={styles.panel}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
