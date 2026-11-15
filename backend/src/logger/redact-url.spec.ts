import { redactUrl } from './redact-url.js';

describe('redactUrl', () => {
  it('hides invite tokens in the path', () => {
    expect(redactUrl('/api/invites/abc123')).toBe('/api/invites/[REDACTED]');
    expect(redactUrl('/api/invites/abc123/accept?x=1')).toBe('/api/invites/[REDACTED]/accept?x=1');
  });

  it('hides the OAuth code and state of the Google callbacks', () => {
    expect(redactUrl('/api/auth/google/callback?state=s1&code=4/0Ab&scope=email')).toBe(
      '/api/auth/google/callback?state=[REDACTED]&code=[REDACTED]&scope=email',
    );
    expect(redactUrl('/api/me/calendar/callback?code=c1')).toBe(
      '/api/me/calendar/callback?code=[REDACTED]',
    );
  });

  it('leaves other URLs alone', () => {
    expect(redactUrl('/api/groups/g1/invites')).toBe('/api/groups/g1/invites');
    expect(redactUrl('/api/tasks/t1')).toBe('/api/tasks/t1');
    expect(redactUrl(undefined)).toBeUndefined();
  });
});
