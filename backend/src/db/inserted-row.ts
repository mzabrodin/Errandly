/** `INSERT … RETURNING` gives exactly one row; anything else is a bug, not a user error */
export function insertedRow<T>(rows: T[]): T {
  const [row] = rows;
  if (row === undefined) throw new Error('INSERT … RETURNING returned no row');
  return row;
}
