import type { CalendarConnectionRow } from '../calendar.schema.js';
import { CalendarGateways } from './calendar-gateways.js';
import { GoogleCalendarGateway } from './google-calendar.gateway.js';

describe('CalendarGateways', () => {
  it('picks the gateway of the connection provider', () => {
    const google = new GoogleCalendarGateway();
    expect(new CalendarGateways(google).for('google')).toBe(google);
  });

  it('Google sync is not implemented yet, so the dispatcher will retry and give up', async () => {
    const google = new GoogleCalendarGateway();
    const connection = {} as CalendarConnectionRow;
    const event = {
      title: 'Wash the dishes',
      description: '',
      start: new Date(),
      end: new Date(),
      url: 'http://localhost:5173/g/1/tasks/2',
    };

    await expect(google.upsertEvent(connection, event, null)).rejects.toThrow('not implemented');
    await expect(google.deleteEvent(connection, 'evt')).rejects.toThrow('not implemented');
  });
});
