/**
 * A bulk-send batch row (table `message_batches`). Plain data class — persistence is handled by the
 * Knex data-access layer. This table uses snake_case columns (batch_id, session_id, …); the
 * property→column mapping lives in the entity registry.
 */

export enum BatchStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

export enum BatchMessageStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface BatchMessageResult {
  chatId: string;
  status: BatchMessageStatus;
  messageId?: string;
  error?: {
    code: string;
    message: string;
  };
  sentAt?: Date;
}

export interface BatchProgress {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  cancelled: number;
}

export class MessageBatch {
  id: string;

  batchId: string;

  sessionId: string;

  status: BatchStatus;

  messages: Array<{
    chatId: string;
    type: string;
    content: Record<string, unknown>;
    variables?: Record<string, string>;
  }>;

  options: {
    delayBetweenMessages: number;
    randomizeDelay: boolean;
    stopOnError: boolean;
  };

  progress: BatchProgress;

  results: BatchMessageResult[];

  currentIndex: number;

  createdAt: Date;

  updatedAt: Date;

  startedAt: Date | null;

  completedAt: Date | null;
}
