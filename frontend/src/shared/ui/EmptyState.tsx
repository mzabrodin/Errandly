import type { JSX, ReactNode } from 'react';

import { FlowerFace } from './Decor';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps): JSX.Element {
  return (
    <div className={styles.empty}>
      <FlowerFace className={styles.flower} size={76} color="var(--lime)" />
      <h3 className={styles.title}>{title}</h3>
      {Boolean(description) && <p className={styles.description}>{description}</p>}
      {action}
    </div>
  );
}
