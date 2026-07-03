import type { Knex } from 'knex';

/** `templates` — message templates. FK to sessions ON DELETE CASCADE; one name per session. */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('templates', table => {
    table.uuid('id').notNullable().primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('sessionId').notNullable().references('id').inTable('sessions').onDelete('CASCADE');
    table.string('name', 100).notNullable();
    table.text('body').notNullable();
    table.text('header').nullable();
    table.text('footer').nullable();
    table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updatedAt', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['sessionId', 'name'], { indexName: 'IDX_templates_session_name' });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('templates');
}
