import { Injectable } from '@nestjs/common';

import { isAbsentOn, LOAD_WINDOW_MS } from '../tasks.rules.js';
import {
  AssignmentStrategy,
  type AssignedTask,
  type Candidate,
  type TaskToAssign,
} from './assignment-strategy.js';

interface Scored {
  candidate: Candidate;
  load: number;
  lastDid: number;
}

/** FR-27–29; the same algorithm as frontend/src/mocks/allocation.ts */
@Injectable()
export class LeastLoadRotationStrategy extends AssignmentStrategy {
  pick(
    candidates: readonly Candidate[],
    history: readonly AssignedTask[],
    task: TaskToAssign,
  ): string | null {
    const due = task.dueAt.getTime();
    const scored = candidates
      .filter((candidate) => !isAbsentOn(candidate.absences, task.dueAt, task.timeZone))
      .map((candidate): Scored => {
        const own = history.filter((other) => other.assigneeId === candidate.userId);
        return {
          candidate,
          load: own
            .filter(({ dueAt }) => dueAt.getTime() > due - LOAD_WINDOW_MS && dueAt.getTime() <= due)
            .reduce((sum, other) => sum + other.difficulty, 0),
          lastDid: own
            .filter((other) => other.seriesId === task.seriesId && other.dueAt.getTime() < due)
            .reduce((latest, other) => Math.max(latest, other.dueAt.getTime()), -Infinity),
        };
      });
    const [best] = scored.toSorted(byLoadThenRotation);
    return best?.candidate.userId ?? null;
  }
}

function byLoadThenRotation(a: Scored, b: Scored): number {
  if (a.load !== b.load) return a.load - b.load;
  // Never did the series: -Infinity, so they come first
  if (a.lastDid !== b.lastDid) return a.lastDid < b.lastDid ? -1 : 1;
  return a.candidate.name.localeCompare(b.candidate.name, 'uk');
}
