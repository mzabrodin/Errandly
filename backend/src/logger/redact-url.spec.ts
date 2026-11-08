import { redactUrl } from './redact-url.js';

describe('redactUrl', () => {
  it('hides invite tokens in the path', () => {
    expect(redactUrl('/api/invites/abc123')).toBe('/api/invites/[REDACTED]');
    expect(redactUrl('/api/invites/abc123/accept?x=1')).toBe('/api/invites/[REDACTED]/accept?x=1');
  });

  it('leaves other URLs alone', () => {
    expect(redactUrl('/api/groups/g1/invites')).toBe('/api/groups/g1/invites');
    expect(redactUrl('/api/tasks/t1')).toBe('/api/tasks/t1');
    expect(redactUrl(undefined)).toBeUndefined();
  });
});
