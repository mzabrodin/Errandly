import type { ConfigService } from '@nestjs/config';

import { FixedClock } from '../common/clock.js';
import type { EmailTokenPurpose } from '../common/domain.js';
import type { EventBus } from '../common/events/event-bus.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import type { Database } from '../db/database.js';
import type { MailService } from '../mail/index.js';
import type { UserDto, UsersApi } from '../users/index.js';
import { AuthEmails } from './auth-emails.js';
import type { AuthRepository } from './auth.repository.js';
import { hashToken } from './tokens.js';

const NOW = new Date('2026-11-09T12:00:00.000Z');

interface Token {
  userId: string;
  purpose: EmailTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

function setup(user: UserDto | null) {
  const tokens: Token[] = [];
  const sent: { template: string; to: string; data: Record<string, string>; locale: string }[] = [];
  const listeners = new Map<string, (event: { userId: string }) => Promise<void>>();

  const repository = {
    retireEmailTokens: (userId: string, purpose: EmailTokenPurpose, now: Date) => {
      for (const token of tokens) {
        if (token.userId === userId && token.purpose === purpose && token.usedAt === null) {
          token.usedAt = now;
        }
      }
      return Promise.resolve();
    },
    insertEmailToken: (token: Omit<Token, 'usedAt'>) => {
      tokens.push({ ...token, usedAt: null });
      return Promise.resolve();
    },
  };
  const mail = {
    send: (template: string, to: string, data: Record<string, string>, locale: string) => {
      sent.push({ template, to, data, locale });
      return Promise.resolve('id');
    },
  };
  const bus = {
    onAfterCommit: (
      _type: string,
      id: string,
      listener: (event: { userId: string }) => Promise<void>,
    ) => listeners.set(id, listener),
  };
  const config = { get: () => 'https://errandly.app' };
  const db = { transaction: (work: (tx: unknown) => Promise<void>) => work('tx') };

  const emails = new AuthEmails(
    db as unknown as Database,
    repository as unknown as AuthRepository,
    { findById: () => Promise.resolve(user) } as unknown as UsersApi,
    mail as unknown as MailService,
    bus as unknown as EventBus,
    new FixedClock(NOW),
    config as unknown as ConfigService<EnvironmentVariables, true>,
  );
  emails.onModuleInit();
  return { tokens, sent, listeners };
}

const anya = {
  id: 'u1',
  name: 'Anya Kovalenko',
  email: 'anya@errandly.test',
  emailVerified: false,
  timezone: 'Europe/Kyiv',
  locale: 'en',
  avatarUrl: null,
} satisfies UserDto;

describe('AuthEmails', () => {
  it('registers stable listener ids for both emails', () => {
    const { listeners } = setup(anya);

    expect([...listeners.keys()]).toEqual([
      'auth.sendVerificationEmail',
      'auth.sendPasswordResetEmail',
    ]);
  });

  it('sends a fresh verification link in the user language and retires older links', async () => {
    const { listeners, tokens, sent } = setup(anya);
    const send = listeners.get('auth.sendVerificationEmail');

    await send?.({ userId: 'u1' });
    await send?.({ userId: 'u1' });

    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({
      template: 'verifyEmail',
      to: 'anya@errandly.test',
      locale: 'en',
      data: { name: 'Anya Kovalenko' },
    });
    const token = /verify-email\/([\w-]+)$/.exec(sent[1]?.data['url'] ?? '')?.[1] ?? '';
    expect(sent[1]?.data['url']).toBe(`https://errandly.app/verify-email/${token}`);
    expect(tokens.map((t) => t.usedAt === null)).toEqual([false, true]);
    expect(tokens[1]).toMatchObject({
      tokenHash: hashToken(token),
      expiresAt: new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000),
    });
  });

  it('skips verification for a confirmed or deleted account', async () => {
    const confirmed = setup({ ...anya, emailVerified: true });
    await confirmed.listeners.get('auth.sendVerificationEmail')?.({ userId: 'u1' });
    const deleted = setup(null);
    await deleteListener(deleted);

    expect(confirmed.sent).toEqual([]);
    expect(deleted.sent).toEqual([]);
  });

  it('sends a one-hour reset link greeting by first name', async () => {
    const { listeners, tokens, sent } = setup(anya);

    await listeners.get('auth.sendPasswordResetEmail')?.({ userId: 'u1' });

    expect(sent[0]).toMatchObject({ template: 'resetPassword', data: { name: 'Anya' } });
    expect(sent[0]?.data['url']).toMatch(/^https:\/\/errandly\.app\/reset-password\/[\w-]+$/);
    expect(tokens[0]?.expiresAt).toEqual(new Date(NOW.getTime() + 60 * 60 * 1000));
  });
});

async function deleteListener(world: ReturnType<typeof setup>): Promise<void> {
  await world.listeners.get('auth.sendVerificationEmail')?.({ userId: 'u1' });
  await world.listeners.get('auth.sendPasswordResetEmail')?.({ userId: 'u1' });
}
