// Rules from FR-01: at least 8 characters, at least one letter and one digit
export interface PasswordRules {
  length: boolean;
  letter: boolean;
  digit: boolean;
}

export function checkPassword(password: string): PasswordRules {
  return {
    length: password.length >= 8,
    letter: /\p{L}/u.test(password),
    digit: /\d/.test(password),
  };
}

export function isValidPassword(password: string): boolean {
  return Object.values(checkPassword(password)).every(Boolean);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
