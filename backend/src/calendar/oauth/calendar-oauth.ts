export interface CalendarGrant {
  refreshToken: string;
  email: string;
}

/** Separate from Google sign-in (SYS-06) */
export abstract class CalendarOAuth {
  abstract get configured(): boolean;

  abstract authUrl(state: string): string;

  abstract exchange(code: string): Promise<CalendarGrant>;

  /** An already revoked token is not an error */
  abstract revoke(refreshToken: string): Promise<void>;
}
