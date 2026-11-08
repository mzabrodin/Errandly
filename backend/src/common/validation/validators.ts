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
