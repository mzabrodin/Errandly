/** For logs and stored failure reasons: an Error's message, anything else as text */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
