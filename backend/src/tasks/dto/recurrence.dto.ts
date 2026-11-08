import { applyDecorators } from '@nestjs/common';
import { ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { RECURRENCE_TYPES, type RecurrenceType } from '../../common/domain.js';
import { code } from '../../common/validation/validation.js';

// Recurrence is a discriminated union on `type`, so the generated frontend type can be narrowed:
// { type: 'once' } | { type: 'daily' } | { type: 'weekly'; weekdays: number[] } | { type: 'monthly' }

/** Fallback for an unknown `type`; it only exists to fail validation */
export class RecurrenceBaseDto {
  @IsIn(RECURRENCE_TYPES, code('invalid'))
  type!: RecurrenceType;
}

export class OnceRecurrenceDto {
  @ApiProperty({ enum: ['once'] })
  @IsIn(['once'], code('invalid'))
  type!: 'once';
}

export class DailyRecurrenceDto {
  @ApiProperty({ enum: ['daily'] })
  @IsIn(['daily'], code('invalid'))
  type!: 'daily';
}

export class WeeklyRecurrenceDto {
  @ApiProperty({ enum: ['weekly'] })
  @IsIn(['weekly'], code('invalid'))
  type!: 'weekly';

  /** ISO weekdays: 1 = Monday … 7 = Sunday; at least one */
  @IsArray(code('noWeekdays'))
  @ArrayNotEmpty(code('noWeekdays'))
  @ArrayUnique(code('invalid'))
  @IsInt({ each: true, ...code('invalid') })
  @Min(1, { each: true, ...code('invalid') })
  @Max(7, { each: true, ...code('invalid') })
  weekdays!: number[];
}

/** Same day of the month as the first due date */
export class MonthlyRecurrenceDto {
  @ApiProperty({ enum: ['monthly'] })
  @IsIn(['monthly'], code('invalid'))
  type!: 'monthly';
}

export type RecurrenceDto =
  OnceRecurrenceDto | DailyRecurrenceDto | WeeklyRecurrenceDto | MonthlyRecurrenceDto;

const VARIANTS = [
  { name: 'once', value: OnceRecurrenceDto },
  { name: 'daily', value: DailyRecurrenceDto },
  { name: 'weekly', value: WeeklyRecurrenceDto },
  { name: 'monthly', value: MonthlyRecurrenceDto },
] as const;

/** Register on a controller with `@ApiExtraModels(...RECURRENCE_VARIANTS)` so the `$ref`s resolve */
export const RECURRENCE_VARIANTS = VARIANTS.map((variant) => variant.value);

/** OpenAPI `oneOf` with a discriminator, plus validation of the matching variant */
export function RecurrenceProperty(): PropertyDecorator {
  return applyDecorators(
    ApiProperty({
      oneOf: VARIANTS.map((variant) => ({ $ref: getSchemaPath(variant.value) })),
      discriminator: {
        propertyName: 'type',
        mapping: Object.fromEntries(
          VARIANTS.map((variant) => [variant.name, getSchemaPath(variant.value)]),
        ),
      },
    }),
    IsDefined(code('required')),
    ValidateNested(),
    Type(() => RecurrenceBaseDto, {
      keepDiscriminatorProperty: true,
      discriminator: { property: 'type', subTypes: [...VARIANTS] },
    }),
  );
}
