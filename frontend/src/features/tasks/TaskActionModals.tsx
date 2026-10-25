import { clsx } from 'clsx';
import { Check } from 'lucide-react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '../../shared/api/errors';
import { useDeleteTask, useReassignTask } from '../../shared/api/tasks';
import type { EditScope, Task } from '../../shared/api/types';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { FormError } from '../../shared/ui/Field';
import { Modal } from '../../shared/ui/Modal';
import { useToast } from '../../shared/ui/Toast';
import { useCurrentGroup } from '../groups/useCurrentGroup';
import styles from './TaskActionModals.module.css';

/** Ручна зміна виконавця адміністратором (FR-30) */
export function ReassignModal({
  task,
  onClose,
}: {
  task: Task | null;
  onClose: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const { group } = useCurrentGroup();
  const reassign = useReassignTask(group.id);

  return (
    <Modal size="sm" open={task !== null} onClose={onClose} title={t('tasks.reassignTitle')}>
      {task && (
        <>
          <p className={styles.taskName}>{task.title}</p>
          <ul className={styles.options}>
            {group.members.map((member) => {
              const current = member.userId === task.assigneeId;
              return (
                <li key={member.userId}>
                  <button
                    type="button"
                    className={clsx(styles.option, current && styles.current)}
                    disabled={reassign.isPending}
                    onClick={() =>
                      reassign.mutate(
                        { id: task.id, assigneeId: member.userId },
                        {
                          onSuccess: () => {
                            toast(t('tasks.reassigned', { name: member.name }));
                            onClose();
                          },
                        },
                      )
                    }
                  >
                    <Avatar
                      name={member.name}
                      src={member.avatarUrl}
                      color={member.color}
                      size={32}
                    />
                    <span className={styles.optionName}>{member.name}</span>
                    {current && <Check size={18} />}
                  </button>
                </li>
              );
            })}
          </ul>
          {reassign.error && <FormError>{errorMessage(reassign.error, t)}</FormError>}
        </>
      )}
    </Modal>
  );
}

/** Видалення задачі; для повторюваної — вибір «лише цю / всю серію» (FR-22) */
export function DeleteTaskModal({
  task,
  onClose,
  onDeleted,
}: {
  task: Task | null;
  onClose: () => void;
  onDeleted?: (() => void) | undefined;
}): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const { group } = useCurrentGroup();
  const remove = useDeleteTask(group.id);
  const recurring = task !== null && task.recurrence.type !== 'once';

  const confirm = (scope: EditScope) =>
    task &&
    remove.mutate(
      { id: task.id, scope },
      {
        onSuccess: () => {
          toast(t('tasks.deleted'));
          onClose();
          onDeleted?.();
        },
      },
    );

  return (
    <Modal
      size="sm"
      open={task !== null}
      onClose={onClose}
      title={t('tasks.deleteTitle')}
      footer={
        recurring ? (
          <>
            <Button variant="secondary" loading={remove.isPending} onClick={() => confirm('one')}>
              {t('tasks.deleteOne')}
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => confirm('series')}>
              {t('tasks.deleteSeries')}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => confirm('one')}>
              {t('common.delete')}
            </Button>
          </>
        )
      }
    >
      {task && <p className={styles.taskName}>{task.title}</p>}
      <p>{recurring ? t('tasks.deleteRecurringText') : t('tasks.deleteText')}</p>
      {remove.error && <FormError>{errorMessage(remove.error, t)}</FormError>}
    </Modal>
  );
}
