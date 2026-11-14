import type { GoogleClients } from '../google/google-clients.js';
import { CalendarGateways } from './calendar-gateways.js';
import { GoogleCalendarGateway } from './google-calendar.gateway.js';

describe('CalendarGateways', () => {
  it('picks the gateway of the connection provider', () => {
    const google = new GoogleCalendarGateway({} as GoogleClients);
    expect(new CalendarGateways(google).for('google')).toBe(google);
  });
});
