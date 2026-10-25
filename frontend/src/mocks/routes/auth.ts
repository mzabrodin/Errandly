import { http, HttpResponse } from 'msw';

import { isValidPassword } from '../../shared/lib/validation';
import { db, id, persist, publicUser } from '../db';
import { sendMail } from '../mailer';
import { API, currentUser, emptyResponse, error } from './common';

const LOCK_MS = 15 * 60 * 1000;

interface RegisterBody {
  name?: string;
  email?: string;
  password?: string;
}

interface LoginBody {
  email?: string;
  password?: string;
}

export const authHandlers = [
  http.get(`${API}/auth/me`, () => {
    const user = currentUser();
    return user ? HttpResponse.json(publicUser(user)) : error(401, 'UNAUTHENTICATED');
  }),

  http.post<never, RegisterBody>(`${API}/auth/register`, async ({ request }) => {
    const { name = '', email = '', password = '' } = await request.json();
    const fields: Record<string, string> = {};
    if (name.trim() === '') fields['name'] = 'required';
    if (!email.includes('@')) fields['email'] = 'invalid';
    if (!isValidPassword(password)) fields['password'] = 'weak';
    if (Object.keys(fields).length > 0) return error(400, 'VALIDATION', { fields });

    const normalized = email.trim().toLowerCase();
    if (db.users.some((user) => user.email === normalized)) return error(409, 'EMAIL_TAKEN');

    const user = {
      id: id('u'),
      name: name.trim(),
      email: normalized,
      emailVerified: false,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      password,
      failedLogins: 0,
      lockedUntil: null,
      avatarUrl: null,
    };
    db.users.push(user);
    db.sessionUserId = user.id;
    persist();
    sendMail('verifyEmail', user.email, {
      name: user.name,
      url: `${location.origin}/verify-email/${user.id}`,
    });
    return HttpResponse.json(publicUser(user), { status: 201 });
  }),

  http.post<never, LoginBody>(`${API}/auth/login`, async ({ request }) => {
    const { email, password } = await request.json();
    const user = db.users.find((candidate) => candidate.email === email?.trim().toLowerCase());
    if (user !== undefined && user.lockedUntil !== null && user.lockedUntil > Date.now()) {
      return error(423, 'ACCOUNT_LOCKED', {
        retryAfterSeconds: Math.ceil((user.lockedUntil - Date.now()) / 1000),
      });
    }
    if (!user || user.password !== password) {
      if (user) {
        user.failedLogins += 1;
        if (user.failedLogins >= 5) {
          user.lockedUntil = Date.now() + LOCK_MS;
          user.failedLogins = 0;
          persist();
          return error(423, 'ACCOUNT_LOCKED', {
            retryAfterSeconds: LOCK_MS / 1000,
          });
        }
        persist();
      }
      return error(401, 'INVALID_CREDENTIALS');
    }
    user.failedLogins = 0;
    user.lockedUntil = null;
    db.sessionUserId = user.id;
    persist();
    return HttpResponse.json(publicUser(user));
  }),

  http.post(`${API}/auth/logout`, () => {
    db.sessionUserId = null;
    persist();
    return emptyResponse();
  }),

  http.get(`${API}/auth/google`, () => {
    // імітація OAuth: входимо демо-користувачем
    db.sessionUserId = 'u-anya';
    persist();
    return HttpResponse.redirect('/', 302);
  }),

  http.post<never, { email?: string }>(`${API}/auth/forgot-password`, async ({ request }) => {
    const { email } = await request.json();
    const user = db.users.find((candidate) => candidate.email === email?.trim().toLowerCase());
    if (user) {
      sendMail('resetPassword', user.email, {
        name: user.name.split(' ')[0] ?? '',
        url: `${location.origin}/reset-password/${user.id}`,
      });
    }
    // завжди 204, щоб не розкривати, чи існує email
    return emptyResponse();
  }),

  http.post<never, { token?: string; password?: string }>(
    `${API}/auth/reset-password`,
    async ({ request }) => {
      const { token, password = '' } = await request.json();
      const user = db.users.find((candidate) => candidate.id === token);
      if (!user) return error(400, 'TOKEN_INVALID');
      if (!isValidPassword(password)) {
        return error(400, 'VALIDATION', { fields: { password: 'weak' } });
      }
      user.password = password;
      persist();
      return emptyResponse();
    },
  ),

  http.post<never, { token?: string }>(`${API}/auth/verify-email`, async ({ request }) => {
    const { token } = await request.json();
    const user = db.users.find((candidate) => candidate.id === token);
    if (!user) return error(400, 'TOKEN_INVALID');
    user.emailVerified = true;
    persist();
    return HttpResponse.json(publicUser(user));
  }),

  http.post(`${API}/auth/verify-email/resend`, () => {
    const user = currentUser();
    if (!user) return error(401, 'UNAUTHENTICATED');
    sendMail('verifyEmail', user.email, {
      name: user.name,
      url: `${location.origin}/verify-email/${user.id}`,
    });
    return emptyResponse();
  }),
];
