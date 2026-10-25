import { clsx } from 'clsx';
import { useEffect, useId, useRef, useState, type JSX, type ReactNode } from 'react';

import { handleMenuKeys } from '../lib/menuKeys';
import styles from './Menu.module.css';

export interface MenuTriggerProps {
  onClick: () => void;
  'aria-expanded': boolean;
  'aria-controls': string;
  'aria-haspopup': 'menu';
}

interface MenuProps {
  trigger: (props: MenuTriggerProps) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
}

export function Menu({ trigger, children, align = 'start' }: MenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: PointerEvent) => {
      const { target } = event;
      if (!(target instanceof Node) || ref.current?.contains(target) !== true) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className={styles.wrapper} ref={ref}>
      {trigger({
        onClick: () => setOpen((value) => !value),
        'aria-expanded': open,
        'aria-controls': id,
        'aria-haspopup': 'menu',
      })}
      {open && (
        <div
          id={id}
          role="menu"
          tabIndex={-1}
          className={clsx(styles.menu, styles[align])}
          onKeyDown={handleMenuKeys}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

interface MenuItemProps {
  onSelect: () => void;
  icon?: ReactNode;
  children: ReactNode;
  danger?: boolean;
  active?: boolean;
}

export function MenuItem({ onSelect, icon, children, danger, active }: MenuItemProps): JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      className={clsx(
        styles.item,
        danger === true && styles.danger,
        active === true && styles.active,
      )}
      onClick={onSelect}
    >
      {icon}
      <span className={styles.itemText}>{children}</span>
    </button>
  );
}

export function MenuSeparator(): JSX.Element {
  return <hr className={styles.separator} />;
}
