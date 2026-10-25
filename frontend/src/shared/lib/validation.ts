// Правила з FR-01: мінімум 8 символів, щонайменше одна літера та одна цифра
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
