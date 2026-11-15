import type { JSX, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from './Button';
import { FormError } from './Field';
import { Modal } from './Modal';

interface ConfirmModalProps {
  open: boolean;
  title: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  pending: boolean;
  /** Already translated */
  error: string | null;
  confirmDisabled?: boolean;
  children: ReactNode;
}

/** "Are you sure?" for a destructive action: Cancel and a danger button */
export function ConfirmModal({
  open,
  title,
  confirmLabel,
  onConfirm,
  onClose,
  pending,
  error,
  confirmDisabled = false,
  children,
}: ConfirmModalProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <Modal
      size="sm"
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" disabled={confirmDisabled} loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {error !== null && <FormError>{error}</FormError>}
    </Modal>
  );
}
