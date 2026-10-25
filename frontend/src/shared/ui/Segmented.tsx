import { clsx } from 'clsx';
import type { JSX, ReactNode } from 'react';

import styles from './Segmented.module.css';

interface SegmentedProps<T extends string | number> {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  label: string;
  size?: 'sm' | 'md';
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  size = 'md',
}: SegmentedProps<T>): JSX.Element {
  return (
    <div className={clsx(styles.group, styles[size])} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          // кнопки з role="radio", щоб зберегти вигляд і поведінку кнопок (без нативних radio)
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- кастомний segmented control
          role="radio"
          aria-checked={option.value === value}
          className={styles.option}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
