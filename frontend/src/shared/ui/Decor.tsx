// Декоративні елементи з референсів: астериск (blume), контурна квітка, хмари й пагорби (kummba)
import { clsx } from 'clsx';
import type { JSX } from 'react';

import styles from './Decor.module.css';

interface DecorProps {
  className?: string;
  size?: number;
  color?: string;
}

export function Asterisk({
  className,
  size = 48,
  color = 'currentColor',
}: DecorProps): JSX.Element {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden
      fill="none"
    >
      <g stroke={color} strokeWidth="7" strokeLinecap="round">
        <path d="M24 5v38M7.5 14.5l33 19M7.5 33.5l33-19" />
      </g>
    </svg>
  );
}

export function Flower({ className, size = 80, color = 'currentColor' }: DecorProps): JSX.Element {
  return (
    <svg
      className={clsx(styles.stroke, className)}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden
      fill="none"
    >
      <g stroke={color} strokeWidth="2.5" strokeLinejoin="round">
        <path d="M50 38c-6-16-2-28 8-28s14 12 6 28c14-10 28-8 30 2s-10 16-26 12c12 10 14 24 4 28s-18-6-22-20c-4 14-12 24-22 20s-8-18 4-28c-16 4-28-2-26-12s16-12 30-2c-8-16-4-28 6-28s14 12 8 28z" />
        <circle cx="50" cy="50" r="8" />
      </g>
    </svg>
  );
}

const SKY_CLOUDS = [
  { left: '4%', top: '22%', width: '17%', opacity: 0.95, duration: 26 },
  { left: '68%', top: '10%', width: '14%', opacity: 0.9, duration: 32 },
  { left: '40%', top: '64%', width: '9%', opacity: 0.75, duration: 20 },
  { left: '86%', top: '46%', width: '7%', opacity: 0.8, duration: 17 },
];

/** Хмари на небі: кожна окремо, з власними пропорціями (не розтягуються з контейнером) */
export function Clouds({ className }: { className?: string }): JSX.Element {
  return (
    <div className={clsx(styles.clouds, className)} aria-hidden>
      {SKY_CLOUDS.map((cloud, index) => (
        <svg
          key={cloud.left}
          className={styles.skyCloud}
          viewBox="0 0 120 70"
          style={{
            left: cloud.left,
            top: cloud.top,
            width: cloud.width,
            opacity: cloud.opacity,
            animationDuration: `${cloud.duration}s`,
            animationDelay: `${index * -7}s`,
          }}
        >
          <path
            d="M30 64C13 64 6 51 13 41C6 29 19 15 33 21C38 6 61 2 71 17C82 6 102 13 100 30C114 32 117 53 104 60C101 63 96 64 91 64Z"
            fill="var(--cloud)"
          />
        </svg>
      ))}
    </div>
  );
}

export function Hills({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      className={clsx(styles.hills, className)}
      viewBox="0 0 1200 220"
      aria-hidden
      preserveAspectRatio="none"
    >
      <defs>
        <pattern id="grass-blades" width="14" height="18" patternUnits="userSpaceOnUse">
          <path
            d="M3 18c1-6 2-10 1-16M9 18c0-5 2-9 4-13"
            stroke="var(--hill-blades)"
            strokeWidth="1.4"
            fill="none"
            opacity="0.35"
          />
        </pattern>
      </defs>
      <path d="M0 120C180 40 360 30 560 110s420 60 640-30v140H0z" fill="var(--hill-light)" />
      <path d="M0 160c220-70 420-60 620 0s380 40 580-20v80H0z" fill="var(--hill-dark)" />
      <path d="M0 160c220-70 420-60 620 0s380 40 580-20v80H0z" fill="url(#grass-blades)" />
    </svg>
  );
}

export function Marquee({ items }: { items: string[] }): JSX.Element {
  const line = items.join('  *  ') + '  *  ';
  return (
    <div className={styles.marquee} aria-hidden>
      <div className={styles.track}>
        <span>{line}</span>
        <span>{line}</span>
      </div>
    </div>
  );
}

/** Пухка хмарка-стікер із контуром (замість еліпсів-градієнтів) */
export function Cloud({
  className,
  size = 120,
  outline = true,
}: DecorProps & { outline?: boolean }): JSX.Element {
  return (
    <svg
      className={clsx(styles.stroke, className)}
      width={size}
      height={(size * 70) / 120}
      viewBox="0 0 120 70"
      aria-hidden
    >
      <path
        d="M30 64C13 64 6 51 13 41C6 29 19 15 33 21C38 6 61 2 71 17C82 6 102 13 100 30C114 32 117 53 104 60C101 63 96 64 91 64Z"
        fill="var(--cloud)"
        stroke={outline ? 'var(--ink)' : 'none'}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Усміхнена квітка з пакетиків насіння blume */
export function FlowerFace({
  className,
  size = 80,
  color = 'var(--lime)',
}: DecorProps): JSX.Element {
  return (
    <svg
      className={clsx(styles.stroke, className)}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-hidden
    >
      <g fill={color} stroke="var(--ink)" strokeWidth="2">
        <circle cx="60" cy="28" r="22" />
        <circle cx="92" cy="52" r="22" />
        <circle cx="80" cy="90" r="22" />
        <circle cx="40" cy="90" r="22" />
        <circle cx="28" cy="52" r="22" />
        <circle cx="60" cy="62" r="26" />
      </g>
      <g fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round">
        <path d="M50 56v4M70 56v4" />
        <path d="M48 70c6 7 18 7 24 0" />
      </g>
    </svg>
  );
}
