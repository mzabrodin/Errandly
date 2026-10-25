import { useTranslation } from 'react-i18next';

import { errorMessage, isApiError } from '../../shared/api/errors';
import { useCompleteTask } from '../../shared/api/tasks';
import type { Task } from '../../shared/api/types';
import { useToast } from '../../shared/ui/Toast';

const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

function withinUndoWindow(task: Task): boolean {
  return (
    task.completedAt !== null && Date.now() - new Date(task.completedAt).getTime() < UNDO_WINDOW_MS
  );
}

/**
 * Хто може змінити позначку виконання (FR-24):
 * позначити — лише виконавець; зняти — виконавець протягом 24 годин,
 * адміністратор групи — будь-коли (наприклад, якщо задачу насправді не зроблено).
 */
export function canToggleTask(
  task: Task,
  { isMine, isAdmin }: { isMine: boolean; isAdmin: boolean },
): boolean {
  if (task.status !== 'done') return isMine;
  return isAdmin || (isMine && withinUndoWindow(task));
}

/** Позначити / скасувати виконання з тостом про результат */
export function useToggleTask(groupId: string): {
  toggle: (task: Task) => void;
  isPending: (taskId: string) => boolean;
} {
  const { t } = useTranslation();
  const toast = useToast();
  const complete = useCompleteTask(groupId);

  const toggle = (task: Task) => {
    const done = task.status !== 'done';
    complete.mutate(
      { id: task.id, done },
      {
        onSuccess: () => {
          if (!done) {
            toast(t('tasks.undoToast'));
            return;
          }
          // позначка в один тап — тож даємо швидко відкотити випадковий клік
          toast(t('tasks.doneToast', { title: task.title }), {
            action: {
              label: t('common.undo'),
              onClick: () =>
                complete.mutate(
                  { id: task.id, done: false },
                  { onSuccess: () => toast(t('tasks.undoToast')) },
                ),
            },
          });
        },
        onError: (mutationError) =>
          toast(
            isApiError(mutationError, 'UNDO_EXPIRED')
              ? t('tasks.undoExpired')
              : errorMessage(mutationError, t),
            'error',
          ),
      },
    );
  };

  const isPending = (taskId: string) => complete.isPending && complete.variables.id === taskId;

  return { toggle, isPending };
}
