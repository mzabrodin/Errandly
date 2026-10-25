import { Lock } from 'lucide-react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { ButtonLink } from '../shared/ui/Button';
import styles from './ForbiddenView.module.css';

/** «Немає доступу» для чужих груп (FR-40) */
export function ForbiddenView(): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={styles.wrap}>
      <span className={styles.icon}>
        <Lock size={32} />
      </span>
      <h1 className={styles.title}>{t('errors.forbidden')}</h1>
      <p className={styles.text}>{t('errors.forbiddenText')}</p>
      <ButtonLink to="/app">{t('errors.toMyGroups')}</ButtonLink>
    </div>
  );
}
