import type { Knex } from 'knex';

/**
 * `ai_settings` — a single-row, admin-editable configuration for the AI auto-responder (provider,
 * API key, model, auto-reply toggle, reply delay, agency name, system-prompt override). Once created
 * this is the runtime source of truth; env vars are only used to seed the first row.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('ai_settings', table => {
    table.uuid('id').notNullable().primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('provider', 40).notNullable().defaultTo('groq');
    table.text('apiKey').nullable();
    table.string('model', 120).notNullable().defaultTo('llama-3.3-70b-versatile');
    table.boolean('autoReplyEnabled').notNullable().defaultTo(true);
    table.integer('replyDelayMinMs').notNullable().defaultTo(20000);
    table.integer('replyDelayMaxMs').notNullable().defaultTo(30000);
    table.string('agencyName', 200).nullable();
    table.text('systemPrompt').nullable();
    table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updatedAt', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('ai_settings');
}
