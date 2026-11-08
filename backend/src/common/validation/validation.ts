import type { ValidationError, ValidationOptions } from 'class-validator';

import { DomainError } from '../errors/domain-error.js';
import { FIELD_CODES, type FieldCode } from '../errors/error-codes.js';

/** Decorator options whose message is a field code: `@MaxLength(100, code('tooLong'))` */
export function code(fieldCode: FieldCode): ValidationOptions {
  return { message: fieldCode };
}

// Built-in constraints used without an explicit code() fall back to these
const CONSTRAINT_CODES: Partial<Record<string, FieldCode>> = {
  whitelistValidation: 'unknown',
  isDefined: 'required',
  isNotEmpty: 'required',
  maxLength: 'tooLong',
  arrayMaxSize: 'tooLong',
  min: 'range',
  max: 'range',
  isString: 'type',
  isInt: 'type',
  isNumber: 'type',
  isBoolean: 'type',
  isArray: 'type',
  isObject: 'type',
};

// When a property breaks several rules, the frontend shows the most fundamental one
const PRIORITY: readonly FieldCode[] = [
  'unknown',
  'required',
  'type',
  'invalid',
  'tooLong',
  'range',
  'weak',
  'inPast',
  'noWeekdays',
  'beforeFrom',
];

function isFieldCode(value: string): value is FieldCode {
  return FIELD_CODES.some((fieldCode) => fieldCode === value);
}

function codesOf(error: ValidationError): FieldCode[] {
  const own = Object.entries(error.constraints ?? {}).map(([constraint, message]) => {
    if (isFieldCode(message)) return message;
    return CONSTRAINT_CODES[constraint] ?? 'invalid';
  });
  // A nested object (recurrence.weekdays) is reported under its parent property
  const nested = (error.children ?? []).flatMap(codesOf);
  return [...own, ...nested];
}

function mostImportant(codes: FieldCode[]): FieldCode {
  return codes.toSorted((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b))[0] ?? 'invalid';
}

/** Turns class-validator errors into 400 `{ code: 'VALIDATION', fields: { name: 'required' } }` */
export function validationExceptionFactory(errors: ValidationError[]): DomainError {
  const fields: Record<string, string> = {};
  for (const error of errors) {
    fields[error.property] = mostImportant(codesOf(error));
  }
  return new DomainError('VALIDATION', { fields });
}
