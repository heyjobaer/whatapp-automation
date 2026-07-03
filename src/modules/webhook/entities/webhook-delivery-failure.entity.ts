/**
 * A durable record of a webhook delivery that exhausted all of its retries (table
 * `webhook_delivery_failures`). Plain data class — persistence is handled by the Knex data-access
 * layer. Each terminal failure is appended (see `recordWebhookDeliveryFailure`) and surfaced via
 * the ADMIN `GET /webhooks/delivery-failures` endpoint.
 */
export class WebhookDeliveryFailure {
  id: string;

  webhookId: string;

  sessionId: string;

  event: string;

  url: string;

  /** The idempotency key the receiver would have deduped on (lets an operator correlate the lost event). */
  idempotencyKey: string;

  deliveryId: string;

  /** Total attempts made before giving up. */
  attempts: number;

  /** Last HTTP status, when the failure was a non-2xx response (null for a network/timeout/SSRF error). */
  lastStatusCode: number | null;

  lastError: string;

  /** When the delivery was finally abandoned. */
  createdAt: Date;
}
