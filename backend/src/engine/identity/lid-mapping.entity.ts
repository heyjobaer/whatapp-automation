/**
 * Persisted `lid -> phone` resolution table (table `lid_mappings`). Plain data class — persistence
 * is handled by the Knex data-access layer. One global, cross-session row per lid, so a lid resolved
 * in one session is usable everywhere and survives restarts.
 *
 * Last-write-wins: a stored mapping is "best known, not forever" (WhatsApp recycles numbers).
 * `phone` is nullable to record a negative result (a lid looked up and not resolvable). `sessionId`
 * is provenance only (which session last wrote the row) — intentionally NOT a foreign key.
 */
export class LidMapping {
  /** The lid number (bare, device-stripped — the user-part of `<lid>@lid`). Primary key. */
  lid: string;

  /** E.164 phone digits, or null when the lid is known-but-unresolved (a cached negative result). */
  phone: string | null;

  /** The session that last wrote this row. Provenance/debugging only; not a foreign key. */
  sessionId: string | null;

  updatedAt: Date;
}
