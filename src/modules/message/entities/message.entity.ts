/**
 * A stored WhatsApp message row (table `messages`). Plain data class — persistence is handled by
 * the Knex data-access layer; `timestamp` (a Postgres `bigint`) is coerced back to a number on read
 * by the repository (numberColumns metadata), replacing the former TypeORM value transformer.
 */

export enum MessageDirection {
  INCOMING = 'incoming',
  OUTGOING = 'outgoing',
}

export enum MessageStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
}

export class Message {
  id: string;

  sessionId: string;

  waMessageId: string;

  chatId: string;

  from: string;

  to: string;

  body: string;

  type: string;

  direction: MessageDirection;

  timestamp: number;

  metadata: Record<string, unknown>;

  status: MessageStatus;

  createdAt: Date;
}
