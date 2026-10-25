import type { JSX, ReactNode } from 'react';

import { useDocumentTitle } from '../lib/useDocumentTitle';
import { Asterisk } from './Decor';
import styles from './PageHeader.module.css';

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps): JSX.Element {
  useDocumentTitle(typeof title === 'string' ? title : null);
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        <h1 className={styles.title}>
          <span className={styles.mark}>{title}</span>
          <Asterisk className={styles.star} size={30} color="var(--grass)" />
        </h1>
        {Boolean(subtitle) && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {Boolean(actions) && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
