import { LeastLoadRotationStrategy } from './assignment/least-load-rotation.strategy.js';
import { canUndo, localDay, occurrences, taskStatus, toRecurrence } from './tasks.rules.js';

const KYIV = 'Europe/Kyiv';
const DAY = 24 * 60 * 60 * 1000;

function isoList(dates: Date[]): string[] {
  return dates.map((date) => date.toISOString());
}

describe('occurrences', () => {
  const first = new Date('2026-10-22T17:00:00Z'); // Thursday 20:00 in Kyiv (summer time)

  it('keeps the local time across the switch to winter time', () => {
    const dates = occurrences({ type: 'weekly', weekdays: [4] }, first, KYIV, {
      until: new Date('2026-11-06T00:00:00Z'),
    });

    expect(isoList(dates)).toEqual([
      '2026-10-22T17:00:00.000Z',
      '2026-10-29T18:00:00.000Z',
      '2026-11-05T18:00:00.000Z',
    ]);
  });

  it('picks the weekdays on the series clock', () => {
    const lateEvening = new Date('2026-11-02T22:30:00Z'); // Tuesday 00:30 in Kyiv
    const dates = occurrences({ type: 'weekly', weekdays: [2] }, lateEvening, KYIV, {
      until: new Date('2026-11-10T00:00:00Z'),
    });

    expect(isoList(dates)).toEqual(['2026-11-02T22:30:00.000Z', '2026-11-09T22:30:00.000Z']);
  });

  it('repeats daily up to the window end, inclusive', () => {
    const dates = occurrences({ type: 'daily' }, first, KYIV, {
      until: new Date(first.getTime() + 2 * DAY),
    });

    expect(dates).toHaveLength(3);
  });

  it('clamps monthly dates to the end of shorter months', () => {
    const jan31 = new Date('2027-01-31T10:00:00Z');
    const dates = occurrences({ type: 'monthly' }, jan31, KYIV, {
      until: new Date('2027-04-01T00:00:00Z'),
    });

    expect(dates.map((date) => localDay(date, KYIV))).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
    ]);
  });

  it('continues after the materialised end without repeating it', () => {
    const november = new Date('2026-11-10T18:00:00Z');
    const dates = occurrences({ type: 'daily' }, november, KYIV, {
      after: new Date(november.getTime() + DAY),
      until: new Date(november.getTime() + 3 * DAY),
    });

    expect(isoList(dates)).toEqual(['2026-11-12T18:00:00.000Z', '2026-11-13T18:00:00.000Z']);
  });

  it('gives a one-off task a single instance inside the window only', () => {
    expect(occurrences({ type: 'once' }, first, KYIV, { until: first })).toEqual([first]);
    expect(occurrences({ type: 'once' }, first, KYIV, { after: first, until: first })).toEqual([]);
  });
});

describe('task rules', () => {
  const now = new Date('2026-11-13T12:00:00Z');
  const later = new Date('2026-11-14T12:00:00Z');

  it('computes the status in the order done, overdue, unassigned, planned', () => {
    expect(taskStatus({ completedAt: now, dueAt: now, assigneeId: null }, later)).toBe('done');
    expect(taskStatus({ completedAt: null, dueAt: now, assigneeId: 'u1' }, later)).toBe('overdue');
    expect(taskStatus({ completedAt: null, dueAt: later, assigneeId: null }, now)).toBe(
      'unassigned',
    );
    expect(taskStatus({ completedAt: null, dueAt: later, assigneeId: 'u1' }, now)).toBe('planned');
  });

  it('allows undoing within 24 hours', () => {
    expect(canUndo(now, new Date(now.getTime() + DAY))).toBe(true);
    expect(canUndo(now, new Date(now.getTime() + DAY + 1))).toBe(false);
  });

  it('maps a series to its recurrence', () => {
    expect(toRecurrence({ recurrenceType: 'weekly', weekdays: [5, 1] })).toEqual({
      type: 'weekly',
      weekdays: [1, 5],
    });
    expect(toRecurrence({ recurrenceType: 'daily', weekdays: [] })).toEqual({ type: 'daily' });
  });
});

describe('LeastLoadRotationStrategy', () => {
  const strategy = new LeastLoadRotationStrategy();
  const due = new Date('2026-10-03T17:00:00Z');
  const anya = { userId: 'anya', name: 'Аня', absences: [] };
  const bohdan = { userId: 'bohdan', name: 'Богдан', absences: [] };
  const task = { seriesId: 'floor', dueAt: due, timeZone: KYIV };

  function done(assigneeId: string, difficulty: number, daysBefore: number, seriesId = 'other') {
    return { seriesId, assigneeId, difficulty, dueAt: new Date(due.getTime() - daysBefore * DAY) };
  }

  it('gives the task to the member with the lower load (BDD 1)', () => {
    const history = [done('anya', 6, 3), done('bohdan', 3, 3)];

    expect(strategy.pick([anya, bohdan], history, task)).toBe('bohdan');
  });

  it('skips a member who is away on the due day (BDD 2)', () => {
    const away = { ...bohdan, absences: [{ from: '2026-10-01', to: '2026-10-07' }] };

    expect(strategy.pick([anya, away], [done('anya', 6, 3)], task)).toBe('anya');
  });

  it('counts only the 4 weeks before the due date', () => {
    const history = [done('anya', 9, 29), done('bohdan', 1, 1)];

    expect(strategy.pick([anya, bohdan], history, task)).toBe('anya');
  });

  it('breaks a tie by who did this series longest ago, then by name', () => {
    const rotation = [done('anya', 0, 2, 'floor'), done('bohdan', 0, 9, 'floor')];

    expect(strategy.pick([anya, bohdan], rotation, task)).toBe('bohdan');
    expect(strategy.pick([bohdan, anya], [], task)).toBe('anya');
  });

  it('answers null when nobody is available (FR-29)', () => {
    const away = { ...anya, absences: [{ from: '2026-10-03', to: '2026-10-03' }] };

    expect(strategy.pick([away], [], task)).toBeNull();
    expect(strategy.pick([], [], task)).toBeNull();
  });
});
