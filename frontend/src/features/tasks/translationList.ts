/** Масив рядків із перекладу (`returnObjects: true`); якщо там не масив — порожній список */
export function toStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
