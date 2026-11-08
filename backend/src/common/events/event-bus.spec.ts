import type { DbExecutor } from '../../db/database.js';
import { FixedClock } from '../clock.js';
import { EventBus } from './event-bus.js';
import type { EventPublicationStore } from './event-publication.store.js';
import type { NewEventPublicationRow } from './event-publications.schema.js';

const tx = {} as DbExecutor;

function setup() {
  const added: NewEventPublicationRow[] = [];
  const store = {
    add: vi.fn<EventPublicationStore['add']>((_executor, rows) => {
      added.push(...rows);
      return Promise.resolve();
    }),
  };
  const clock = new FixedClock('2026-11-09T10:00:00.000Z');
  const bus = new EventBus(store as unknown as EventPublicationStore, clock);
  return { bus, store, added };
}

const memberLeft = { groupId: 'g1', userId: 'u1', removedBy: null };

describe('EventBus', () => {
  it('runs in-transaction listeners with the same transaction, in order', async () => {
    const { bus } = setup();
    const calls: string[] = [];
    bus.onInTransaction('group.memberLeft', (event, executor) => {
      calls.push(`first:${event.userId}:${String(executor === tx)}`);
      return Promise.resolve();
    });
    bus.onInTransaction('group.memberLeft', () => {
      calls.push('second');
      return Promise.resolve();
    });

    await bus.publish(tx, 'group.memberLeft', memberLeft);

    expect(calls).toEqual(['first:u1:true', 'second']);
  });

  it('lets an in-transaction failure reach the publisher, so the change rolls back', async () => {
    const { bus } = setup();
    bus.onInTransaction('group.memberLeft', () => Promise.reject(new Error('cannot redistribute')));

    await expect(bus.publish(tx, 'group.memberLeft', memberLeft)).rejects.toThrow(
      'cannot redistribute',
    );
  });

  it('stores one publication per after-commit listener of the event', async () => {
    const { bus, added } = setup();
    bus.onAfterCommit('task.changed', 'calendar.syncTask', () => Promise.resolve());
    bus.onAfterCommit('task.changed', 'stats.refresh', () => Promise.resolve());
    bus.onAfterCommit('task.deleted', 'calendar.deleteTask', () => Promise.resolve());

    await bus.publish(tx, 'task.changed', { taskId: 't1', groupId: 'g1' });

    expect(added).toEqual([
      {
        listener: 'calendar.syncTask',
        eventType: 'task.changed',
        payload: { taskId: 't1', groupId: 'g1' },
        nextAttemptAt: new Date('2026-11-09T10:00:00.000Z'),
      },
      expect.objectContaining({ listener: 'stats.refresh' }),
    ]);
  });

  it('runs a stored payload through the registered listener', async () => {
    const { bus } = setup();
    const received: string[] = [];
    bus.onAfterCommit('task.deleted', 'calendar.deleteTask', (event) => {
      received.push(event.taskId);
      return Promise.resolve();
    });

    await bus
      .listener('calendar.deleteTask')
      ?.run({ taskId: 't9', groupId: 'g1', assigneeId: null });

    expect(received).toEqual(['t9']);
    expect(bus.listener('unknown')).toBeUndefined();
  });

  it('refuses a duplicate listener id', () => {
    const { bus } = setup();
    bus.onAfterCommit('task.changed', 'calendar.syncTask', () => Promise.resolve());

    expect(() =>
      bus.onAfterCommit('task.assigned', 'calendar.syncTask', () => Promise.resolve()),
    ).toThrow('registered twice');
  });
});
