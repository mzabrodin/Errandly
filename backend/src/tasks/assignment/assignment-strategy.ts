export interface Candidate {
  userId: string;
  name: string;
  absences: { from: string; to: string }[];
}

export interface AssignedTask {
  seriesId: string;
  dueAt: Date;
  difficulty: number;
  assigneeId: string | null;
}

export interface TaskToAssign {
  seriesId: string;
  dueAt: Date;
  timeZone: string;
}

export abstract class AssignmentStrategy {
  abstract pick(
    candidates: readonly Candidate[],
    history: readonly AssignedTask[],
    task: TaskToAssign,
  ): string | null;
}
