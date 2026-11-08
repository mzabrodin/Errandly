import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  validate,
  ValidateNested,
} from 'class-validator';

import { code, validationExceptionFactory } from './validation.js';
import { IsOnOrAfter, IsPassword, isStrongPassword, isTimeZone } from './validators.js';

class WeekdaysDto {
  @ArrayNotEmpty(code('noWeekdays'))
  weekdays!: number[];
}

class SampleDto {
  @IsString(code('type'))
  @IsNotEmpty(code('required'))
  @MaxLength(5, code('tooLong'))
  name!: string;

  @IsEmail({}, code('invalid'))
  email!: string;

  @IsPassword()
  password!: string;

  @ValidateNested()
  @Type(() => WeekdaysDto)
  recurrence!: WeekdaysDto;

  @MaxLength(3)
  nickname!: string;
}

class RangeDto {
  from!: string;

  @IsOnOrAfter('from')
  to!: string;
}

function range(from: string, to: string): RangeDto {
  return Object.assign(new RangeDto(), { from, to });
}

async function fieldsOf(target: object): Promise<Record<string, string> | undefined> {
  const errors = await validate(target);
  return validationExceptionFactory(errors).details.fields;
}

describe('validationExceptionFactory', () => {
  it('reports one code per field, the most fundamental first', async () => {
    const dto = Object.assign(new SampleDto(), {
      name: '',
      email: 'nope',
      password: 'short',
      recurrence: Object.assign(new WeekdaysDto(), { weekdays: [] }),
      nickname: 'too long',
    });

    await expect(fieldsOf(dto)).resolves.toEqual({
      name: 'required',
      email: 'invalid',
      password: 'weak',
      recurrence: 'noWeekdays',
      nickname: 'tooLong',
    });
  });

  it('raises a VALIDATION domain error', () => {
    const exception = validationExceptionFactory([]);
    expect(exception.code).toBe('VALIDATION');
    expect(exception.details).toEqual({ fields: {} });
  });

  it('marks properties outside the DTO as unknown', () => {
    const exception = validationExceptionFactory([
      {
        property: 'admin',
        constraints: { whitelistValidation: 'property admin should not exist' },
      },
    ]);
    expect(exception.details.fields).toEqual({ admin: 'unknown' });
  });

  it('falls back to invalid for unmapped constraints', () => {
    const exception = validationExceptionFactory([
      { property: 'id', constraints: { isUuid: 'id must be a UUID' } },
    ]);
    expect(exception.details.fields).toEqual({ id: 'invalid' });
  });

  it('compares a date range', async () => {
    await expect(fieldsOf(range('2026-11-10', '2026-11-09'))).resolves.toEqual({
      to: 'beforeFrom',
    });
    await expect(fieldsOf(range('2026-11-10', '2026-11-10'))).resolves.toEqual({});
  });
});

describe('validators', () => {
  it('requires a letter and a digit in 8+ characters (FR-01)', () => {
    expect(isStrongPassword('Pass1234')).toBe(true);
    expect(isStrongPassword('пароль12')).toBe(true);
    expect(isStrongPassword('Pass123')).toBe(false);
    expect(isStrongPassword('12345678')).toBe(false);
    expect(isStrongPassword('Password')).toBe(false);
    expect(isStrongPassword(12_345_678)).toBe(false);
  });

  it('accepts only IANA time zones', () => {
    expect(isTimeZone('Europe/Kyiv')).toBe(true);
    expect(isTimeZone('Mars/Olympus')).toBe(false);
    expect(isTimeZone('')).toBe(false);
  });
});
