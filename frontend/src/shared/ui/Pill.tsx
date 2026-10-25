import { clsx } from 'clsx';
import type { HTMLAttributes, JSX } from 'react';

import styles from './Pill.module.css';

type Tone = 'lime' | 'sky' | 'cream' | 'ink' | 'done' | 'overdue' | 'planned' | 'unassigned';

interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  pixel?: boolean;
}

export function Pill({ tone = 'cream', pixel, className, ...rest }: PillProps): JSX.Element {
  return (
    <span
      className={clsx(styles.pill, styles[tone], pixel === true && styles.pixel, className)}
      {...rest}
    />
  );
}
