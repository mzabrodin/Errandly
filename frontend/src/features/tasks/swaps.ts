import type { Task } from '../../shared/api/types';

export function canProposeSwap(task: Task, userId: string): boolean {
  return task.assigneeId === userId && task.status === 'planned';
}

export function swapCandidates(tasks: readonly Task[], userId: string): Map<string, Task[]> {
  const byAssignee = new Map<string, Task[]>();
  const open = tasks
    .filter((task) => task.status === 'planned' && task.assigneeId !== userId)
    .toSorted((a, b) => a.dueAt.localeCompare(b.dueAt));
  for (const task of open) {
    if (task.assigneeId === null) continue;
    byAssignee.set(task.assigneeId, [...(byAssignee.get(task.assigneeId) ?? []), task]);
  }
  return byAssignee;
}
