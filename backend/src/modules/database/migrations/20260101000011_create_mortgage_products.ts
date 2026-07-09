import type { Knex } from 'knex';

/**
 * `mortgage_products` — the UK mortgage broker's product list (the "product list" the AI matches
 * clients against). Rates/fees are stored as double precision so pg returns plain JS numbers (no
 * numeric→string cast needed on the API boundary). Columns are camelCase to match the rest of the
 * schema.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('mortgage_products', table => {
    table.uuid('id').notNullable().primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('lender', 120).notNullable();
    table.string('productName', 200).notNullable();
    table.string('category', 40).notNullable().defaultTo('residential');
    table.string('rateType', 20).notNullable().defaultTo('fixed');
    table.double('initialRate').notNullable().defaultTo(0);
    table.integer('initialPeriodMonths').notNullable().defaultTo(0);
    table.double('followOnRate').nullable();
    table.double('maxLtvPercent').notNullable().defaultTo(0);
    table.integer('maxTermYears').notNullable().defaultTo(0);
    table.double('productFee').notNullable().defaultTo(0);
    table.string('repaymentType', 20).notNullable().defaultTo('repayment');
    table.boolean('ercApplies').notNullable().defaultTo(false);
    table.string('status', 20).notNullable().defaultTo('available');
    table.text('description').nullable();
    table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updatedAt', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(['status'], 'IDX_mortgage_products_status');
    table.index(['createdAt'], 'IDX_mortgage_products_created_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('mortgage_products');
}
