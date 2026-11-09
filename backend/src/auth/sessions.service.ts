import { Injectable } from '@nestjs/common';

import { Clock } from '../common/clock.js';
import type { RequestUser } from '../common/http/auth.js';
import { generateToken, hashToken } from '../common/tokens.js';
import type { DbExecutor } from '../db/database.js';
import { AuthRepository } from './auth.repository.js';
import { sessionExpiry, shouldRefreshSession } from './auth.rules.js';

/** What goes into the cookie */
export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

export interface Authenticated {
  user: RequestUser;
  /** Set when the expiry slid forward, so the cookie must be sent again */
  refreshed: IssuedSession | null;
}

/** Cookie sessions: a random token in the cookie, its SHA-256 in `sessions` (SYS-06, SYS-24) */
@Injectable()
export class SessionService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly clock: Clock,
  ) {}

  async create(userId: string, db?: DbExecutor): Promise<IssuedSession> {
    const token = generateToken();
    const now = this.clock.now();
    const expiresAt = sessionExpiry(now);
    await this.repository.insertSession(
      { id: hashToken(token), userId, expiresAt, lastSeenAt: now },
      db,
    );
    return { token, expiresAt };
  }

  /** The user behind a cookie token, or null; an expired session is deleted (SYS-07) */
  async authenticate(token: string | undefined): Promise<Authenticated | null> {
    if (token === undefined) return null;
    const id = hashToken(token);
    const session = await this.repository.findSession(id);
    if (!session) return null;

    const now = this.clock.now();
    if (session.expiresAt <= now) {
      await this.repository.deleteSession(id);
      return null;
    }

    let refreshed: IssuedSession | null = null;
    if (shouldRefreshSession(session.lastSeenAt, now)) {
      refreshed = { token, expiresAt: sessionExpiry(now) };
      await this.repository.touchSession(id, now, refreshed.expiresAt);
    }
    return { user: { id: session.userId, sessionId: id }, refreshed };
  }

  async revoke(token: string | undefined): Promise<void> {
    if (token !== undefined) await this.repository.deleteSession(hashToken(token));
  }

  /** Signs the user out everywhere, except the session `keepId` when given */
  async revokeAll(userId: string, keepId: string | null, db?: DbExecutor): Promise<void> {
    await this.repository.deleteSessionsOfUser(userId, keepId, db);
  }
}
