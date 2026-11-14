import type { TaskView } from '../tasks/index.js';
import { eventIdFor, planSync, toCalendarEvent } from './calendar.rules.js';

const TASK: TaskView = {
  id: '019a6f3e-1c2d-7a00-8000-0000000000aa',
  groupId: 'g1',
  title: 'Take out the trash',
  description: 'Blue bags',
  dueAt: new Date('2026-11-20T18:00:00.000Z'),
  assigneeId: 'u1',
  completedAt: null,
};

const OPTIONS = { timeZone: 'Europe/Kyiv', reminderMinutes: 60, appUrl: 'https://errandly.app/' };

describe('calendar rules', () => {
  it('uses the dashless task id as a valid Google event id', () => {
    const id = eventIdFor(TASK.id);

    expect(id).toBe('019a6f3e1c2d7a0080000000000000aa');
    expect(id).toMatch(/^[0-9a-v]{5,1024}$/);
  });

  it('builds a 30-minute event in the assignee zone with a link back', () => {
    expect(toCalendarEvent(TASK, OPTIONS)).toEqual({
      title: 'Take out the trash',
      description: `Blue bags\n\nhttps://errandly.app/g/g1/tasks/${TASK.id}`,
      start: TASK.dueAt,
      end: new Date('2026-11-20T18:30:00.000Z'),
      timeZone: 'Europe/Kyiv',
      reminderMinutes: 60,
      url: `https://errandly.app/g/g1/tasks/${TASK.id}`,
    });
  });

  it('ticks a done task and drops its reminder', () => {
    const event = toCalendarEvent({ ...TASK, completedAt: new Date(), description: ' ' }, OPTIONS);

    expect(event).toMatchObject({ title: '✓ Take out the trash', reminderMinutes: null });
    expect(event.description).toBe(event.url);
  });

  describe('planSync', () => {
    const anya = { connectionId: 'c-anya', externalEventId: 'e1' };
    const bohdan = { connectionId: 'c-bohdan', externalEventId: 'e1' };

    it('moves the event to the new assignee (FR-34)', () => {
      expect(planSync([anya], { id: 'c-bohdan', paused: false })).toEqual({
        remove: [anya],
        upsertOn: 'c-bohdan',
      });
    });

    it('keeps the event where it is and updates it', () => {
      expect(planSync([anya], { id: 'c-anya', paused: false })).toEqual({
        remove: [],
        upsertOn: 'c-anya',
      });
    });

    it('removes every event of an unassigned task or one without a connected calendar', () => {
      expect(planSync([anya, bohdan], null)).toEqual({ remove: [anya, bohdan], upsertOn: null });
    });

    it('leaves a paused calendar alone', () => {
      expect(planSync([anya], { id: 'c-bohdan', paused: true })).toEqual({
        remove: [anya],
        upsertOn: null,
      });
    });
  });
});
