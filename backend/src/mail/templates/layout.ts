import { escapeHtml } from './escape.js';
import { theme as c } from './theme.js';

export interface TaskCardData {
  title: string;
  groupName: string;
  when: string;
  difficulty: number;
  tone?: 'default' | 'danger';
}

export interface LayoutOptions {
  subject: string;
  preheader: string;
  heading: string;
  paragraphs: string[]; // уже безпечний HTML
  task?: TaskCardData;
  cta: { label: string; url: string };
  note: string; // уже безпечний HTML
  settingsUrl?: string;
}

function hasText(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

/** Безпечний HTML абзацу: екранований текст із виділеними фрагментами **жирним** */
export function rich(text: string): string {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, `<strong style="font-weight:800;">$1</strong>`);
}

function difficultyBlocks(value: number): string {
  return Array.from({ length: 5 }, (_, index) => (index < value ? '&#9632;' : '&#9633;')).join('');
}

function pill(text: string, background: string): string {
  return `<span style="display:inline-block;margin:0 6px 6px 0;padding:4px 12px;border:1.5px solid ${c.ink};border-radius:999px;background:${background};font-family:${c.body};font-size:13px;font-weight:700;line-height:1.3;color:${c.ink};white-space:nowrap;">${text}</span>`;
}

function taskCard(task: TaskCardData): string {
  const border = task.tone === 'danger' ? c.danger : c.ink;
  const background = task.tone === 'danger' ? '#fff3ef' : c.cream;
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;border-collapse:separate;">
    <tr>
      <td style="padding:20px 22px 14px;border:2px solid ${border};border-radius:18px;background:${background};box-shadow:4px 4px 0 ${border};">
        <div style="margin:0 0 12px;font-family:${c.display};font-size:22px;font-weight:800;line-height:1.15;letter-spacing:-0.5px;color:${c.ink};">${escapeHtml(task.title)}</div>
        ${pill(escapeHtml(task.when), task.tone === 'danger' ? c.coral : c.lime)}${pill(`складність <span style="letter-spacing:1px;color:${c.grass};">${difficultyBlocks(task.difficulty)}</span>`, c.paper)}${pill(escapeHtml(task.groupName), c.sky)}
      </td>
    </tr>
  </table>`;
}

function button(label: string, url: string): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;border-collapse:separate;">
    <tr>
      <td style="border-radius:999px;background:${c.ink};box-shadow:3px 3px 0 ${c.leaf};">
        <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:15px 30px;border:2px solid ${c.ink};border-radius:999px;font-family:${c.body};font-size:16px;font-weight:700;line-height:1;color:${c.cream};text-decoration:none;">${escapeHtml(label)} &rarr;</a>
      </td>
    </tr>
  </table>`;
}

export function renderLayout(options: LayoutOptions): string {
  const paragraphs = options.paragraphs
    .map(
      (html) =>
        `<p style="margin:0 0 14px;font-family:${c.body};font-size:16px;line-height:1.6;color:${c.ink};">${html}</p>`,
    )
    .join('');

  const settings = hasText(options.settingsUrl)
    ? ` &middot; <a href="${escapeHtml(options.settingsUrl)}" style="color:${c.lime};font-weight:700;">Налаштувати сповіщення</a>`
    : '';

  return `<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(options.subject)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=Unbounded:wght@700;800&display=swap" rel="stylesheet">
  <style>
    @media (max-width: 600px) {
      .container { width: 100% !important; }
      .px { padding-left: 22px !important; padding-right: 22px !important; }
      .logo { font-size: 34px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${c.cream};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.cream};background-image:linear-gradient(${c.creamDeep} 1px, transparent 1px),linear-gradient(90deg, ${c.creamDeep} 1px, transparent 1px);background-size:32px 32px;">
    <tr>
      <td align="center" style="padding:36px 18px 36px 12px;">
        <table role="presentation" class="container" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:560px;border:2px solid ${c.ink};border-radius:26px;background:${c.paper};overflow:hidden;border-collapse:separate;box-shadow:6px 6px 0 ${c.ink};">
          <tr>
            <td class="px" style="padding:30px 34px 22px;background:${c.sky};background-image:linear-gradient(180deg,#8ec3ea,${c.sky});">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td valign="bottom">
                    <div class="logo" style="font-family:${c.display};font-size:42px;font-weight:800;line-height:1;letter-spacing:-2px;color:${c.ink};">errandly<span style="color:${c.grass};">*</span></div>
                    <span style="display:inline-block;margin-top:12px;padding:5px 14px;border:1.5px solid ${c.ink};border-radius:999px;background:${c.lime};font-family:${c.body};font-size:13px;font-weight:700;color:${c.ink};">побут для всіх, хто живе разом</span>
                  </td>
                  <td align="right" valign="top" width="76" style="font-family:${c.display};font-size:96px;font-weight:800;line-height:0.8;color:${c.lime};text-shadow:3px 3px 0 ${c.ink};">*</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td style="height:14px;line-height:14px;font-size:0;background:${c.leaf};border-top:2px solid ${c.ink};">&nbsp;</td></tr>
          <tr><td style="height:10px;line-height:10px;font-size:0;background:${c.grass};border-bottom:2px solid ${c.ink};">&nbsp;</td></tr>
          <tr>
            <td class="px" style="padding:34px 34px 10px;">
              <h1 style="margin:0 0 16px;font-family:${c.display};font-size:30px;font-weight:800;line-height:1.1;letter-spacing:-1px;color:${c.ink};">${escapeHtml(options.heading)}</h1>
              ${paragraphs}
              ${options.task ? taskCard(options.task) : ''}
              ${button(options.cta.label, options.cta.url)}
              <p style="margin:0 0 26px;font-family:${c.body};font-size:12.5px;line-height:1.5;color:${c.inkSoft};">Кнопка не працює? Скопіюйте посилання в браузер:<br><a href="${escapeHtml(options.cta.url)}" style="color:${c.inkSoft};word-break:break-all;">${escapeHtml(options.cta.url)}</a></p>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:18px 34px;background:${c.ink};font-family:${c.body};font-size:12.5px;line-height:1.5;color:${c.creamDeep};">${options.note}${settings}</td>
          </tr>
        </table>
        <p style="margin:18px 0 0;font-family:${c.body};font-size:12px;color:${c.inkSoft};">Errandly &middot; навчальний проєкт НаУКМА</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Прибирає HTML-теги й розкодовує сутності для текстової версії */
function strip(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&middot;/g, '·')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Текстова версія листа для клієнтів без HTML */
export function renderText(options: LayoutOptions): string {
  const task = options.task
    ? `\n${options.task.title}\n${options.task.when} · складність ${options.task.difficulty}/5 · ${options.task.groupName}\n`
    : '';
  return [
    'errandly*',
    '',
    options.heading,
    '',
    ...options.paragraphs.map(strip),
    task,
    `${options.cta.label}: ${options.cta.url}`,
    '',
    strip(options.note),
    hasText(options.settingsUrl) ? `Налаштувати сповіщення: ${options.settingsUrl}` : '',
  ]
    .join('\n')
    .trim();
}
