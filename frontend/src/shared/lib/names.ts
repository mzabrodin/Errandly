/** Greetings and compact labels use the first word of the name */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
