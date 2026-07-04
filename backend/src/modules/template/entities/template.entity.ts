/**
 * A message template row (table `templates`). Plain data class — persistence is handled by the Knex
 * data-access layer. The `session` field is a non-persisted relation placeholder (unique index on
 * (sessionId, name) and the ON DELETE CASCADE FK live in the baseline migration).
 */
import { Session } from '../../session/entities/session.entity';

export class Template {
  id: string;

  sessionId: string;

  /** Non-persisted relation placeholder (see baseline migration for the CASCADE FK). */
  session?: Session;

  name: string;

  body: string;

  header: string | null;

  footer: string | null;

  createdAt: Date;

  updatedAt: Date;
}
