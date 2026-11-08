// Secrets that travel in URL paths. Body fields are covered by the pino `redact` paths instead.
const PATH_SECRETS = [/(\/invites\/)[^/?#]+/g];

/** `/api/invites/abc123/accept` → `/api/invites/[REDACTED]/accept` */
export function redactUrl(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  return PATH_SECRETS.reduce((result, pattern) => result.replace(pattern, '$1[REDACTED]'), url);
}
