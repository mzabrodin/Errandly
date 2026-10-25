import type { KeyboardEvent } from 'react';

/** Навігація стрілками між пунктами меню (WAI-ARIA menu pattern) */
export function handleMenuKeys(event: KeyboardEvent<HTMLElement>): void {
  const items = [
    ...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'),
  ];
  if (items.length === 0) return;
  const index = items.findIndex((item) => item === document.activeElement);
  const focus = (next: number) => {
    event.preventDefault();
    items[(next + items.length) % items.length]?.focus();
  };
  if (event.key === 'ArrowDown') focus(index + 1);
  else if (event.key === 'ArrowUp') focus(index < 0 ? items.length - 1 : index - 1);
  else if (event.key === 'Home') focus(0);
  else if (event.key === 'End') focus(items.length - 1);
}
