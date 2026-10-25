import { http, HttpResponse } from 'msw';

import { toDateInputValue } from '../../shared/lib/dates';
import { autoAssign, DAY_MS, db, id, isCompleted, memberColor, persist } from '../db';
import { sendMail } from '../mailer';
import { pushNotification } from '../notifications';
import {
  API,
  authorize,
  currentUser,
  emptyResponse,
  error,
  groupDto,
  groupName,
  membership,
  must,
  redistributeOpenTasks,
  type GroupParams,
} from './common';

interface MemberParams extends GroupParams {
  userId: string;
}

function isActiveInvite(invite: { revoked: boolean; expiresAt: string }): boolean {
  return !invite.revoked && !(new Date(invite.expiresAt).getTime() < Date.now());
}

const groupListHandlers = [
  http.get(`${API}/groups`, () => {
    const user = currentUser();
    if (!user) return error(401, 'UNAUTHENTICATED');
    return HttpResponse.json(
      db.memberships
        .filter((item) => item.userId === user.id)
        .map((item) => ({
          id: item.groupId,
          name: must(groupName(item.groupId), 'group'),
          role: item.role,
          memberCount: db.memberships.filter((other) => other.groupId === item.groupId).length,
        })),
    );
  }),

  http.post<never, { name?: string }>(`${API}/groups`, async ({ request }) => {
    const user = currentUser();
    if (!user) return error(401, 'UNAUTHENTICATED');
    if (!user.emailVerified) return error(403, 'EMAIL_NOT_VERIFIED');
    const { name = '' } = await request.json();
    if (name.trim() === '') return error(400, 'VALIDATION', { fields: { name: 'required' } });
    if (name.trim().length > 50) return error(400, 'VALIDATION', { fields: { name: 'tooLong' } });
    const groupId = id('g');
    db.groups.push({ id: groupId, name: name.trim() });
    db.memberships.push({
      groupId,
      userId: user.id,
      role: 'admin',
      color: memberColor(0),
    });
    pushNotification(user.id, 'groupCreated', {
      groupId,
      taskId: null,
      data: { groupName: name.trim() },
    });
    persist();
    return HttpResponse.json(groupDto(groupId, user.id), { status: 201 });
  }),

  http.get<GroupParams>(`${API}/groups/:groupId`, ({ params }) => {
    const auth = authorize(params.groupId);
    if (auth instanceof Response) return auth;
    return HttpResponse.json(groupDto(params.groupId, auth.user.id));
  }),
];

const inviteHandlers = [
  http.post<GroupParams, { email?: string } | null>(
    `${API}/groups/:groupId/invites`,
    async ({ params, request }) => {
      const { groupId } = params;
      const auth = authorize(groupId, true);
      if (auth instanceof Response) return auth;
      const body: { email?: string } | null = await request.json().catch(() => ({}));
      const email = body?.email;
      const invite = {
        token: id('inv') + Math.random().toString(36).slice(2, 10),
        groupId,
        invitedBy: auth.user.id,
        expiresAt: new Date(Date.now() + 7 * DAY_MS).toISOString(),
        revoked: false,
      };
      db.invites.push(invite);
      persist();
      const url = `${location.origin}/invite/${invite.token}`;
      if (email !== undefined && email !== '') {
        sendMail('invite', email, {
          inviterName: auth.user.name,
          groupName: must(groupName(groupId), 'group'),
          url,
        });
      }
      return HttpResponse.json({ url, expiresAt: invite.expiresAt }, { status: 201 });
    },
  ),

  http.get<{ token: string }>(`${API}/invites/:token`, ({ params }) => {
    const invite = db.invites.find((item) => item.token === params.token);
    if (!invite || !isActiveInvite(invite)) return error(410, 'INVITE_INVALID');
    const user = currentUser();
    return HttpResponse.json({
      groupId: invite.groupId,
      groupName: must(groupName(invite.groupId), 'group'),
      invitedBy: must(
        db.users.find((candidate) => candidate.id === invite.invitedBy),
        'inviter',
      ).name,
      alreadyMember: Boolean(user && membership(invite.groupId, user.id)),
    });
  }),

  http.post<{ token: string }>(`${API}/invites/:token/accept`, ({ params }) => {
    const user = currentUser();
    if (!user) return error(401, 'UNAUTHENTICATED');
    const invite = db.invites.find((item) => item.token === params.token);
    if (!invite || !isActiveInvite(invite)) return error(410, 'INVITE_INVALID');
    if (!user.emailVerified) return error(403, 'EMAIL_NOT_VERIFIED');
    if (!membership(invite.groupId, user.id)) {
      const taken = db.memberships.filter((item) => item.groupId === invite.groupId).length;
      db.memberships.push({
        groupId: invite.groupId,
        userId: user.id,
        role: 'member',
        color: memberColor(taken),
      });
      const payload = {
        groupId: invite.groupId,
        taskId: null,
        data: { groupName: groupName(invite.groupId), actorName: user.name },
      };
      pushNotification(user.id, 'groupJoined', payload);
      for (const admin of db.memberships.filter(
        (item) => item.groupId === invite.groupId && item.role === 'admin',
      )) {
        pushNotification(admin.userId, 'memberJoined', payload);
      }
      persist();
    }
    return HttpResponse.json({ groupId: invite.groupId });
  }),
];

