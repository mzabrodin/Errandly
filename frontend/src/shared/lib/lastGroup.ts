const KEY = 'errandly-last-group';

export function getLastGroupId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setLastGroupId(groupId: string): void {
  try {
    localStorage.setItem(KEY, groupId);
  } catch {
    // не критично
  }
}
