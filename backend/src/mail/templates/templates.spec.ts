import { renderSample, renderTemplate, templateNames, validateTemplateData } from './index.js';

describe('mail templates', () => {
  it.each(templateNames)('renders %s sample', (name) => {
    const mail = renderSample(name);
    expect(mail.subject.length).toBeGreaterThan(0);
    expect(mail.html).toContain('errandly');
    expect(mail.text).toContain('http://localhost:5173/');
  });

  it('escapes user data in html', () => {
    const mail = renderTemplate('invite', {
      inviterName: '<script>alert(1)</script>',
      groupName: 'Кімната "12"',
      url: 'http://localhost:5173/invite/x',
    });
    expect(mail.html).not.toContain('<script>alert(1)</script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('Кімната &quot;12&quot;');
  });

  it('formats due date in the user timezone', () => {
    const mail = renderTemplate('taskAssigned', {
      name: 'Аня',
      groupName: 'Кімната 12',
      taskTitle: 'Помити посуд',
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
        name: 'Аня',
        url: 'javascript:alert(1)',
      }),
    ).toEqual(['url must be a valid url']);
    expect(validateTemplateData('invite', {})).toHaveLength(3);
    expect(validateTemplateData('taskAssigned', {})).not.toContain('settingsUrl is required');
  });
});
