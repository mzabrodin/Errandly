import { useSyncExternalStore } from 'react';

// Налаштування інтерфейсу, які стосуються лише цього браузера
export const THEMES = ['meadow', 'sakura', 'pixel', 'sunset'] as const;
export type Theme = (typeof THEMES)[number];

export interface Prefs {
  defaultScope: 'mine' | 'all';
  reduceMotion: boolean;
  theme: Theme;
}

const KEY = 'errandly-prefs';
const DEFAULTS: Prefs = {
  defaultScope: 'mine',
  reduceMotion: false,
  theme: 'meadow',
};
const listeners = new Set<() => void>();

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null || raw === '') return DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' ? { ...DEFAULTS, ...parsed } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

let current = read();

function apply(prefs: Prefs): void {
  const root = document.documentElement;
  root.dataset['reduceMotion'] = String(prefs.reduceMotion);
  if (prefs.theme === 'meadow') delete root.dataset['theme'];
  else root.dataset['theme'] = prefs.theme;
}

apply(current);

export function setPrefs(patch: Partial<Prefs>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // лишиться в пам'яті до перезавантаження
  }
  apply(current);
  listeners.forEach((listener) => listener());
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
