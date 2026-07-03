import type { Knex } from 'knex';

/** `message_batches` — bulk-send batches. Uses snake_case columns (mapped in bulk-message.service). */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('message_batches', table => {
    table.uuid('id').notNullable().primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('batch_id').notNullable();
    table.string('session_id').notNullable();
    table.string('status').notNullable().defaultTo('pending');
    table.jsonb('messages').notNullable();
    table.jsonb('options').nullable();
    table.jsonb('progress').nullable();
    table.jsonb('results').nullable();
    table.integer('current_index').notNullable().defaultTo(0);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('started_at', { useTz: true }).nullable();
    table.timestamp('completed_at', { useTz: true }).nullable();
    table.unique(['session_id', 'batch_id'], { indexName: 'UQ_message_batches_session_id_batch_id' });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('message_batches');
}
