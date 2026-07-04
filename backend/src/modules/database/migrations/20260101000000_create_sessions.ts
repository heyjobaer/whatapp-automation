import type { Knex } from 'knex';

/** `sessions` — WhatsApp sessions. Parent of templates/webhooks/baileys_stored_messages (FK CASCADE). */
export async function up(knex: Knex): Promise<void> {
  // gen_random_uuid() is core since PG13, but ensure pgcrypto for older servers.
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  await knex.schema.createTable('sessions', table => {
    table.uuid('id').notNullable().primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 100).notNullable().unique();
    table.string('status', 50).notNullable().defaultTo('created');
    table.string('phone', 20).nullable();
    table.string('pushName', 100).nullable();
    table.jsonb('config').notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    table.string('proxyUrl', 255).nullable();
    table.string('proxyType', 10).nullable();
    table.timestamp('connectedAt', { useTz: true }).nullable();
    table.timestamp('lastActiveAt', { useTz: true }).nullable();
    table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updatedAt', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('sessions');
}
