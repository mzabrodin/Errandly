/** Emails greet by the first word of the name */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
