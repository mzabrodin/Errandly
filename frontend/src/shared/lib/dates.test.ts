import { groupByDay } from './dates';

describe('groupByDay', () => {
  it('groups consecutive items by calendar day', () => {
    const items = [new Date(2026, 9, 25, 9), new Date(2026, 9, 25, 20), new Date(2026, 9, 26, 8)];
    const groups = groupByDay(items, (item) => item);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.items).toHaveLength(2);
    expect(groups[1]?.day).toEqual(new Date(2026, 9, 26));
  });
});
