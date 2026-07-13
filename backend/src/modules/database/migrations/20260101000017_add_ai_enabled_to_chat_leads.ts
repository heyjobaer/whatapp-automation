import type { Knex } from 'knex';

/**
 * Per-chat AI auto-reply toggle. `aiEnabled` defaults to true so existing chats keep replying;
 * an admin can flip it to false to silence the AI for one specific conversation (e.g. to take
 * the chat over manually) without touching the global auto-reply setting.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('chat_leads', table => {
    table.boolean('aiEnabled').notNullable().defaultTo(true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('chat_leads', table => {
    table.dropColumn('aiEnabled');
  });
}