const memberHandlers = [
  http.delete<MemberParams>(`${API}/groups/:groupId/members/:userId`, ({ params }) => {
    const { groupId, userId } = params;
    const auth = authorize(groupId, true);
    if (auth instanceof Response) return auth;
    if (userId === auth.user.id) return error(409, 'CANNOT_REMOVE_SELF');
    db.memberships = db.memberships.filter(
      (item) => !(item.groupId === groupId && item.userId === userId),
    );
    redistributeOpenTasks(groupId, userId);
    pushNotification(userId, 'removedFromGroup', {
      groupId: null,
      taskId: null,
      data: { groupName: groupName(groupId), actorName: auth.user.name },
    });
    persist();
    return emptyResponse();
  }),

  http.patch<MemberParams, { role?: string }>(
    `${API}/groups/:groupId/members/:userId`,
    async ({ params, request }) => {
      const { groupId } = params;
      const auth = authorize(groupId, true);
      if (auth instanceof Response) return auth;
      const { role } = await request.json();
      if (role !== 'admin' && role !== 'member') return error(400, 'VALIDATION');
      const target = membership(groupId, params.userId);
      if (!target) return error(404, 'NOT_FOUND');
      const admins = db.memberships.filter(
        (item) => item.groupId === groupId && item.role === 'admin',
      );
      // у групі завжди лишається хоча б один адміністратор (FR-16)
      if (role === 'member' && target.role === 'admin' && admins.length === 1) {
        return error(409, 'LAST_ADMIN');
      }
      if (target.role !== role) {
        pushNotification(target.userId, role === 'admin' ? 'roleGranted' : 'roleRevoked', {
          groupId,
          taskId: null,
          data: { groupName: groupName(groupId), actorName: auth.user.name },
        });
      }
      target.role = role;
      persist();
      return emptyResponse();
    },
  ),

  http.post<GroupParams>(`${API}/groups/:groupId/leave`, ({ params }) => {
    const { groupId } = params;
    const auth = authorize(groupId);
    if (auth instanceof Response) return auth;
    const members = db.memberships.filter((item) => item.groupId === groupId);
    const admins = members.filter((item) => item.role === 'admin');
    if (auth.member.role === 'admin' && admins.length === 1 && members.length > 1) {
      return error(409, 'LAST_ADMIN');
    }
    db.memberships = db.memberships.filter(
      (item) => !(item.groupId === groupId && item.userId === auth.user.id),
    );
    redistributeOpenTasks(groupId, auth.user.id);
    persist();
    return emptyResponse();
  }),
];

/** Нові відсутності звільняють від автоматично призначених задач цього періоду */
function releaseTasksDuring(groupId: string, userId: string, from: string, to: string): void {
  for (const task of db.tasks) {
    const day = toDateInputValue(new Date(task.dueAt));
    if (
      task.groupId === groupId &&
      task.assigneeId === userId &&
      !isCompleted(task) &&
      !task.manuallyAssigned &&
      from <= day &&
      day <= to
    ) {
      task.assigneeId = null;
      task.assigneeId = autoAssign(db, groupId, task);
    }
  }
}

const absenceHandlers = [
  http.post<GroupParams, { from?: string; to?: string }>(
    `${API}/groups/:groupId/absences`,
    async ({ params, request }) => {
      const { groupId } = params;
      const auth = authorize(groupId);
      if (auth instanceof Response) return auth;
      const { from = '', to = '' } = await request.json();
      if (from === '' || to === '' || from > to) {
        return error(400, 'VALIDATION', { fields: { to: 'beforeFrom' } });
      }
      db.absences.push({
        id: id('abs'),
        groupId,
        userId: auth.user.id,
        from,
        to,
      });
      releaseTasksDuring(groupId, auth.user.id, from, to);
      persist();
      return emptyResponse(201);
    },
  ),

  http.delete<GroupParams & { absenceId: string }>(
    `${API}/groups/:groupId/absences/:absenceId`,
    ({ params }) => {
      const auth = authorize(params.groupId);
      if (auth instanceof Response) return auth;
      db.absences = db.absences.filter(
        (absence) => !(absence.id === params.absenceId && absence.userId === auth.user.id),
      );
      persist();
      return emptyResponse();
    },
  ),
];

export const groupHandlers = [
  ...groupListHandlers,
  ...inviteHandlers,
  ...memberHandlers,
  ...absenceHandlers,
];
