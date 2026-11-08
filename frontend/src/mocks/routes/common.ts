import { HttpResponse } from 'msw';

import type { Group } from '../../shared/api/types';
import { autoAssign, db, isCompleted, type Db } from '../db';

// Shared helpers for the mock API handlers

export const API = '/api';

export type DbUserRecord = Db['users'][number];
type DbMembershipRecord = Db['memberships'][number];

export interface GroupParams {
  groupId: string;
}

export interface TaskParams {
  taskId: string;
}

export function error(status: number, code: string, extra: Record<string, unknown> = {}): Response {
  return HttpResponse.json({ code, ...extra }, { status });
}

export function emptyResponse(status = 204): Response {
  return new HttpResponse(null, { status });
}

/** Mock data is consistent; a missing record is a bug in the mocks themselves */
export function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`[mock] ${what} not found`);
  return value;
}

export function currentUser(): DbUserRecord | null {
  return db.users.find((user) => user.id === db.sessionUserId) ?? null;
}

export function membership(groupId: string, userId: string): DbMembershipRecord | undefined {
  return db.memberships.find((item) => item.groupId === groupId && item.userId === userId);
}

/** Returns the member, or a Response with 401/403 (FR-40, NFR-SEC-04) */
export function authorize(
  groupId: string,
  adminOnly = false,
): Response | { user: DbUserRecord; member: DbMembershipRecord } {
  const user = currentUser();
  if (!user) return error(401, 'UNAUTHENTICATED');
  const member = membership(groupId, user.id);
  if (!member) return error(403, 'FORBIDDEN');
  if (adminOnly && member.role !== 'admin') return error(403, 'ADMIN_ONLY');
  return { user, member };
}

export function groupName(groupId: string): string | undefined {
  return db.groups.find((group) => group.id === groupId)?.name;
}

export function groupDto(groupId: string, userId: string): Group {
  const group = must(
    db.groups.find((item) => item.id === groupId),
    'group',
  );
  return {
    id: group.id,
    name: group.name,
    role: must(membership(groupId, userId), 'membership').role,
    members: db.memberships
      .filter((item) => item.groupId === groupId)
      .map((item) => {
        const user = must(
          db.users.find((candidate) => candidate.id === item.userId),
          'user',
        );
        return {
          userId: user.id,
          name: user.name,
          email: user.email,
          role: item.role,
          color: item.color,
          avatarUrl: user.avatarUrl ?? null,
          absences: db.absences
            .filter((absence) => absence.groupId === groupId && absence.userId === user.id)
            .map(({ id: absenceId, from, to }) => ({
              id: absenceId,
              from,
              to,
            })),
        };
      }),
  };
}

/** Reassigns the member's unfinished future tasks (FR-15) */
export function redistributeOpenTasks(groupId: string, userId: string): void {
  const open = db.tasks.filter(
    (task) =>
      task.groupId === groupId &&
      task.assigneeId === userId &&
      !isCompleted(task) &&
      new Date(task.dueAt).getTime() > Date.now(),
  );
  for (const task of open) task.assigneeId = null;
  for (const task of open) {
    task.assigneeId = autoAssign(db, groupId, task);
    task.manuallyAssigned = false;
  }
}
