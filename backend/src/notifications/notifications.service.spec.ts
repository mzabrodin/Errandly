import { FixedClock } from '../common/clock.js';
import type { NotificationsRepository } from './notifications.repository.js';
import type { NotificationRow } from './notifications.schema.js';
import { NotificationsService } from './notifications.service.js';

const NOW = new Date('2026-11-15T12:00:00Z');

function row(id: string, readAt: Date | null): NotificationRow {
  return {
    id,
    userId: 'anya',
    type: 'taskAssigned',
    groupId: 'g1',
    taskId: 't1',
    data: { taskTitle: 'Trash' },
    readAt,
    createdAt: new Date('2026-11-14T09:00:00Z'),
  };
}

describe('NotificationsService', () => {
  it('lists the newest 50 and counts the unread among them', async () => {
    const latest = vi
      .fn<NotificationsRepository['latest']>()
      .mockResolvedValue([row('n2', null), row('n1', NOW)]);
    const service = new NotificationsService(
      { latest } as unknown as NotificationsRepository,
      new FixedClock(NOW),
    );

    await expect(service.list('anya')).resolves.toEqual({
      items: [
        {
          id: 'n2',
          type: 'taskAssigned',
          createdAt: '2026-11-14T09:00:00.000Z',
          read: false,
          groupId: 'g1',
          taskId: 't1',
          data: { taskTitle: 'Trash' },
        },
        expect.objectContaining({ id: 'n1', read: true }),
      ],
      unread: 1,
    });
    expect(latest).toHaveBeenCalledWith('anya', 50);
  });

  it('marks as read at the current time', async () => {
    const markRead = vi.fn<NotificationsRepository['markRead']>().mockResolvedValue();
    const service = new NotificationsService(
      { markRead } as unknown as NotificationsRepository,
      new FixedClock(NOW),
    );

    await service.markRead('anya', ['n1']);

    expect(markRead).toHaveBeenCalledWith('anya', ['n1'], NOW);
  });
});
