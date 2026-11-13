import type { TaskDto } from './dto/task.dto.js';
import type { TaskWithSeries } from './tasks.repository.js';
import { taskStatus, toRecurrence } from './tasks.rules.js';

export function toTaskDto(task: TaskWithSeries, now: Date): TaskDto {
  return {
    id: task.id,
    seriesId: task.seriesId,
    groupId: task.groupId,
    title: task.title,
    description: task.description,
    dueAt: task.dueAt.toISOString(),
    difficulty: task.difficulty,
    recurrence: toRecurrence(task.series),
    status: taskStatus(task, now),
    assigneeId: task.assigneeId,
    manuallyAssigned: task.manuallyAssigned,
    completedAt: task.completedAt?.toISOString() ?? null,
  };
}
