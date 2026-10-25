import { toDateInputValue } from '../shared/lib/dates';

// Алгоритм автоматичного розподілу (FR-27, FR-28, FR-17) — дзеркалить серверну логіку для моків

export interface AllocationMember {
  userId: string;
  name: string;
  absences: { from: string; to: string }[];
}

export interface AllocationTask {
  seriesId: string;
  dueAt: string;
  difficulty: number;
  assigneeId: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const LOAD_WINDOW_DAYS = 28;

// дата терміну в локальному часовому поясі, як її бачить користувач (NFR-COMP-03)
export function isAbsent(member: AllocationMember, dueAt: string): boolean {
  const day = toDateInputValue(new Date(dueAt));
  return member.absences.some((absence) => absence.from <= day && day <= absence.to);
}

export function memberLoad(userId: string, tasks: AllocationTask[], at: Date): number {
  const windowStart = at.getTime() - LOAD_WINDOW_DAYS * DAY_MS;
  return tasks
    .filter((task) => task.assigneeId === userId)
    .filter((task) => {
      const due = new Date(task.dueAt).getTime();
      return due > windowStart && due <= at.getTime();
    })
    .reduce((sum, task) => sum + task.difficulty, 0);
}

function lastTimeDidSeries(userId: string, seriesId: string, tasks: AllocationTask[], at: Date) {
  return tasks
    .filter(
      (task) =>
        task.assigneeId === userId &&
        task.seriesId === seriesId &&
        new Date(task.dueAt).getTime() < at.getTime(),
    )
    .reduce((latest, task) => Math.max(latest, new Date(task.dueAt).getTime()), -Infinity);
}

/** Повертає userId виконавця або null, якщо доступних учасників немає (FR-29) */
export function pickAssignee(
  members: AllocationMember[],
  tasks: AllocationTask[],
  task: Pick<AllocationTask, 'seriesId' | 'dueAt'>,
): string | null {
  const at = new Date(task.dueAt);
  const candidates = members
    .filter((member) => !isAbsent(member, task.dueAt))
    .map((member) => ({
      member,
      load: memberLoad(member.userId, tasks, at),
      lastDid: lastTimeDidSeries(member.userId, task.seriesId, tasks, at),
    }));

  if (candidates.length === 0) return null;

  // менше навантаження → давніше виконував цю серію → за алфавітом
  const [best] = candidates.toSorted((a, b) => {
    if (a.load !== b.load) return a.load - b.load;
    if (a.lastDid !== b.lastDid) return a.lastDid - b.lastDid;
    return a.member.name.localeCompare(b.member.name, 'uk');
  });
  return best?.member.userId ?? null;
}
