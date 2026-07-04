import { Global, Module, Provider, OnApplicationShutdown, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import knex, { Knex } from 'knex';
import * as path from 'path';
import * as fs from 'fs';
import { createLogger } from '../shared/logger.service';

/** DI token for the shared Knex connection. Inject with `@Inject(KNEX_CONNECTION) knex: Knex`. */
export const KNEX_CONNECTION = 'KNEX_CONNECTION';

const logger = createLogger('Database');

class FileMigrationSource implements Knex.MigrationSource<string> {
  constructor(
    private readonly directory: string,
    private readonly ext: 'ts' | 'js',
  ) {}

  async getMigrations(): Promise<string[]> {
    if (!fs.existsSync(this.directory)) return [];
    return fs
      .readdirSync(this.directory)
      .filter(f => f.endsWith(`.${this.ext}`) && !f.endsWith('.d.ts'))
      .sort();
  }

  getMigrationName(migration: string): string {
    return migration.replace(/\.(ts|js)$/, '');
  }

  async getMigration(migration: string): Promise<Knex.Migration> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(path.join(this.directory, migration)) as Knex.Migration;
  }
}

/**
 * One-time, idempotent heal: strip any `.ts`/`.js` suffix from existing `knex_migrations` rows so a
 * ledger written before the extension-agnostic naming (above) matches the current run. No-op when the
 * table is absent (fresh DB) or already normalized.
 */
async function normalizeMigrationLedger(db: Knex): Promise<void> {
  if (!(await db.schema.hasTable('knex_migrations'))) return;
  const updated = await db('knex_migrations')
    .whereRaw("name ~ '\\.(ts|js)$'")
    .update({ name: db.raw("regexp_replace(name, '\\.(ts|js)$', '')") });
  if (updated > 0) logger.log(`Normalized ${updated} migration ledger name(s) to be run-mode independent.`);
}

/**
 * Builds the Knex config for the single PostgreSQL database. Shared by this module and the CLI
 * knexfile so migrations and the running app always target the same database.
 */
export function buildKnexConfig(): Knex.Config {
  // In a ts-node run this file is .ts and migrations load as .ts; in the built image it is .js.
  const ext = __filename.endsWith('.ts') ? 'ts' : 'js';
  const num = (v: string | undefined, d: number): number => {
    const n = parseInt(v ?? '', 10);
    return Number.isFinite(n) ? n : d;
  };
  return {
    client: 'pg',
    connection: process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host: process.env.DATABASE_HOST || 'localhost',
          port: num(process.env.DATABASE_PORT, 5432),
          user: process.env.DATABASE_USERNAME,
          password: process.env.DATABASE_PASSWORD,
          database: process.env.DATABASE_NAME || 'openwa',
          ssl:
            process.env.DATABASE_SSL === 'true'
              ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
              : false,
        },
    pool: { min: 0, max: num(process.env.DATABASE_POOL_SIZE, 10) },
    migrations: {
      migrationSource: new FileMigrationSource(path.join(__dirname, 'migrations'), ext),
      tableName: 'knex_migrations',
    },
    seeds: { directory: path.join(__dirname, 'seeds'), extension: ext, loadExtensions: [`.${ext}`] },
  };
}

const knexProvider: Provider = {
  provide: KNEX_CONNECTION,
  inject: [ConfigService],
  useFactory: async (): Promise<Knex> => {
    const db = knex(buildKnexConfig());
    // Run pending migrations at boot so a fresh deployment is zero-config (opt out with
    // DATABASE_AUTO_MIGRATE=false and run `npm run migrate:latest` yourself).
    if (process.env.DATABASE_AUTO_MIGRATE !== 'false') {
      // Heal any extension-suffixed ledger rows first so a DB migrated in a different run mode
      // (ts-node vs compiled) doesn't trip Knex's "migration directory is corrupt" check.
      await normalizeMigrationLedger(db);
      const [, applied] = (await db.migrate.latest()) as [number, string[]];
      if (applied.length > 0) logger.log(`Applied ${applied.length} migration(s): ${applied.join(', ')}`);
    }
    return db;
  },
};

@Global()
@Module({
  providers: [knexProvider],
  exports: [KNEX_CONNECTION],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(KNEX_CONNECTION) private readonly knex: Knex) {}

  async onApplicationShutdown(): Promise<void> {
    await this.knex.destroy();
  }
}
