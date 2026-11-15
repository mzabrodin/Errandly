export type GroupSection = 'tasks' | 'calendar' | 'members' | 'stats';

export function groupPath(groupId: string, section: GroupSection = 'tasks'): string {
  return `/g/${groupId}/${section}`;
}

export function taskPath(groupId: string, taskId: string): string {
  return `/g/${groupId}/tasks/${taskId}`;
}
