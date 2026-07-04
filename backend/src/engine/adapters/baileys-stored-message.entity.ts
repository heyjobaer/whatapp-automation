/**
 * Persisted Baileys message store (table `baileys_stored_messages`). Plain data class — persistence
 * is handled by the Knex data-access layer. Holds the serialized WAMessage proto (via BufferJSON) so
 * reply/forward/react/delete can resolve the original message/key by id across restarts.
 *
 * The ON DELETE CASCADE FK to `sessions` (cleaning up stored messages when the parent session row is
 * deleted) lives in the baseline migration.
 */
import { Session } from '../../modules/session/entities/session.entity';

export class BaileysStoredMessage {
  id: string;

  sessionId: string;

  /** Non-persisted relation placeholder (see baseline migration for the CASCADE FK). */
  session?: Session;

  waMessageId: string;

  serializedMessage: string;

  createdAt: Date;
}
