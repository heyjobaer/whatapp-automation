import type { Knex } from 'knex';

/** `lid_mappings` — global `lid -> phone` resolution cache. sessionId is provenance only (no FK). */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('lid_mappings', table => {
    table.string('lid').notNullable().primary();
    table.string('phone').nullable();
    table.string('sessionId').nullable();
    table.timestamp('updatedAt', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(['phone'], 'IDX_lid_mappings_phone');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('lid_mappings');
}
