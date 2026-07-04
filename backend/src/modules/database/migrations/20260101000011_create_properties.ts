import type { Knex } from 'knex';

/**
 * `properties` — real-estate listings (the "product list"). Ported from the AI-automation project.
 * Prices/ROI are stored as double precision so pg returns plain JS numbers (no numeric→string cast
 * needed on the API boundary). Columns are camelCase to match the rest of this schema.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('properties', table => {
    table.uuid('id').notNullable().primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 200).notNullable();
    table.string('area', 200).notNullable();
    table.string('type', 60).notNullable();
    table.integer('bedrooms').notNullable().defaultTo(0);
    table.double('priceAed').notNullable().defaultTo(0);
    table.double('priceUsd').notNullable().defaultTo(0);
    table.double('roiPercent').notNullable().defaultTo(0);
    table.string('status', 20).notNullable().defaultTo('available');
    table.string('handoverDate', 60).nullable();
    table.boolean('isOffplan').notNullable().defaultTo(false);
    table.string('developer', 120).nullable();
    table.text('description').nullable();
    table.string('brochureUrl', 500).nullable();
    table.string('imageUrl', 500).nullable();
    table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updatedAt', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(['status'], 'IDX_properties_status');
    table.index(['createdAt'], 'IDX_properties_created_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('properties');
}
