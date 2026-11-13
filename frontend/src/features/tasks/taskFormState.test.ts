import { deviceTimeZone, setDisplayTimeZone } from '../../shared/lib/dates';
import { initialState, toTaskInput, withDueAt } from './taskFormState';

afterEach(() => setDisplayTimeZone(deviceTimeZone()));

describe('task form state', () => {
  it('reads the due time on the profile clock', () => {
    setDisplayTimeZone('America/New_York');
    const state = { ...initialState(null), title: 'Trash', dueAt: '2026-10-26T20:00' };

    expect(toTaskInput(state).dueAt).toBe('2026-10-27T00:00:00.000Z');
  });

  it('follows the due weekday until weekdays are picked by hand', () => {
    const state = initialState(null);

    // 26 October 2026 is a Monday, 29 October a Thursday
    expect(withDueAt(state, '2026-10-29T20:00', false).weekdays).toEqual([4]);
    expect(withDueAt({ ...state, weekdays: [1] }, '2026-10-29T20:00', true).weekdays).toEqual([1]);
  });
});
