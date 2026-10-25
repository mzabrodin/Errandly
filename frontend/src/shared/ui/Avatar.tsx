import { clsx } from 'clsx';
import { useState, type JSX } from 'react';

import styles from './Avatar.module.css';

// у маленькому колі дві широкі літери не вміщаються — показуємо одну
const SINGLE_LETTER_BELOW = 30;

function initials(name: string, count: number) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, count)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

interface AvatarProps {
  name: string;
  src?: string | null;
  color?: string;
  size?: number;
  className?: string;
}

export function Avatar({
  name,
  src,
  color = 'var(--cream-deep)',
  size = 32,
  className,
}: AvatarProps): JSX.Element {
  const single = size < SINGLE_LETTER_BELOW;
  // якщо фото не завантажилось — показуємо ініціали
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imageSrc =
    src !== undefined && src !== null && src !== '' && failedSrc !== src ? src : null;
  return (
    <span
      className={clsx(styles.avatar, className)}
      style={{
        width: size,
        height: size,
        background: color,
        fontSize: Math.round(size * (single ? 0.44 : 0.3)),
      }}
      aria-hidden
      title={name}
    >
      {imageSrc !== null ? (
        <img
          className={styles.image}
          src={imageSrc}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedSrc(imageSrc)}
        />
      ) : (
        initials(name, single ? 1 : 2)
      )}
    </span>
  );
}
