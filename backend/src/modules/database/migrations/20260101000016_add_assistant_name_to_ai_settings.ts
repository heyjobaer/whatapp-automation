import type { Knex } from 'knex';

/**
 * Add `assistantName` to ai_settings — the human first name the AI introduces itself with on
 * WhatsApp (e.g. "Hi, this is Sarah from <agency>"). Nullable; when unset the AI just uses the
 * agency name.
 */
export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn('ai_settings', 'assistantName');
  if (has) return;
  await knex.schema.alterTable('ai_settings', table => {
    table.string('assistantName', 80).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn('ai_settings', 'assistantName');
  if (!has) return;
  await knex.schema.alterTable('ai_settings', table => {
    table.dropColumn('assistantName');
  });
}
