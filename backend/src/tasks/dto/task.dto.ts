import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  EDIT_SCOPES,
  LIMITS,
  TASK_STATUSES,
  type EditScope,
  type TaskStatus,
} from '../../common/domain.js';
import { Trim } from '../../common/validation/transforms.js';
import { code } from '../../common/validation/validation.js';
import { IsFutureDate } from '../../common/validation/validators.js';
import { RecurrenceProperty, type RecurrenceDto } from './recurrence.dto.js';

export class TaskDto {
  id!: string;
  seriesId!: string;
  groupId!: string;
  title!: string;
  description!: string;
  /** ISO date-time, UTC */
  dueAt!: string;
  /** 1–5 */
  difficulty!: number;
  @RecurrenceProperty()
  recurrence!: RecurrenceDto;
  /** Computed: done → overdue → unassigned → planned */
  @ApiProperty({ enum: TASK_STATUSES, enumName: 'TaskStatus' })
  status!: TaskStatus;
  assigneeId!: string | null;
  /** Set by an admin; the algorithm never overwrites it (FR-30) */
  manuallyAssigned!: boolean;
  completedAt!: string | null;
}

/** Fields of the task form shared by create and update */
abstract class TaskFieldsDto {
  @Trim()
  @IsString(code('type'))
  @IsNotEmpty(code('required'))
  @MaxLength(LIMITS.taskTitle, code('tooLong'))
  title!: string;

  @IsString(code('type'))
  @MaxLength(LIMITS.taskDescription, code('tooLong'))
  description!: string;

  @IsInt(code('range'))
  @Min(LIMITS.difficultyMin, code('range'))
  @Max(LIMITS.difficultyMax, code('range'))
  difficulty!: number;

  @RecurrenceProperty()
  recurrence!: RecurrenceDto;

  /** A member id, or null for automatic assignment (FR-27) */
  @IsOptional()
  @IsUUID('all', code('invalid'))
  assigneeId!: string | null;
}

export class CreateTaskDto extends TaskFieldsDto {
  /** ISO date-time, not in the past */
  @IsNotEmpty(code('required'))
  @IsISO8601({ strict: true }, code('invalid'))
  @IsFutureDate()
  dueAt!: string;
}

/** PATCH takes the full form; inPast is checked only when dueAt changes (in the service) */
export class UpdateTaskDto extends TaskFieldsDto {
  /** ISO date-time */
  @IsNotEmpty(code('required'))
  @IsISO8601({ strict: true }, code('invalid'))
  dueAt!: string;
}

export class TasksQueryDto {
  /** Inclusive lower bound on dueAt, ISO date-time */
  @IsOptional()
  @IsISO8601({ strict: true }, code('invalid'))
  from?: string;

  /** Exclusive upper bound on dueAt, ISO date-time */
  @IsOptional()
  @IsISO8601({ strict: true }, code('invalid'))
  to?: string;

  /** Only instances of this series (completion history) */
  @IsOptional()
  @IsUUID('all', code('invalid'))
  seriesId?: string;
}

export class EditScopeQueryDto {
  /** `one` changes this instance only, `series` all upcoming unfinished ones */
  @ApiProperty({ enum: EDIT_SCOPES, enumName: 'EditScope' })
  @IsIn(EDIT_SCOPES, code('invalid'))
  scope!: EditScope;
}

export class ReassignTaskDto {
  @IsUUID('all', code('invalid'))
  assigneeId!: string;
}
