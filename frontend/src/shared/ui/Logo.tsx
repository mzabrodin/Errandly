import { clsx } from 'clsx';
import type { JSX } from 'react';

import styles from './Logo.module.css';

export function Logo({ size = 22, className }: { size?: number; className?: string }): JSX.Element {
  return (
    <span className={clsx(styles.logo, className)} style={{ fontSize: size }}>
      errandly<span className={styles.star}>*</span>
    </span>
  );
}
