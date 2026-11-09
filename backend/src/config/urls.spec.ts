import { appLink } from './urls.js';

describe('appLink', () => {
  it('joins the app origin, a path and encoded segments', () => {
    expect(appLink('http://localhost:5173', '/verify-email', 'a_b-c')).toBe(
      'http://localhost:5173/verify-email/a_b-c',
    );
  });

  it('ignores a trailing slash on the origin and encodes unsafe characters', () => {
    expect(appLink('https://errandly.app/', '/invite', 'a/b c')).toBe(
      'https://errandly.app/invite/a%2Fb%20c',
    );
  });

  it('builds a link without segments', () => {
    expect(appLink('https://errandly.app', '/settings')).toBe('https://errandly.app/settings');
  });
});
