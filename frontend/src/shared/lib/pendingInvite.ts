// Запрошення, яке гість відкрив до підтвердження email. Лист підтвердження
// відкривається в новій вкладці, тому зберігаємо в localStorage, а не sessionStorage.
const KEY = 'errandly-pending-invite';

export function rememberInvite(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // не критично: користувач просто відкриє посилання ще раз
  }
}

export function getPendingInvite(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function forgetInvite(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ігноруємо
  }
}
