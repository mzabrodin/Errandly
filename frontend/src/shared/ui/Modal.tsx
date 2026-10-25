import { X } from 'lucide-react';
import { useEffect, useRef, type JSX, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './Modal.module.css';

interface ModalProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md';
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = 'md',
}: ModalProps): JSX.Element {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    // клік по backdrop закриває модалку; з клавіатури — Escape через onCancel
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- backdrop click
    <dialog
      ref={ref}
      className={styles.dialog}
      data-size={size}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className={styles.panel}>
          <header className={styles.header}>
            <h2 className={styles.title}>{title}</h2>
            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              aria-label={t('common.close')}
            >
              <X size={20} />
            </button>
          </header>
          <div className={styles.body}>{children}</div>
          {Boolean(footer) && <footer className={styles.footer}>{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
