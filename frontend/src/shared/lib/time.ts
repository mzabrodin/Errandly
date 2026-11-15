export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** FR-24: the assignee can take back "done" for a day */
export const UNDO_WINDOW_MS = DAY_MS;
