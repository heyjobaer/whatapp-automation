import type { Knex } from 'knex';

/**
 * Replace the `aiEnabled` toggle with `disableAiReply` (inverted semantics, clearer name).
 * `disableAiReply` defaults to false — the AI replies normally; an admin flips it to true to
 * silence the AI for one specific chat. Supersedes migration 017's `aiEnabled` column.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('chat_leads', table => {
    table.dropColumn('aiEnabled');
    table.boolean('disableAiReply').notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('chat_leads', table => {
    table.dropColumn('disableAiReply');
    table.boolean('aiEnabled').notNullable().defaultTo(true);
  });
}
