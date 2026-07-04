import type { Knex } from 'knex';

/**
 * `chat_leads` — per-chat AI lead qualification state (one row per session+chat). The AI updates
 * this after each auto-reply: extracted budget/purpose/type, captured name/language, an is-lead flag
 * and a 0–100 lead score. Powers the Hot/Warm/Cold marking in the dashboard.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('chat_leads', table => {
    table.uuid('id').notNullable().primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('sessionId').notNullable().references('id').inTable('sessions').onDelete('CASCADE');
    table.string('chatId', 100).notNullable();
    table.string('name', 200).nullable();
    table.string('language', 8).notNullable().defaultTo('en');
    table.string('budget', 60).nullable();
    table.string('purpose', 40).nullable();
    table.string('propType', 40).nullable();
    table.boolean('isLead').notNullable().defaultTo(false);
    table.integer('leadScore').notNullable().defaultTo(0);
    table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updatedAt', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['sessionId', 'chatId'], { indexName: 'IDX_chat_leads_session_chat' });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('chat_leads');
}
