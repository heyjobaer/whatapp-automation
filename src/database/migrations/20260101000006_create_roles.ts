import type { Knex } from 'knex';

/**
 * `roles` — the authorization levels, stored in their own table. Seeded (see the roles seed /
 * AuthService boot seeding) with SUPER_ADMIN, ADMIN, READONLY. `users.roleId` references `roles.id`.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('roles', table => {
    table.increments('id').primary();
    table.string('name', 30).notNullable().unique(); // SUPER_ADMIN | ADMIN | READONLY
    table.integer('rank').notNullable().defaultTo(0); // higher = more privileged (for hierarchy checks)
    table.string('description', 255).nullable();
    table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updatedAt', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('roles');
}
