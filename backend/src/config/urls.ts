export const API_PREFIX = 'api';

/** A link into the frontend for emails, e.g. appLink(APP_URL, '/verify-email', token) */
export function appLink(appUrl: string, path: string, ...segments: string[]): string {
  const base = appUrl.replace(/\/+$/, '');
  const tail = segments.map((segment) => `/${encodeURIComponent(segment)}`).join('');
  return `${base}${path}${tail}`;
}
