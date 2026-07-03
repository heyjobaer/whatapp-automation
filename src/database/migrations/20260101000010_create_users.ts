import type { Knex } from 'knex';

/**
 * `users` — the authentication table (email + password login). Replaces the old `api_keys` table.
 * `roleId` is the reference id into the `roles` table (the user's authorization level).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', table => {
    table.uuid('id').notNullable().primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email', 255).notNullable().unique();
    table.string('passwordHash', 255).notNullable();
    table.string('name', 100).notNullable();
    // Reference id into the roles table (the user's authorization level).
    table.integer('roleId').notNullable().references('id').inTable('roles').onDelete('RESTRICT');
    table.boolean('isActive').notNullable().defaultTo(true);
    table.timestamp('lastLoginAt', { useTz: true }).nullable();
    table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updatedAt', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(['roleId'], 'IDX_users_roleId');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
}
