import { useId, type JSX, type ReactNode } from 'react';

import styles from './Switch.module.css';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: SwitchProps): JSX.Element {
  const id = useId();
  return (
    <div className={styles.row}>
      <div>
        <label id={`${id}-label`} htmlFor={id} className={styles.label}>
          {label}
        </label>
        {Boolean(description) && <p className={styles.description}>{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        disabled={disabled}
        className={styles.switch}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.thumb} />
      </button>
    </div>
  );
}
