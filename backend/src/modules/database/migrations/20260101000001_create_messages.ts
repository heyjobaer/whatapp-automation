import type { Knex } from 'knex';

/** `messages` — stored WhatsApp messages. sessionId is not an FK (history is reaped explicitly). */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('messages', table => {
    table.uuid('id').notNullable().primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('sessionId').notNullable();
    table.string('waMessageId').nullable();
    table.string('chatId').notNullable();
    table.string('from').notNullable();
    table.string('to').notNullable();
    table.text('body').nullable();
    table.string('type').notNullable().defaultTo('text');
    table.string('direction').notNullable().defaultTo('outgoing');
    table.bigInteger('timestamp').nullable();
    table.jsonb('metadata').nullable();
    table.string('status').notNullable().defaultTo('sent');
    table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(['sessionId', 'createdAt'], 'IDX_messages_sessionId_createdAt');
    table.index(['chatId'], 'IDX_messages_chatId');
    table.index(['status'], 'IDX_messages_status');
    table.unique(['sessionId', 'waMessageId'], { indexName: 'UQ_messages_sessionId_waMessageId' });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('messages');
}
