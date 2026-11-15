export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** A negative `ms` goes back in time */
export function addMs(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms);
}
