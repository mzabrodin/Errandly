import { LOCALES, REMINDER_MINUTES } from '../../common/domain.js';
import { parseTemplateData, renderSample, renderTemplate, templateNames } from './index.js';

const task = {
  name: 'Anya',
  groupName: 'Room 12',
  taskTitle: 'Wash the dishes',
  dueAt: '2026-10-26T18:00:00.000Z',
  difficulty: 1,
  url: 'http://localhost:5173/g/1/tasks/2',
};

const hostile = '<script>alert(1)</script> <b>bold</b> "quoted" & A&amp;B';

describe('mail templates', () => {
  const cases = templateNames.flatMap((name) => LOCALES.map((locale) => [name, locale] as const));

  it.each(cases)('renders the %s sample in %s', async (name, locale) => {
    const mail = await renderSample(name, locale);

    expect(mail.subject.length).toBeGreaterThan(0);
    expect(mail.html).toContain(`lang="${locale}"`);
    expect(mail.html).toContain('errandly');
    expect(mail.text).toContain('http://localhost:5173/');
    expect(mail.text).not.toMatch(/<[a-z]/);
  });

  it('defaults to Ukrainian and renders English on request', async () => {
    expect((await renderSample('verifyEmail')).subject).toBe('Підтвердіть email в Errandly');

    const english = await renderSample('verifyEmail', 'en');

    expect(english.subject).toBe('Verify your email for Errandly');
    expect(english.html).toContain('a NaUKMA student project');
    expect(english.text).toContain('Verify email → http://localhost:5173/verify-email/demo-token');
  });

  it('turns <b> in the copy into <strong>', async () => {
    const mail = await renderSample('verifyEmail', 'en');

    expect(mail.html).toMatch(/<strong[^>]*>one step left<\/strong>/);
    expect(mail.text).toContain('There’s one step left: confirm');
  });

  it('escapes user data exactly once and never reads it as markup', async () => {
    const mail = await renderTemplate('invite', {
      inviterName: hostile,
      groupName: hostile,
      url: 'http://localhost:5173/invite/x',
    });

    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('<b>bold');
    expect(mail.html).toContain(
      '&lt;script&gt;alert(1)&lt;/script&gt; &lt;b&gt;bold&lt;/b&gt; &quot;quoted&quot; &amp; A&amp;amp;B',
    );
    expect(mail.subject).toContain(hostile);
    expect(mail.text).toContain(hostile);
  });

  it('shows the due date in the recipient time zone', async () => {
    const kyiv = await renderTemplate('taskAssigned', { ...task, timezone: 'Europe/Kyiv' });
    const london = await renderTemplate('taskAssigned', { ...task, timezone: 'Europe/London' });

    expect(kyiv.text).toContain('20:00');
    expect(london.text).toContain('18:00');
  });

  it.each([
    [15, 'менше 15 хвилин', 'less than 15 minutes'],
    [60, 'менше 1 години', 'less than 1 hour'],
    [180, 'менше 3 годин', 'less than 3 hours'],
    [1440, 'менше 1 доби', 'less than 1 day'],
  ] as const)('says how soon a task is due %d minutes ahead', async (minutes, uk, en) => {
    const data = { ...task, reminderMinutes: minutes };

    expect((await renderTemplate('taskDueSoon', data)).text).toContain(uk);
    expect((await renderTemplate('taskDueSoon', data, 'en')).text).toContain(en);
  });

  it('links the notification settings only when given', async () => {
    const withLink = await renderTemplate('taskOverdue', {
      ...task,
      settingsUrl: 'http://localhost:5173/settings',
    });
    const without = await renderTemplate('taskOverdue', task);

    expect(withLink.text).toContain('Налаштувати сповіщення http://localhost:5173/settings');
    expect(without.text).not.toContain('Налаштувати сповіщення');
  });
});

describe('parseTemplateData', () => {
  it('accepts valid data', () => {
    expect(parseTemplateData('taskAssigned', task)).toEqual({
      data: { ...task, timezone: 'Europe/Kyiv' },
    });
  });

  it('rejects non-http links, missing fields and unknown time zones', () => {
    expect(parseTemplateData('verifyEmail', { name: 'Anya', url: 'javascript:alert(1)' })).toEqual({
      errors: ['url: must be an http(s) URL'],
    });
    expect(parseTemplateData('invite', {})).toMatchObject({ errors: { length: 3 } });
    expect(parseTemplateData('taskAssigned', { ...task, timezone: 'Mars/Base' })).toEqual({
      errors: ['timezone: must be an IANA time zone'],
    });
  });

  it('takes only the email reminder times the settings offer', () => {
    expect(parseTemplateData('taskDueSoon', { ...task, reminderMinutes: 45 })).toHaveProperty(
      'errors',
    );
    for (const minutes of REMINDER_MINUTES) {
      expect(
        parseTemplateData('taskDueSoon', { ...task, reminderMinutes: minutes }),
      ).toHaveProperty('data');
    }
  });
});
