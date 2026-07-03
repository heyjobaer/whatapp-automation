import type { Knex } from 'knex';

/** `audit_logs` — audit trail. Now in the same PostgreSQL DB as everything else. */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('audit_logs', table => {
    table.uuid('id').notNullable().primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('action', 50).notNullable();
    table.string('severity', 10).notNullable().defaultTo('info');
    table.string('userId', 36).nullable();
    table.string('userEmail', 255).nullable();
    table.string('sessionId', 36).nullable();
    table.string('sessionName', 100).nullable();
    table.string('ipAddress', 45).nullable();
    table.string('userAgent', 500).nullable();
    table.string('method', 10).nullable();
    table.string('path', 500).nullable();
    table.integer('statusCode').nullable();
    table.jsonb('metadata').nullable();
    table.text('errorMessage').nullable();
    table.timestamp('createdAt', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(['action'], 'IDX_audit_logs_action');
    table.index(['userId'], 'IDX_audit_logs_userId');
    table.index(['sessionId'], 'IDX_audit_logs_sessionId');
    table.index(['createdAt'], 'IDX_audit_logs_createdAt');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_logs');
}
