import type { Knex } from 'knex';

/** `webhooks` — webhook subscriptions. FK to sessions ON DELETE CASCADE. */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('webhooks', table => {
    table.uuid('id').notNullable().primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('sessionId').notNullable().references('id').inTable('sessions').onDelete('CASCADE');
    table.string('url', 2048).notNullable();
    table.jsonb('events').notNullable().defaultTo(knex.raw(`'["message.received"]'::jsonb`));
    table.string('secret', 255).nullable();
    table.jsonb('headers').notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    table.jsonb('filters').nullable();
    table.boolean('active').notNullable().defaultTo(true);
    table.integer('retryCount').notNullable().defaultTo(3);
    table.timestamp('lastTriggeredAt', { useTz: true }).nullable();
    table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updatedAt', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('webhooks');
}
