import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import type { Test } from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';

import { LIMITS } from '../src/common/domain.js';
import { users } from '../src/users/users.schema.js';
import { createUser, signIn } from './support/factories.js';
import { createTestApp, type TestApp } from './support/test-app.js';

const GOOGLE = 'https://lh3.googleusercontent.com/a/photo';
const AVATAR_URL = /^\/api\/avatars\/[0-9a-f-]{36}\.webp$/;

function photo(color = '#e6f36b'): Promise<Buffer> {
  return sharp({ create: { width: 400, height: 300, channels: 3, background: color } })
    .jpeg()
    .toBuffer();
}

function upload(agent: TestAgent, image: Buffer): Test {
  return agent.post('/api/me/avatar').attach('file', image, 'me.jpg');
}

describe('Avatars (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
  });

  afterAll(async () => {
    await t.close();
  });

  it('stores an upload as a 256×256 WebP that anyone can load and cache', async () => {
    const agent = await signIn(t, (await createUser(t.db)).email);

    const { body } = await upload(agent, await photo()).expect(200);

    expect(body.avatarUrl).toMatch(AVATAR_URL);
    const image = await t
      .agent()
      .get(body.avatarUrl)
      .expect(200)
      .expect('Content-Type', 'image/webp')
      .expect('Cache-Control', 'public, max-age=31536000, immutable');
    expect(Buffer.isBuffer(image.body)).toBe(true);
    await expect(sharp(image.body).metadata()).resolves.toMatchObject({
      format: 'webp',
      width: 256,
      height: 256,
    });
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.avatarUrl).toBe(body.avatarUrl);
  });

  it('deletes the replaced photo after commit', async () => {
    const agent = await signIn(t, (await createUser(t.db)).email);
    const first = (await upload(agent, await photo()).expect(200)).body.avatarUrl;

    const second = (await upload(agent, await photo('#3366ff')).expect(200)).body.avatarUrl;

    expect(second).not.toBe(first);
    await t.agent().get(first).expect(200);
    await t.deliverEvents();
    await t.agent().get(first).expect(404).expect({ code: 'NOT_FOUND' });
    await t.agent().get(second).expect(200);
  });

  it('falls back to the sign-in provider photo, then to none', async () => {
    const user = await createUser(t.db);
    const agent = await signIn(t, user.email);
    await upload(agent, await photo()).expect(200);

    await t.db.update(users).set({ providerAvatarUrl: GOOGLE }).where(eq(users.id, user.id));
    await agent
      .delete('/api/me/avatar')
      .expect(200)
      .expect((response) => {
        expect(response.body.avatarUrl).toBe(GOOGLE);
      });

    await t.db.update(users).set({ providerAvatarUrl: null }).where(eq(users.id, user.id));
    const me = await agent.delete('/api/me/avatar').expect(200);
    expect(me.body.avatarUrl).toBeNull();
  });

  it('rejects missing, oversized and non-image files', async () => {
    const agent = await signIn(t, (await createUser(t.db)).email);

    await agent
      .post('/api/me/avatar')
      .expect(400)
      .expect({ code: 'VALIDATION', fields: { file: 'required' } });
    await agent
      .post('/api/me/avatar')
      .attach('file', Buffer.from('#!/bin/sh\necho hi\n'), 'me.jpg')
      .expect(400)
      .expect({ code: 'VALIDATION', fields: { file: 'type' } });
    await agent
      .post('/api/me/avatar')
      .attach('file', Buffer.alloc(LIMITS.avatarBytes + 1), 'big.jpg')
      .expect(413)
      .expect({ code: 'FILE_TOO_LARGE' });
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.avatarUrl).toBeNull();
  });

  it('needs a session to change the photo, but not to load one', async () => {
    await t.agent().post('/api/me/avatar').expect(401);
    await t.agent().delete('/api/me/avatar').expect(401);
    await t.agent().get('/api/avatars/not-a-key').expect(404);
    await t.agent().get('/api/avatars/0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b.webp').expect(404);
  });

  it('answers 500 and keeps the old photo when the storage is down', async () => {
    const agent = await signIn(t, (await createUser(t.db)).email);
    const before = (await upload(agent, await photo()).expect(200)).body.avatarUrl;

    t.storage.failNext();
    await upload(agent, await photo('#3366ff')).expect(500);

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.avatarUrl).toBe(before);
  });

  it('deletes the photo with the account, retrying while the storage is down', async () => {
    const user = await createUser(t.db);
    const agent = await signIn(t, user.email);
    const url = (await upload(agent, await photo()).expect(200)).body.avatarUrl;

    await agent.delete('/api/me').expect(204);
    t.storage.failNext();
    await t.deliverEvents();
    await t.agent().get(url).expect(200);

    t.clock.advance(30 * 1000);
    await t.deliverEvents();
    await t.agent().get(url).expect(404);
  });

  it('shows the photo to the other members of a group', async () => {
    const anya = await signIn(t, (await createUser(t.db, { name: 'Anya' })).email);
    const url = (await upload(anya, await photo()).expect(200)).body.avatarUrl;

    const { body: group } = await anya.post('/api/groups').send({ name: 'Room 12' }).expect(201);
    const { body } = await anya.get(`/api/groups/${group.id}`).expect(200);

    expect(body.members).toEqual([expect.objectContaining({ name: 'Anya', avatarUrl: url })]);
  });
});
