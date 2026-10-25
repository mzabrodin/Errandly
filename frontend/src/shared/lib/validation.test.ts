import { checkPassword, isValidEmail, isValidPassword } from './validation';

describe('password rules (FR-01)', () => {
  it('accepts a password with 8+ chars, a letter and a digit', () => {
    expect(isValidPassword('Pass1234')).toBe(true);
    expect(isValidPassword('пароль12')).toBe(true);
  });

  it('reports which rule is broken (FR-03)', () => {
    expect(checkPassword('short1')).toEqual({
      length: false,
      letter: true,
      digit: true,
    });
    expect(checkPassword('12345678')).toEqual({
      length: true,
      letter: false,
      digit: true,
    });
    expect(checkPassword('password')).toEqual({
      length: true,
      letter: true,
      digit: false,
    });
  });
});

describe('isValidEmail', () => {
  it('validates email shape', () => {
    expect(isValidEmail('anya@errandly.dev')).toBe(true);
    expect(isValidEmail('anya@')).toBe(false);
  });
});
