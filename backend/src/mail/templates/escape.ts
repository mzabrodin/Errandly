const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Екранування користувацьких даних (імена, назви задач) перед вставкою в HTML */
export function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char);
}
