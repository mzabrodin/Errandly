const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes user data (names, task titles) before inserting it into HTML */
export function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char);
}
