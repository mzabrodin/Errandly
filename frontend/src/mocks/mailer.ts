import { bypass } from 'msw';

import type { Locale } from '../shared/i18n';
import { computeStatus, DAY_MS, db, defaultSettingsFor, isCompleted } from './db';

// The mock API cannot speak SMTP, so the backend renders and sends emails through a dev endpoint
// (backend/src/mail/dev-mail.controller.ts) to Mailpit: http://localhost:8025

type MailData = Record<string, string | number>;

let warned = false;

async function postMail(
  template: string,
  to: string,
  data: MailData,
  locale: Locale,
): Promise<void> {
  const response = await fetch(
    bypass('/api/dev/mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template, to, data, locale }),
    }),
  );
  if (!response.ok) throw new Error(String(response.status));
  // oxlint-disable-next-line no-console -- with mocks the email is visible only in the console and Mailpit
  console.info(`[mock] Email "${template}" → ${to} (see Mailpit: http://localhost:8025)`);
}

/**
 * Sends in the recipient's account language. An invite may go to someone without an account,
 * so the caller can pass the sender's language instead.
 */
export function sendMail(template: string, to: string, data: MailData, locale?: Locale): void {
  const recipient = db.users.find((user) => user.email === to);
  void postMail(template, to, data, recipient?.locale ?? locale ?? 'uk').catch(() => {
    if (warned) return;
    warned = true;
    // oxlint-disable-next-line no-console -- tells the developer why emails are not arriving
    console.warn(
      '[mock] Emails are not being sent: start Mailpit and the backend with MAIL_DEV_API=true (see README)',
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

/** Assignment notification (FR-38), unless the member turned it off */
export function notifyAssigned(task: TaskLike): void {
  if (task.assigneeId === null || task.assigneeId === '') return;
  if (!defaultSettingsFor(task.assigneeId).notifications.assigned) return;
  const user = db.users.find((candidate) => candidate.id === task.assigneeId);
  const data = taskMailData(task, task.assigneeId);
  if (user && data) sendMail('taskAssigned', user.email, data);
}

/**
 * On the server, the scheduler sends the "due soon" and "overdue" reminders.
 * With mocks they can be sent by hand from the console: errandlySendReminders()
 */
export function sendReminders(): string {
  const now = Date.now();
  let sent = 0;
  for (const task of db.tasks) {
    if (task.assigneeId === null || task.assigneeId === '' || isCompleted(task)) continue;
    const { notifications: settings, emailReminderMinutes } = defaultSettingsFor(task.assigneeId);
    const due = new Date(task.dueAt).getTime();
    const user = db.users.find((candidate) => candidate.id === task.assigneeId);
    const data = taskMailData(task, task.assigneeId);
    if (!user || !data) continue;
    if (settings.dueSoon && due > now && due - now <= emailReminderMinutes * 60_000) {
      sendMail('taskDueSoon', user.email, { ...data, reminderMinutes: emailReminderMinutes });
      sent += 1;
    } else if (settings.overdue && computeStatus(task) === 'overdue' && now - due <= 2 * DAY_MS) {
      sendMail('taskOverdue', user.email, data);
      sent += 1;
    }
  }
  return `Reminders sent: ${sent}`;
}
