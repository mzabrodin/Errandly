import { EventBus } from '../src/common/events/event-bus.js';
import { EventDispatcher } from '../src/common/events/event-dispatcher.js';
import { EventPublicationStore } from '../src/common/events/event-publication.store.js';
import { createTestApp, type TestApp } from './support/test-app.js';

const noop = (): void => undefined;

describe('Graceful shutdown (integration)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reset();
  });

  it('refuses new requests, finishes the delivery in flight, then closes the pool', async () => {
    const bus = t.app.get(EventBus);
    const store = t.app.get(EventPublicationStore);
    const complete = vi.spyOn(store, 'complete');
    const handBack = vi.spyOn(store, 'release');
    const steps: string[] = [];
    let release = noop;
    bus.onAfterCommit('user.avatarDiscarded', 'test.slowListener', async () => {
      steps.push('delivery started');
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      steps.push('delivery done');
    });
    await t.db.transaction((tx) => bus.publish(tx, 'user.avatarDiscarded', { key: 'gone.webp' }));

    const tick = t.app.get(EventDispatcher).tick();
    await vi.waitFor(() => expect(steps).toContain('delivery started'));
    const closing = t.close().then(() => steps.push('closed'));

    await vi.waitFor(async () => {
      const response = await t.agent().get('/api/health/live');
      expect(response.status).toBe(503);
      expect(response.body).toEqual({ code: 'SERVICE_UNAVAILABLE' });
    });
    expect(steps).not.toContain('closed');

    release();
    await Promise.all([tick, closing]);

    expect(steps).toEqual(['delivery started', 'delivery done', 'closed']);
    const handled = [
      ...complete.mock.calls.map(([id]) => id),
      ...handBack.mock.calls.flatMap(([ids]) => ids),
    ];
    expect(new Set(handled).size).toBe(2);
    await expect(
      Promise.all([...complete.mock.results, ...handBack.mock.results].map(({ value }) => value)),
    ).resolves.toBeDefined();
  });
});
