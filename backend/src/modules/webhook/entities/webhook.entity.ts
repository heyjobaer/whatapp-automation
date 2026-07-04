/**
 * A webhook subscription row (table `webhooks`). Plain data class — persistence is handled by the
 * Knex data-access layer. `events`, `headers`, and `filters` are stored as jsonb. The `session`
 * field is a non-persisted relation placeholder (the ON DELETE CASCADE FK lives in the migration).
 */
import { Session } from '../../session/entities/session.entity';
import { WebhookFilters } from '../filters/filter-types';

export class Webhook {
  id: string;

  sessionId: string;

  /** Non-persisted relation placeholder (see baseline migration for the CASCADE FK). */
  session?: Session;

  url: string;

  events: string[];

  secret: string | null;

  headers: Record<string, string>;

  // Optional smart pre-filter. Null/absent means "no filtering" (fire on every subscribed event).
  filters: WebhookFilters | null;

  active: boolean;

  retryCount: number;

  lastTriggeredAt: Date | null;

  createdAt: Date;

  updatedAt: Date;
}
