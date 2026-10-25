import { clsx } from 'clsx';
import {
  useId,
  type InputHTMLAttributes,
  type JSX,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

import styles from './Field.module.css';

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: (props: {
    id: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
  }) => ReactNode;
}

export function Field({ label, hint, error, className, children }: FieldProps): JSX.Element {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;
  const hasError = Boolean(error);

  return (
    <div className={clsx(styles.field, className)}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children({
        id,
        ...(hasError && { 'aria-invalid': true }),
        ...(Boolean(message) && { 'aria-describedby': messageId }),
      })}
      {Boolean(message) && (
        <div
          id={messageId}
          className={clsx(styles.message, hasError && styles.error)}
          role={hasError ? 'alert' : undefined}
        >
          {message}
        </div>
      )}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return <input className={clsx(styles.control, className)} {...rest} />;
}

export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>): JSX.Element {
  return <textarea className={clsx(styles.control, styles.textarea, className)} {...rest} />;
}

export function Select({
  className,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>): JSX.Element {
  return <select className={clsx(styles.control, styles.select, className)} {...rest} />;
}

export function FormError({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className={styles.formError} role="alert">
      {children}
    </div>
  );
}
