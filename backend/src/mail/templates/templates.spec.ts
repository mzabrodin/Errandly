import { renderSample, renderTemplate, templateNames, validateTemplateData } from './index.js';
import { MAIL_LOCALES } from './locale.js';

describe('mail templates', () => {
  const cases = templateNames.flatMap((name) =>
    MAIL_LOCALES.map((locale) => [name, locale] as const),
  );

  it.each(cases)('renders the %s sample in %s', (name, locale) => {
    const mail = renderSample(name, locale);
    expect(mail.subject.length).toBeGreaterThan(0);
    expect(mail.html).toContain('errandly');
    expect(mail.html).toContain(`<html lang="${locale}">`);
    expect(mail.text).toContain('http://localhost:5173/');
  });

  it('defaults to Ukrainian and renders English on request', () => {
    expect(renderSample('verifyEmail').subject).toBe('Підтвердіть email в Errandly');
    const english = renderSample('verifyEmail', 'en');
    expect(english.subject).toBe('Verify your email for Errandly');
    expect(english.html).toContain('a NaUKMA student project');
    expect(english.text).toContain('Verify email: http://localhost:5173/verify-email/demo-token');
  });

  it('escapes user data in html', () => {
    const mail = renderTemplate('invite', {
      inviterName: '<script>alert(1)</script>',
      groupName: 'Room "12"',
      url: 'http://localhost:5173/invite/x',
    });
    expect(mail.html).not.toContain('<script>alert(1)</script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('Room &quot;12&quot;');
  });

  it('formats due date in the user timezone', () => {
    const mail = renderTemplate('taskAssigned', {
      name: 'Anya',
      groupName: 'Room 12',
      taskTitle: 'Wash the dishes',
      dueAt: '2026-10-26T18:00:00.000Z',
      difficulty: 1,
      url: 'http://localhost:5173/g/1/tasks/2',
      timezone: 'Europe/Kyiv',
    });
    expect(mail.html).toContain('20:00');
  });

  it('rejects non-http links and missing fields', () => {
    expect(
      validateTemplateData('verifyEmail', {
        name: 'Anya',
        url: 'javascript:alert(1)',
      }),
    ).toEqual(['url must be a valid url']);
    expect(validateTemplateData('invite', {})).toHaveLength(3);
    expect(validateTemplateData('taskAssigned', {})).not.toContain('settingsUrl is required');
  });
});
