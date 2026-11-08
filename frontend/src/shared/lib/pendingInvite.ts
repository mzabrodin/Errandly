// An invite the guest opened before verifying their email. The verification email
// opens in a new tab, so it is kept in localStorage rather than sessionStorage.
const KEY = 'errandly-pending-invite';

export function rememberInvite(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // Not critical: the user can just open the link again
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
    // Ignore
  }
}
