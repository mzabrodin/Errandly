import { clsx } from 'clsx';
import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';

import styles from './Button.module.css';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'lime' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface CommonProps {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  block?: boolean;
}

interface ButtonProps extends CommonProps, ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  block,
  loading,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button
      type={type}
      className={clsx(
        styles.button,
        styles[variant],
        styles[size],
        block === true && styles.block,
        className,
      )}
      disabled={disabled === true || loading === true}
      aria-busy={loading === true ? true : undefined}
      {...rest}
    >
      {loading === true ? <Spinner size={16} /> : icon}
      {Boolean(children) && <span>{children}</span>}
    </button>
  );
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  icon,
  block,
  className,
  children,
  ...rest
}: CommonProps & LinkProps): JSX.Element {
  return (
    <Link
      className={clsx(
        styles.button,
        styles[variant],
        styles[size],
        block === true && styles.block,
        className,
      )}
      {...rest}
    >
      {icon}
      {Boolean(children) && <span>{children}</span>}
    </Link>
  );
}
