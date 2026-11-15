import { LOCALES, REMINDER_MINUTES } from '../../common/domain.js';
import { renderSample, renderTemplate, templateNames } from './index.js';

const task = {
  name: 'Anya',
  groupName: 'Room 12',
  taskTitle: 'Wash the dishes',
  dueAt: '2026-10-26T18:00:00.000Z',
  difficulty: 1,
  url: 'http://localhost:5173/g/1/tasks/2',
};

const hostile = '<script>alert(1)</script> <b>bold</b> "quoted" & A&amp;B';

function digest(tasks: number) {
  return {
    name: 'Anya',
    url: 'http://localhost:5173',
    settingsUrl: 'http://localhost:5173/settings',
    groups: [
      {
        name: 'Room 12',
        done: 2,
        overdue: 1,
        tasks: Array.from({ length: tasks }, (_, index) => ({
          title: `Task ${index}`,
          dueAt: task.dueAt,
          difficulty: 1,
          url: `http://localhost:5173/g/1/tasks/${index}`,
        })),
      },
    ],
  };
}

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

  it('names whoever assigned the task by hand', async () => {
    const auto = await renderTemplate('taskAssigned', task, 'en');
    const manual = await renderTemplate('taskAssigned', { ...task, actorName: 'Bohdan' }, 'en');

    expect(auto.text).toContain('The system picked you');
    expect(manual.text).toContain('Bohdan assigned you a task');
    expect(manual.text).not.toContain('The system picked you');
  });

  it('counts the week’s tasks in the digest subject with plural forms', async () => {
    expect((await renderTemplate('weeklyDigest', digest(1))).subject).toBe('Ваш тиждень: 1 задача');
    expect((await renderTemplate('weeklyDigest', digest(3))).subject).toBe('Ваш тиждень: 3 задачі');
    expect((await renderTemplate('weeklyDigest', digest(5))).subject).toBe('Ваш тиждень: 5 задач');
    const empty = await renderTemplate('weeklyDigest', digest(0), 'en');
    expect(empty.subject).toBe('Your week: 0 tasks');
    expect(empty.text).toContain('Last week: 2 done, 1 overdue.');
    expect(empty.text).toContain('No tasks this week.');
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

describe('template data', () => {
  it('rejects non-http links, missing fields and unknown time zones', async () => {
    await expect(
      renderTemplate('verifyEmail', { name: 'Anya', url: 'javascript:alert(1)' }),
    ).rejects.toThrow('must be an http(s) URL');
    await expect(renderTemplate('invite', {} as never)).rejects.toThrow('inviterName');
    await expect(
      renderTemplate('taskAssigned', { ...task, timezone: 'Mars/Base' }),
    ).rejects.toThrow('must be an IANA time zone');
  });

  it('takes only the email reminder times the settings offer', async () => {
    await expect(
      renderTemplate('taskDueSoon', { ...task, reminderMinutes: 45 } as never),
    ).rejects.toThrow('reminderMinutes');
    for (const minutes of REMINDER_MINUTES) {
      // oxlint-disable-next-line no-await-in-loop -- one template render per allowed value
      await expect(
        renderTemplate('taskDueSoon', { ...task, reminderMinutes: minutes }),
      ).resolves.toHaveProperty('subject');
    }
  });
});
