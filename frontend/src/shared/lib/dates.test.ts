import {
  addDays,
  deviceTimeZone,
  formatTime,
  fromLocalInputValue,
  groupByDay,
  isSameDay,
  setDisplayTimeZone,
  startOfDay,
  toDateInputValue,
  toIso,
  toLocalInputValue,
  weekRange,
} from './dates';

afterEach(() => setDisplayTimeZone(deviceTimeZone()));

describe('groupByDay', () => {
  it('groups consecutive items by calendar day', () => {
    const items = [new Date(2026, 9, 25, 9), new Date(2026, 9, 25, 20), new Date(2026, 9, 26, 8)];
    const groups = groupByDay(items, (item) => item);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.items).toHaveLength(2);
    expect(groups[1]?.day.getTime()).toBe(new Date(2026, 9, 26).getTime());
  });
});

describe('the profile time zone', () => {
  it('formats times on the profile clock, not the browser one', () => {
    setDisplayTimeZone('America/New_York');
    expect(formatTime('2026-10-26T18:00:00.000Z')).toBe('14:00');
    setDisplayTimeZone('Asia/Tokyo');
    expect(formatTime('2026-10-26T18:00:00.000Z')).toBe('03:00');
  });

  it('draws day boundaries at the profile midnight', () => {
    setDisplayTimeZone('America/New_York');
    const lateEvening = '2026-10-26T02:00:00.000Z';

    expect(toDateInputValue(lateEvening)).toBe('2026-10-25');
    expect(isSameDay(lateEvening, '2026-10-25T12:00:00.000Z')).toBe(true);
    expect(toIso(startOfDay(lateEvening))).toBe('2026-10-25T04:00:00.000Z');
  });

  it('starts weeks on the profile Monday', () => {
    setDisplayTimeZone('Pacific/Auckland');
    // Sunday noon in UTC is already Monday 01:00 in Auckland
    const { from, to } = weekRange('2026-10-25T12:00:00.000Z');

    expect(toIso(from)).toBe('2026-10-25T11:00:00.000Z');
    expect(toIso(to)).toBe('2026-11-01T11:00:00.000Z');
  });

  it('keeps the wall-clock time across a DST change', () => {
    setDisplayTimeZone('America/New_York');
    const saturdayEvening = '2026-11-01T00:00:00.000Z';

    expect(toIso(addDays(saturdayEvening, 1))).toBe('2026-11-02T01:00:00.000Z');
    expect(formatTime(addDays(saturdayEvening, 1))).toBe('20:00');
  });

  it('reads date-only values as calendar days', () => {
    setDisplayTimeZone('America/New_York');
    expect(toDateInputValue('2026-10-01')).toBe('2026-10-01');
  });

  it('round-trips a datetime-local value through the profile zone', () => {
    setDisplayTimeZone('America/New_York');
    const due = fromLocalInputValue('2026-10-26T20:00');

    expect(toIso(due)).toBe('2026-10-27T00:00:00.000Z');
    expect(toLocalInputValue(due)).toBe('2026-10-26T20:00');
    expect(Number.isNaN(fromLocalInputValue('tomorrow').getTime())).toBe(true);
  });
});
