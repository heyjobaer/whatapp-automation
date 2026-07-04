/**
 * Small Postgres/Knex helpers (not an ORM — just value coercion the pg driver needs).
 *
 * `jsonb()` — serialize a value for a `jsonb` column. node-postgres turns a JS array into a Postgres
 * ARRAY literal (wrong for jsonb) and only stringifies plain objects, so we JSON.stringify every
 * jsonb value ourselves for consistent behaviour. Reads come back already parsed from the driver.
 *
 * `toNumber()` — a Postgres `bigint` reads back as a string (pg avoids >2^53 precision loss). Our
 * epoch-seconds are well below that, and the API contract is `number`, so coerce on read.
 */
export function jsonb(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}
