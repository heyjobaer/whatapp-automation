import type { Knex } from 'knex';

/** `baileys_stored_messages` — serialized WAMessage store. FK to sessions ON DELETE CASCADE. */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('baileys_stored_messages', table => {
    table.uuid('id').notNullable().primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('sessionId').notNullable().references('id').inTable('sessions').onDelete('CASCADE');
    table.string('waMessageId').notNullable();
    table.text('serializedMessage').notNullable();
    table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['sessionId', 'waMessageId'], { indexName: 'UQ_baileys_stored_messages_session_wa' });
    table.index(['sessionId', 'createdAt'], 'IDX_baileys_stored_messages_session_created');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('baileys_stored_messages');
}
