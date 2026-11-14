// Shared by the database schema, DTOs and validators; values are part of the API contract.

/** UI and email languages; `uk` is the default (FR-38) */
export const LOCALES = ['uk', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'uk';

export const GROUP_ROLES = ['admin', 'member'] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

/** Computed by the server in this order, never stored: done → overdue → unassigned → planned */
export const TASK_STATUSES = ['planned', 'done', 'overdue', 'unassigned'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const RECURRENCE_TYPES = ['once', 'daily', 'weekly', 'monthly'] as const;
export type RecurrenceType = (typeof RECURRENCE_TYPES)[number];

export const EDIT_SCOPES = ['one', 'series'] as const;
export type EditScope = (typeof EDIT_SCOPES)[number];

export const STATS_PERIODS = ['week', 'month'] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

export const NOTIFICATION_TYPES = [
  'groupCreated',
  'groupJoined',
  'memberJoined',
  'taskAssigned',
  'taskUnassigned',
  'taskOverdue',
  'roleGranted',
  'roleRevoked',
  'removedFromGroup',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** `paused` after 5 failed sync attempts; the UI shows a banner (SYS-21) */
export const SYNC_STATUSES = ['ok', 'paused'] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const EMAIL_TOKEN_PURPOSES = ['verifyEmail', 'resetPassword'] as const;
export type EmailTokenPurpose = (typeof EMAIL_TOKEN_PURPOSES)[number];

/** External sign-in providers; a password is not a provider (password_credentials) */
export const AUTH_PROVIDERS = ['google'] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export const CALENDAR_PROVIDERS = ['google'] as const;
export type CalendarProvider = (typeof CALENDAR_PROVIDERS)[number];

/** Notifications a user can switch on or off, per channel; in-app notifications are always on */
export const NOTIFICATION_EVENTS = [
  'taskAssigned',
  'taskDueSoon',
  'taskOverdue',
  'weeklyDigest',
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const NOTIFICATION_CHANNELS = ['email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const DEFAULT_NOTIFICATION_PREFERENCES: Record<NotificationEvent, boolean> = {
  taskAssigned: true,
  taskDueSoon: true,
  taskOverdue: true,
  weeklyDigest: false,
};

/** Reminder offsets offered in the settings, in minutes before the due time */
export const REMINDER_MINUTES = [15, 30, 60, 180, 1440] as const;
/** FR-33 */
export const DEFAULT_CALENDAR_REMINDER_MINUTES = 60;
/** FR-38: a day before the due time */
export const DEFAULT_EMAIL_REMINDER_MINUTES = 1440;

export const MEMBER_COLORS = [
  '#e6f36b',
  '#8ec3ea',
  '#f6b6cf',
  '#ffb86b',
  '#c9b6f2',
  '#9ee0c0',
  '#ffe27a',
  '#ff9c8a',
] as const;

export function memberColor(index: number): string {
  return MEMBER_COLORS[index % MEMBER_COLORS.length] ?? MEMBER_COLORS[0];
}

export const LIMITS = {
  userName: 60,
  groupName: 50,
  taskTitle: 100,
  taskDescription: 2000,
  email: 254,
  passwordMin: 8,
  /** Upper bound so hashing a huge password cannot be used for DoS */
  passwordMax: 128,
  difficultyMin: 1,
  difficultyMax: 5,
  avatarBytes: 512 * 1024,
} as const;

/** Recurring series materialise instances this many days ahead (FR-21) */
export const HORIZON_DAYS = 28;
