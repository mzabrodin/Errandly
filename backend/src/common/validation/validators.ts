import { ValidateBy, type ValidationArguments } from 'class-validator';

import { LIMITS } from '../domain.js';
import { code } from './validation.js';

/** FR-01: at least 8 characters with at least one letter (any alphabet) and one digit */
export function isStrongPassword(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    value.length >= LIMITS.passwordMin &&
    value.length <= LIMITS.passwordMax &&
    /\p{L}/u.test(value) &&
    /\d/.test(value)
  );
}

export function IsPassword(): PropertyDecorator {
  return ValidateBy(
    { name: 'isPassword', validator: { validate: isStrongPassword } },
    code('weak'),
  );
}

/** An ISO date-time that is not in the past (`inPast`) */
export function IsFutureDate(): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isFutureDate',
      validator: {
        validate: (value: unknown) => typeof value === 'string' && Date.parse(value) >= Date.now(),
      },
    },
    code('inPast'),
  );
}

/** A real calendar day as yyyy-mm-dd: 2026-02-30 is not one */
export function isIsoDate(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function IsIsoDate(): PropertyDecorator {
  return ValidateBy({ name: 'isIsoDate', validator: { validate: isIsoDate } }, code('invalid'));
}

/** A yyyy-mm-dd date that is not earlier than the date in `property` (`beforeFrom`) */
export function IsOnOrAfter(property: string): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isOnOrAfter',
      constraints: [property],
      validator: {
        validate: (value: unknown, args?: ValidationArguments) => {
          const other: unknown = args ? Reflect.get(args.object, property) : undefined;
          return typeof value === 'string' && typeof other === 'string' && value >= other;
        },
      },
    },
    code('beforeFrom'),
  );
}

/** A valid IANA time zone such as Europe/Kyiv */
export function isTimeZone(value: unknown): boolean {
  if (typeof value !== 'string' || value === '') return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function IsTimeZone(): PropertyDecorator {
  return ValidateBy({ name: 'isTimeZone', validator: { validate: isTimeZone } }, code('invalid'));
}
