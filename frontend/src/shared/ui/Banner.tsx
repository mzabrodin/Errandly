import { clsx } from 'clsx';
import type { JSX, ReactNode } from 'react';

import styles from './Banner.module.css';

interface BannerProps {
  tone?: 'warning' | 'info';
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}

export function Banner({ tone = 'info', icon, action, children }: BannerProps): JSX.Element {
  return (
    <div
      className={clsx(styles.banner, styles[tone])}
      role={tone === 'warning' ? 'alert' : 'status'}
    >
      {Boolean(icon) && <span className={styles.icon}>{icon}</span>}
      <div className={styles.text}>{children}</div>
      {action}
    </div>
  );
}
