import { clsx } from 'clsx';
import type { HTMLAttributes, JSX } from 'react';

import styles from './Card.module.css';

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'section' | 'div' | 'article' | 'li';
  pop?: boolean;
}

export function Card({ as: Tag = 'section', pop, className, ...rest }: CardProps): JSX.Element {
  return <Tag className={clsx(styles.card, pop === true && styles.pop, className)} {...rest} />;
}
