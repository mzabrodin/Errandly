import { bypass } from 'msw';

import { computeStatus, DAY_MS, db, defaultSettingsFor, isCompleted } from './db';

// Мок-API не вміє SMTP, тому листи рендерить і надсилає бекенд через dev-ендпоінт
// (backend/src/mail/dev-mail.controller.ts) у Mailpit: http://localhost:8025

type MailData = Record<string, string | number>;

let warned = false;

async function postMail(template: string, to: string, data: MailData): Promise<void> {
  const response = await fetch(
    bypass('/api/dev/mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template, to, data }),
    }),
  );
  if (!response.ok) throw new Error(String(response.status));
  // oxlint-disable-next-line no-console -- у моках лист видно лише в консолі й Mailpit
  console.info(`[mock] Лист «${template}» → ${to} (див. Mailpit: http://localhost:8025)`);
}

export function sendMail(template: string, to: string, data: MailData): void {
  void postMail(template, to, data).catch(() => {
    if (warned) return;
    warned = true;
    // oxlint-disable-next-line no-console -- підказка розробнику, чому листи не доходять
    console.warn(
      '[mock] Листи не надсилаються: запустіть Mailpit і бекенд з MAIL_DEV_API=true (див. README)',
    );
  });
}

type TaskLike = (typeof db.tasks)[number];

function taskMailData(task: TaskLike, userId: string): MailData | null {
  const user = db.users.find((candidate) => candidate.id === userId);
  const group = db.groups.find((candidate) => candidate.id === task.groupId);
  if (!user || !group) return null;
  return {
    name: user.name.split(' ')[0] ?? '',
    groupName: group.name,
    taskTitle: task.title,
    dueAt: task.dueAt,
    difficulty: task.difficulty,
    url: `${location.origin}/g/${task.groupId}/tasks/${task.id}`,
    settingsUrl: `${location.origin}/settings`,
    timezone: user.timezone,
  };
}

/** Сповіщення про призначення (FR-38), якщо учасник його не вимкнув */
export function notifyAssigned(task: TaskLike): void {
  if (task.assigneeId === null || task.assigneeId === '') return;
  if (!defaultSettingsFor(task.assigneeId).notifications.assigned) return;
  const user = db.users.find((candidate) => candidate.id === task.assigneeId);
  const data = taskMailData(task, task.assigneeId);
  if (user && data) sendMail('taskAssigned', user.email, data);
}

/**
 * На сервері нагадування «скоро термін» і «прострочено» шле планувальник.
 * У моках їх можна надіслати вручну з консолі: errandlySendReminders()
 */
export function sendReminders(): string {
  const now = Date.now();
  let sent = 0;
  for (const task of db.tasks) {
    if (task.assigneeId === null || task.assigneeId === '' || isCompleted(task)) continue;
    const settings = defaultSettingsFor(task.assigneeId).notifications;
    const due = new Date(task.dueAt).getTime();
    const user = db.users.find((candidate) => candidate.id === task.assigneeId);
    const data = taskMailData(task, task.assigneeId);
    if (!user || !data) continue;
    if (settings.dueSoon && due > now && due - now <= DAY_MS) {
      sendMail('taskDueSoon', user.email, data);
      sent += 1;
    } else if (settings.overdue && computeStatus(task) === 'overdue' && now - due <= 2 * DAY_MS) {
      sendMail('taskOverdue', user.email, data);
      sent += 1;
    }
  }
  return `Надіслано нагадувань: ${sent}`;
}
