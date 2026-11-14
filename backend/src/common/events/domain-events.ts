// What happened, never what to do next. Payloads are stored as JSON: ids, ISO strings, plain values.

import type { CalendarProvider, GroupRole } from '../domain.js';

export interface DomainEventMap {
  /** auth: registration or "send again"; the listener issues a fresh token per delivery */
  'auth.emailVerificationRequested': { userId: string };
  /** auth: someone asked to reset the password of an existing account (FR-08) */
  'auth.passwordResetRequested': { userId: string };
  /** users: an account was deleted (NFR-LEG-02) */
  'user.deleted': { userId: string };
  /** users: an uploaded avatar was replaced, removed or its account deleted */
  'user.avatarDiscarded': { key: string };
  /** groups: a group was created; `userId` is its first admin (FR-10) */
  'group.created': { groupId: string; userId: string };
  /** groups: an admin gave or took the admin role (FR-16) */
  'group.roleChanged': { groupId: string; userId: string; role: GroupRole; actorId: string };
  /** groups: FR-11; the listener issues the recipient's own link per delivery */
  'group.inviteEmailRequested': {
    groupId: string;
    email: string;
    invitedBy: string;
    /** The same expiry as the admin's link */
    expiresAt: string;
  };
  /** groups: someone accepted an invite (SD-2) */
  'group.memberJoined': { groupId: string; userId: string };
  /** groups: a member left or was removed (FR-15); `removedBy` is null when they left */
  'group.memberLeft': { groupId: string; userId: string; removedBy: string | null };
  /** groups: a member will be away; inclusive yyyy-mm-dd dates (FR-15, FR-29) */
  'group.absenceAdded': { groupId: string; userId: string; from: string; to: string };
  /** tasks: an instance got a new assignee, by the algorithm or by hand (SD-1, FR-27–31) */
  'task.assigned': {
    taskId: string;
    groupId: string;
    assigneeId: string | null;
    previousAssigneeId: string | null;
    /** Null when the algorithm decided; nobody is notified about their own action */
    actorId: string | null;
  };
  /** tasks: title, description, due date or difficulty changed */
  'task.changed': { taskId: string; groupId: string };
  /** tasks: marked done or undone (SD-3) */
  'task.completed': { taskId: string; groupId: string; userId: string; done: boolean };
  /** groups: the last member left; published before the group and its tasks are deleted */
  'group.deleted': { groupId: string };
  /** tasks: published before the instance is deleted */
  'task.deleted': { taskId: string; groupId: string; assigneeId: string | null };
  /** calendar: connect, "sync now" or a new reminder time */
  'calendar.resyncRequested': { userId: string };
  /** calendar: the event's task was deleted (FR-34) */
  'calendar.eventDiscarded': { connectionId: string; externalEventId: string };
  /** calendar: disconnected or account deleted */
  'calendar.connectionClosed': {
    provider: CalendarProvider;
    calendarId: string;
    refreshTokenEncrypted: string;
  };
}

export type EventType = keyof DomainEventMap;
