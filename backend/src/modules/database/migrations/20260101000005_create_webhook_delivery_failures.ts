import type { Knex } from 'knex';

/** `webhook_delivery_failures` — durable record of deliveries that exhausted their retries. */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('webhook_delivery_failures', table => {
    table.uuid('id').notNullable().primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('webhookId').notNullable();
    table.string('sessionId').notNullable();
    table.string('event').notNullable();
    table.string('url').notNullable();
    table.string('idempotencyKey').nullable();
    table.string('deliveryId').nullable();
    table.integer('attempts').notNullable();
    table.integer('lastStatusCode').nullable();
    table.text('lastError').notNullable();
    table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(['sessionId'], 'IDX_webhook_delivery_failures_sessionId');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('webhook_delivery_failures');
}
