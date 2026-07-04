import type { Knex } from 'knex';

/**
 * Store the resolved phone number on each lead. The chat id alone isn't reliable — WhatsApp privacy
 * ids (`@lid`) don't contain the phone — so the AI flow resolves it via the engine
 * (whatsapp-web.js getContactLidAndPhone) and persists the digits here for the Leads table.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('chat_leads', table => {
    table.string('phone', 32).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('chat_leads', table => {
    table.dropColumn('phone');
  });
}
