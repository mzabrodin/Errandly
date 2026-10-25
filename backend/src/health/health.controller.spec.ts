import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('returns ok status', () => {
    expect(new HealthController().check()).toEqual({ status: 'ok' });
  });
});
