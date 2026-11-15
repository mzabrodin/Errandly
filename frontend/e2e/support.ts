import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';

export const PASSWORD = 'Pass1234';
const MAILPIT_URL = process.env['MAILPIT_URL'] ?? 'http://localhost:8025';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Account {
  id: string;
  name: string;
  email: string;
  page: Page;
}

export function uniqueEmail(name: string): string {
  return `${name.toLowerCase()}.${randomUUID().slice(0, 8)}@e2e.errandly.dev`;
}

/** The app path (`/verify-email/<token>`, `/invite/<token>`…) from the newest email to this address */
export async function linkFromEmail(
  request: APIRequestContext,
  to: string,
  prefix: string,
): Promise<string> {
  const pattern = new RegExp(`${prefix}/[\\w-]+`);
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const search = await request.get(`${MAILPIT_URL}/api/v1/search`, {
          params: { query: `to:"${to}"` },
        });
        const { messages } = (await search.json()) as { messages: { ID: string }[] };
        if (messages[0] === undefined) return undefined;
        const message = await request.get(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`);
        const { Text } = (await message.json()) as { Text: string };
        link = pattern.exec(Text)?.[0];
        return link;
      },
      { message: `an email to ${to} with a ${prefix} link`, timeout: 20_000 },
    )
    .toBeDefined();
  return link ?? '';
}

async function call<T>(
  request: APIRequestContext,
  method: 'POST' | 'GET',
  path: string,
  data?: object,
): Promise<T> {
  const response = await request.fetch(path, { method, data });
  expect(response.ok(), `${method} ${path} → ${response.status()}`).toBe(true);
  return (await response.json()) as T;
}

/** A signed-in user in a browser context of their own, set up through the API */
export async function signUp(
  browser: Browser,
  name: string,
  { verified = true } = {},
): Promise<Account> {
  const context = await browser.newContext();
  const email = uniqueEmail(name);
  const { id } = await call<{ id: string }>(context.request, 'POST', '/api/auth/register', {
    name,
    email,
    password: PASSWORD,
    locale: 'en',
  });
  if (verified) {
    const token = (await linkFromEmail(context.request, email, '/verify-email')).split('/').pop();
    await call(context.request, 'POST', '/api/auth/verify-email', { token });
  }
  return { id, name, email, page: await context.newPage() };
}

export async function createGroup(admin: Account, name: string): Promise<string> {
  const { id } = await call<{ id: string }>(admin.page.request, 'POST', '/api/groups', { name });
  return id;
}

export async function join(admin: Account, member: Account, groupId: string): Promise<void> {
  const { url } = await call<{ url: string }>(
    admin.page.request,
    'POST',
    `/api/groups/${groupId}/invites`,
    {},
  );
  await call(member.page.request, 'POST', `/api/invites/${url.split('/').pop() ?? ''}/accept`);
}

export async function createTask(
  admin: Account,
  groupId: string,
  title: string,
  assignee: Account,
): Promise<string> {
  const { id } = await call<{ id: string }>(
    admin.page.request,
    'POST',
    `/api/groups/${groupId}/tasks`,
    {
      title,
      description: '',
      dueAt: new Date(Date.now() + 2 * DAY_MS).toISOString(),
      difficulty: 2,
      recurrence: { type: 'once' },
      assigneeId: assignee.id,
    },
  );
  return id;
}
