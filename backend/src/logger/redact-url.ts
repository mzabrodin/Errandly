// Secrets that travel in URLs: invite tokens in paths, OAuth codes and states in Google callbacks.
// Body fields are covered by the pino `redact` paths instead.
const URL_SECRETS = [/(\/invites\/)[^/?#]+/g, /([?&](?:code|state)=)[^&#]+/g];

/** `/api/invites/abc123/accept` → `/api/invites/[REDACTED]/accept` */
export function redactUrl(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  return URL_SECRETS.reduce((result, pattern) => result.replace(pattern, '$1[REDACTED]'), url);
}
