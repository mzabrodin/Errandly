import { createContext, useContext } from 'react';

import type { Task } from '../../shared/api/types';

export interface TaskActions {
  create: (defaultDay?: Date) => void;
  edit: (task: Task) => void;
  reassign: (task: Task) => void;
  remove: (task: Task, onDeleted?: () => void) => void;
}

export const TaskActionsContext = createContext<TaskActions | null>(null);

export function useTaskActions(): TaskActions {
  const actions = useContext(TaskActionsContext);
  if (actions === null) throw new Error('useTaskActions must be used inside TaskActionsProvider');
  return actions;
}
