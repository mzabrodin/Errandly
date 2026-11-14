import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { Clock } from '../common/clock.js';
import { TokenCipher } from '../common/crypto/token-cipher.js';
import type { CalendarProvider } from '../common/domain.js';
import { DomainError } from '../common/errors/domain-error.js';
import { EventBus } from '../common/events/event-bus.js';
import { DATABASE, type Database, type DbExecutor } from '../db/database.js';
import { UsersApi } from '../users/index.js';
import { toStatus } from './calendar-api.js';
import { CalendarRepository } from './calendar.repository.js';
import { CALENDAR_NAME } from './calendar.rules.js';
import type { CalendarConnectionRow } from './calendar.schema.js';
import type { CalendarStatusDto } from './dto/calendar.dto.js';
import { CalendarAccessRevoked } from './gateways/calendar-gateway.js';
import { CalendarGateways } from './gateways/calendar-gateways.js';
import { CalendarOAuth, type CalendarGrant } from './oauth/calendar-oauth.js';
import { sealState, stateIsValid } from './oauth/oauth-state.js';

const PROVIDER: CalendarProvider = 'google';

export interface CallbackQuery {
  code?: string | undefined;
  state?: string | undefined;
  error?: string | undefined;
}

/** FR-32, FR-35, SYS-18 */
@Injectable()
export class CalendarService implements OnModuleInit {
  private readonly logger = new Logger(CalendarService.name);

  // oxlint-disable-next-line max-params -- Nest constructor injection: each parameter is a dependency, never a positional argument
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: CalendarRepository,
    private readonly oauth: CalendarOAuth,
    private readonly gateways: CalendarGateways,
    private readonly users: UsersApi,
    private readonly cipher: TokenCipher,
    private readonly bus: EventBus,
    private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    this.bus.onInTransaction('user.deleted', async ({ userId }, tx) => {
      const connection = await this.repository.findByUser(userId, tx);
      if (connection) await this.close(connection, tx);
    });
    this.bus.onAfterCommit('calendar.connectionClosed', 'calendar.removeCalendar', (event) =>
      this.removeCalendar(event.provider, event.calendarId, event.refreshTokenEncrypted),
    );
  }

  connectUrl(userId: string): string {
    if (!this.oauth.configured) throw new DomainError('SERVICE_UNAVAILABLE');
    return this.oauth.authUrl(sealState(this.cipher, userId, this.clock.now()));
  }

  async complete(userId: string, query: CallbackQuery): Promise<boolean> {
    const { code, state, error } = query;
    if (error !== undefined || code === undefined || state === undefined) return false;
    if (!stateIsValid(this.cipher, state, userId, this.clock.now())) return false;
    try {
      await this.connect(userId, await this.oauth.exchange(code));
      return true;
    } catch (cause) {
      this.logger.warn(`Calendar connection failed: ${String(cause)}`);
      return false;
    }
  }

  async disconnect(userId: string): Promise<CalendarStatusDto> {
    await this.db.transaction(async (tx) => {
      const connection = await this.repository.findByUser(userId, tx);
      if (connection) await this.close(connection, tx);
    });
    return toStatus(undefined);
  }

  async syncNow(userId: string): Promise<CalendarStatusDto> {
    await this.db.transaction(async (tx) => {
      const connection = await this.repository.findByUser(userId, tx);
      if (!connection) throw new DomainError('CALENDAR_NOT_CONNECTED');
      await this.repository.resume(connection.id, this.clock.now(), tx);
      await this.bus.publish(tx, 'calendar.resyncRequested', { userId });
    });
    return toStatus(await this.repository.findByUser(userId));
  }

  private async connect(userId: string, grant: CalendarGrant): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new DomainError('UNAUTHENTICATED');
    const existing = await this.repository.findByUser(userId);
    const sameAccount = existing?.accountEmail === grant.email;
    const calendarId =
      existing && sameAccount && (await this.stillExists(existing, grant))
        ? existing.calendarId
        : await this.gateways
            .for(PROVIDER)
            .createCalendar(grant.refreshToken, CALENDAR_NAME, user.timezone);
    await this.db.transaction(async (tx) => {
      // A different Google account: its old calendar goes with the old grant
      if (existing && !sameAccount) await this.close(existing, tx);
      await this.repository.save(
        {
          userId,
          provider: PROVIDER,
          accountEmail: grant.email,
          refreshTokenEncrypted: this.cipher.encrypt(grant.refreshToken),
          calendarId,
        },
        this.clock.now(),
        tx,
      );
      await this.bus.publish(tx, 'calendar.resyncRequested', { userId });
    });
  }

  // The user may have deleted the calendar by hand
  private stillExists(connection: CalendarConnectionRow, grant: CalendarGrant): Promise<boolean> {
    return this.gateways.for(connection.provider).calendarExists({
      calendarId: connection.calendarId,
      refreshToken: grant.refreshToken,
    });
  }

  private async close(connection: CalendarConnectionRow, tx: DbExecutor): Promise<void> {
    await this.repository.delete(connection.id, tx);
    await this.bus.publish(tx, 'calendar.connectionClosed', {
      provider: connection.provider,
      calendarId: connection.calendarId,
      refreshTokenEncrypted: connection.refreshTokenEncrypted,
    });
  }

  private async removeCalendar(
    provider: CalendarProvider,
    calendarId: string,
    refreshTokenEncrypted: string,
  ): Promise<void> {
    const refreshToken = this.cipher.decrypt(refreshTokenEncrypted);
    try {
      await this.gateways.for(provider).deleteCalendar({ calendarId, refreshToken });
    } catch (error) {
      if (!(error instanceof CalendarAccessRevoked)) throw error;
    }
    await this.oauth.revoke(refreshToken);
  }
}
