import { useCallback, useMemo, useState, type JSX, type ReactNode } from 'react';

import type { Task } from '../../shared/api/types';
import { DeleteTaskModal, ReassignModal } from './TaskActionModals';
import { TaskActionsContext, type TaskActions } from './taskActionsContext';
import { TaskFormModal } from './TaskFormModal';

interface FormState {
  open: boolean;
  task: Task | null;
  defaultDay?: Date | undefined;
}

/** Спільні модалки дій із задачами для всіх сторінок групи (одна копія замість модалки на кожну картку) */
export function TaskActionsProvider({ children }: { children: ReactNode }): JSX.Element {
  const [form, setForm] = useState<FormState>({ open: false, task: null });
  const [reassigning, setReassigning] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<{
    task: Task;
    onDeleted?: (() => void) | undefined;
  } | null>(null);

  const create = useCallback(
    (defaultDay?: Date) => setForm({ open: true, task: null, defaultDay }),
    [],
  );
  const edit = useCallback((task: Task) => setForm({ open: true, task }), []);
  const remove = useCallback(
    (task: Task, onDeleted?: () => void) => setDeleting({ task, onDeleted }),
    [],
  );

  const value = useMemo<TaskActions>(
    () => ({ create, edit, reassign: setReassigning, remove }),
    [create, edit, remove],
  );

  return (
    <TaskActionsContext.Provider value={value}>
      {children}
      <TaskFormModal
        open={form.open}
        task={form.task}
        defaultDay={form.defaultDay}
        onClose={() => setForm((current) => ({ ...current, open: false }))}
      />
      <ReassignModal task={reassigning} onClose={() => setReassigning(null)} />
      <DeleteTaskModal
        task={deleting?.task ?? null}
        onClose={() => setDeleting(null)}
        onDeleted={deleting?.onDeleted}
      />
    </TaskActionsContext.Provider>
  );
}
