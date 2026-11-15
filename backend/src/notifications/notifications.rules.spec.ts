import { REMINDER_MINUTES } from '../common/domain.js';
import type { TaskView } from '../tasks/index.js';
import {
  assignmentRecipients,
  digestWeek,
  isDueSoon,
  purgeCutoffs,
  reminderMinutesOption,
  summarizeWeek,
} from './notifications.rules.js';

const KYIV = 'Europe/Kyiv';
const MINUTE = 60_000;

function assigned(overrides: Partial<Parameters<typeof assignmentRecipients>[0]> = {}) {
  return {
    taskId: 't1',
    groupId: 'g1',
    assigneeId: 'bohdan',
    previousAssigneeId: null,
    actorId: null,
    bulk: false,
    ...overrides,
  };
}

function task(overrides: Partial<TaskView>): TaskView {
  return {
    id: 't',
    groupId: 'g1',
    title: 'Trash',
    description: '',
    dueAt: new Date('2026-11-18T18:00:00Z'),
    difficulty: 2,
    assigneeId: 'anya',
    completedAt: null,
    ...overrides,
  };
}

describe('purgeCutoffs', () => {
  it('keeps read notifications 30 days, any 90, reminder records 7 and digest records 4 weeks', () => {
    expect(purgeCutoffs(new Date('2026-11-15T03:00:00Z'))).toEqual({
      readBefore: new Date('2026-10-16T03:00:00Z'),
      before: new Date('2026-08-17T03:00:00Z'),
      remindersBefore: new Date('2026-11-08T03:00:00Z'),
      digestsBefore: '2026-10-18',
    });
  });
});

describe('assignmentRecipients', () => {
  it('tells the new and the previous assignee, but not whoever did it', () => {
    expect(assignmentRecipients(assigned({ previousAssigneeId: 'anya' }), [])).toEqual([
      { userId: 'bohdan', type: 'taskAssigned' },
      { userId: 'anya', type: 'taskUnassigned' },
    ]);
    expect(
      assignmentRecipients(assigned({ previousAssigneeId: 'anya', actorId: 'anya' }), []),
    ).toEqual([{ userId: 'bohdan', type: 'taskAssigned' }]);
    expect(assignmentRecipients(assigned({ actorId: 'bohdan' }), [])).toEqual([]);
  });

  it('stays quiet about bulk instances', () => {
    expect(assignmentRecipients(assigned({ bulk: true }), ['anya'])).toEqual([]);
  });

  it('tells the admins when nobody could take the task, bulk or not (FR-29)', () => {
    const event = assigned({ assigneeId: null, bulk: true, actorId: 'anya' });

    expect(assignmentRecipients(event, ['anya', 'olena'])).toEqual([
      { userId: 'olena', type: 'taskNoAssignee' },
    ]);
  });
});

describe('reminders', () => {
  const now = new Date('2026-11-16T10:00:00Z');

  it.each(REMINDER_MINUTES)('is due soon within %d minutes and not before', (minutes) => {
    expect(isDueSoon(new Date(now.getTime() + minutes * MINUTE), minutes, now)).toBe(true);
    expect(isDueSoon(new Date(now.getTime() + (minutes + 1) * MINUTE), minutes, now)).toBe(false);
    expect(isDueSoon(now, minutes, now)).toBe(false);
  });

  it('falls back to a day for a reminder time the settings do not offer', () => {
    expect(reminderMinutesOption(180)).toBe(180);
    expect(reminderMinutesOption(45)).toBe(1440);
  });
});

describe('digestWeek', () => {
  it('starts on Monday at 09:00 local time', () => {
    expect(digestWeek(new Date('2026-11-16T06:59:00Z'), KYIV)).toBeNull();
    expect(digestWeek(new Date('2026-11-16T07:00:00Z'), KYIV)).toEqual({
      weekStart: '2026-11-16',
      lastWeekFrom: new Date('2026-11-08T22:00:00Z'),
      lastWeekTo: new Date('2026-11-15T22:00:00Z'),
      until: new Date('2026-11-23T07:00:00Z'),
    });
    expect(digestWeek(new Date('2026-11-17T07:00:00Z'), KYIV)).toBeNull();
  });

  it('follows the user’s zone and its summer time', () => {
    expect(digestWeek(new Date('2026-11-16T07:00:00Z'), 'Europe/London')).toBeNull();
    expect(digestWeek(new Date('2026-11-16T09:00:00Z'), 'Europe/London')?.weekStart).toBe(
      '2026-11-16',
    );
    expect(digestWeek(new Date('2026-03-30T06:00:00Z'), KYIV)?.weekStart).toBe('2026-03-30');
  });
});

describe('summarizeWeek', () => {
  it('counts last week per group and lists the open tasks ahead', () => {
    const week = {
      lastWeekFrom: new Date('2026-11-08T22:00:00Z'),
      lastWeekTo: new Date('2026-11-15T22:00:00Z'),
      until: new Date('2026-11-23T07:00:00Z'),
    };
    const now = new Date('2026-11-16T07:00:00Z');
    const ahead = task({ id: 'ahead', dueAt: new Date('2026-11-18T18:00:00Z') });

    const summary = summarizeWeek(
      [
        task({ id: 'done', dueAt: new Date('2026-11-10T18:00:00Z'), completedAt: now }),
        task({ id: 'late', dueAt: new Date('2026-11-12T18:00:00Z') }),
        ahead,
        task({ id: 'far', dueAt: new Date('2026-11-25T18:00:00Z') }),
        task({
          id: 'other',
          groupId: 'g2',
          dueAt: new Date('2026-11-11T18:00:00Z'),
          completedAt: now,
        }),
      ],
      week,
      now,
    );

    expect(summary).toEqual([
      { groupId: 'g1', done: 1, overdue: 1, upcoming: [ahead] },
      { groupId: 'g2', done: 1, overdue: 0, upcoming: [] },
    ]);
  });
});
