import { http, HttpResponse } from 'msw';

import type { Settings } from '../../shared/api/types';
import { isValidPassword } from '../../shared/lib/validation';
import { db, defaultSettingsFor, persist, publicUser } from '../db';
import {
  API,
  currentUser,
  emptyResponse,
  error,
  groupName,
  redistributeOpenTasks,
  type DbUserRecord,
} from './common';

type SettingsPatch = Partial<Pick<Settings, 'reminderMinutes' | 'notifications'>>;

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('uk-UA', { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

// у моках зберігаємо як data URL; сервер покладе файл у сховище й поверне посилання
function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    });
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('FileReader error'));
    });
    reader.readAsDataURL(file);
  });
}

/** Групи, які лишилися б з учасниками, але без адміністратора (FR-16) */
function groupsBlockingDeletion(user: DbUserRecord): typeof db.memberships {
  return db.memberships.filter((item) => {
    if (item.userId !== user.id || item.role !== 'admin') return false;
    const members = db.memberships.filter((other) => other.groupId === item.groupId);
    const admins = members.filter((other) => other.role === 'admin');
    return admins.length === 1 && members.length > 1;
  });
}

function deleteUser(user: DbUserRecord): void {
  for (const item of db.memberships.filter((other) => other.userId === user.id)) {
    redistributeOpenTasks(item.groupId, user.id);
  }
  db.memberships = db.memberships.filter((item) => item.userId !== user.id);
  db.absences = db.absences.filter((item) => item.userId !== user.id);
  db.notifications = db.notifications.filter((item) => item.userId !== user.id);
  db.users = db.users.filter((item) => item.id !== user.id);
  delete db.settings[user.id];
  db.sessionUserId = null;
}

const settingsHandlers = [
  http.get(`${API}/me/settings`, () => {
    const user = currentUser();
    if (!user) return error(401, 'UNAUTHENTICATED');
    return HttpResponse.json(defaultSettingsFor(user.id));
  }),

  http.patch<never, SettingsPatch>(`${API}/me/settings`, async ({ request }) => {
    const user = currentUser();
    if (!user) return error(401, 'UNAUTHENTICATED');
    const patch = await request.json();
    const settings = defaultSettingsFor(user.id);
    if (typeof patch.reminderMinutes === 'number') settings.reminderMinutes = patch.reminderMinutes;
    if (patch.notifications) Object.assign(settings.notifications, patch.notifications);
    persist();
    return HttpResponse.json(settings);
  }),

  http.post(`${API}/me/calendar/sync`, () => {
    const user = currentUser();
    if (!user) return error(401, 'UNAUTHENTICATED');
    const settings = defaultSettingsFor(user.id);
    if (!settings.calendar.connected) return error(409, 'CALENDAR_NOT_CONNECTED');
    settings.calendar.syncStatus = 'ok';
    settings.calendar.lastSyncedAt = new Date().toISOString();
    persist();
    return HttpResponse.json(settings);
  }),
];

const profileHandlers = [
  http.patch<never, { name?: string; timezone?: string }>(`${API}/me`, async ({ request }) => {
    const user = currentUser();
    if (!user) return error(401, 'UNAUTHENTICATED');
    const { name, timezone } = await request.json();
    if (name !== undefined) {
      if (name.trim() === '') return error(400, 'VALIDATION', { fields: { name: 'required' } });
      if (name.trim().length > 60) return error(400, 'VALIDATION', { fields: { name: 'tooLong' } });
      user.name = name.trim();
    }
    if (timezone !== undefined && timezone !== '') {
      if (!isValidTimeZone(timezone)) {
        return error(400, 'VALIDATION', { fields: { timezone: 'invalid' } });
      }
      user.timezone = timezone;
    }
    persist();
    return HttpResponse.json(publicUser(user));
  }),

  http.post(`${API}/me/avatar`, async ({ request }) => {
    const user = currentUser();
    if (!user) return error(401, 'UNAUTHENTICATED');
    const file = (await request.formData()).get('file');
    if (!(file instanceof Blob) || !file.type.startsWith('image/')) {
      return error(400, 'VALIDATION', { fields: { file: 'type' } });
    }
    if (file.size > 512 * 1024) {
      return error(413, 'FILE_TOO_LARGE');
    }
    user.avatarUrl = await readAsDataUrl(file);
    persist();
    return HttpResponse.json(publicUser(user));
  }),

  http.delete(`${API}/me/avatar`, () => {
    const user = currentUser();
    if (!user) return error(401, 'UNAUTHENTICATED');
    user.avatarUrl = null;
    persist();
    return HttpResponse.json(publicUser(user));
  }),

  http.post<never, { currentPassword?: string; newPassword?: string }>(
    `${API}/me/password`,
    async ({ request }) => {
      const user = currentUser();
      if (!user) return error(401, 'UNAUTHENTICATED');
      const { currentPassword, newPassword = '' } = await request.json();
      if (user.password !== currentPassword) return error(400, 'WRONG_PASSWORD');
      if (!isValidPassword(newPassword)) {
        return error(400, 'VALIDATION', { fields: { newPassword: 'weak' } });
      }
      user.password = newPassword;
      persist();
      return emptyResponse();
    },
  ),

  http.delete(`${API}/me`, () => {
    const user = currentUser();
    if (!user) return error(401, 'UNAUTHENTICATED');
    // не можна лишити групу з учасниками без адміністратора (FR-16)
    const blocking = groupsBlockingDeletion(user);
    if (blocking.length > 0) {
      return error(409, 'LAST_ADMIN', {
        groups: blocking.map((item) => groupName(item.groupId)),
      });
    }
    deleteUser(user);
    persist();
    return emptyResponse();
  }),
];

const calendarHandlers = [
  http.post(`${API}/me/calendar/connect`, () => {
    const user = currentUser();
    if (!user) return error(401, 'UNAUTHENTICATED');
    // імітація OAuth-згоди Google
    defaultSettingsFor(user.id).calendar = {
      connected: true,
      syncStatus: 'ok',
      googleEmail: user.email,
      lastSyncedAt: new Date().toISOString(),
    };
    persist();
    return HttpResponse.json({ url: '/settings?calendar=connected' });
  }),

  http.delete(`${API}/me/calendar`, () => {
    const user = currentUser();
    if (!user) return error(401, 'UNAUTHENTICATED');
    const settings = defaultSettingsFor(user.id);
    settings.calendar = {
      connected: false,
      syncStatus: 'ok',
      googleEmail: null,
      lastSyncedAt: null,
    };
    persist();
    return HttpResponse.json(settings);
  }),
];

export const meHandlers = [...settingsHandlers, ...profileHandlers, ...calendarHandlers];
