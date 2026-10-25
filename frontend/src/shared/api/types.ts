// Контракт API, на який спирається фронтенд. Повний опис — frontend/API.md

export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  timezone: string;
  avatarUrl: string | null;
}

export type GroupRole = 'admin' | 'member';

export interface GroupSummary {
  id: string;
  name: string;
  role: GroupRole;
  memberCount: number;
}

export interface Absence {
  id: string;
  from: string; // ISO date, yyyy-mm-dd
  to: string;
}

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: GroupRole;
  color: string;
  avatarUrl: string | null;
  absences: Absence[];
}

export interface Group {
  id: string;
  name: string;
  role: GroupRole;
  members: Member[];
}

export type TaskStatus = 'planned' | 'done' | 'overdue' | 'unassigned';

export type Recurrence =
  | { type: 'once' }
  | { type: 'daily' }
  | { type: 'weekly'; weekdays: number[] } // 1 = понеділок … 7 = неділя
  | { type: 'monthly' };

export interface Task {
  id: string;
  seriesId: string;
  groupId: string;
  title: string;
  description: string;
  dueAt: string; // ISO, UTC
  difficulty: number; // 1–5
  recurrence: Recurrence;
  status: TaskStatus;
  assigneeId: string | null;
  manuallyAssigned: boolean;
  completedAt: string | null;
}

export interface TaskInput {
  title: string;
  description: string;
  dueAt: string;
  difficulty: number;
  recurrence: Recurrence;
  assigneeId: string | null; // null — автоматичний розподіл
}

export type EditScope = 'one' | 'series';

export interface Invite {
  url: string;
  expiresAt: string;
}

export interface InviteInfo {
  groupId: string;
  groupName: string;
  invitedBy: string;
  alreadyMember: boolean;
}

export type StatsPeriod = 'week' | 'month';

export interface MemberStats {
  userId: string;
  done: number;
  overdue: number;
  difficulty: number;
}

export type NotificationType =
  | 'groupCreated'
  | 'groupJoined'
  | 'memberJoined'
  | 'taskAssigned'
  | 'taskUnassigned'
  | 'taskOverdue'
  | 'roleGranted'
  | 'roleRevoked'
  | 'removedFromGroup';

export interface AppNotification {
  id: string;
  type: NotificationType;
  createdAt: string;
  read: boolean;
  groupId: string | null;
  taskId: string | null;
  data: {
    groupName?: string | undefined;
    taskTitle?: string | undefined;
    actorName?: string | undefined;
    dueAt?: string | undefined;
  };
}

export interface NotificationList {
  items: AppNotification[];
  unread: number;
}

export interface Settings {
  calendar: {
    connected: boolean;
    syncStatus: 'ok' | 'paused';
    googleEmail: string | null;
    lastSyncedAt: string | null;
  };
  reminderMinutes: number;
  notifications: {
    assigned: boolean;
    dueSoon: boolean;
    overdue: boolean;
    weeklyDigest: boolean;
  };
}
