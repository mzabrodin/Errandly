/** Array of strings from a translation (`returnObjects: true`); an empty list if it is not an array */
export function toStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
