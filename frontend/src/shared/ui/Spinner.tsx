import type { JSX } from 'react';

import styles from './Spinner.module.css';

export function Spinner({ size = 24, label }: { size?: number; label?: string }): JSX.Element {
  return (
    <output className={styles.spinner} style={{ width: size, height: size }}>
      {label !== undefined && label !== '' && <span className="visually-hidden">{label}</span>}
    </output>
  );
}

export function PageSpinner({ label }: { label: string }): JSX.Element {
  return (
    <div className={styles.page}>
      <Spinner size={36} label={label} />
    </div>
  );
}
