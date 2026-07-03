/**
 * Knex CLI configuration. Loads environment with the same precedence as the app
 * (`process.env` > `.env` > `data/.env.generated`) so `knex migrate`/`knex seed` always target the
 * same PostgreSQL database the running app uses.
 *
 * Lives under `src/` so `nest build` emits it to `dist/knexfile.js` for the compiled `*:prod` scripts.
 *
 *   npm run migrate:latest     # apply pending migrations (dev, ts-node)
 *   npm run migrate:latest:prod
 *   npm run migrate:rollback
 *   npm run seed:run
 */
import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import type { Knex } from 'knex';
import { clearBlankEnv, BLANK_SHADOWED_ENV_KEYS } from './config/env-precedence';
import { buildKnexConfig } from './database/database.module';

clearBlankEnv(process.env, BLANK_SHADOWED_ENV_KEYS);
const userEnvPath = path.resolve(process.cwd(), '.env');
const generatedEnvPath = path.resolve(process.cwd(), 'data', '.env.generated');
if (fs.existsSync(userEnvPath)) config({ path: userEnvPath, override: false });
if (fs.existsSync(generatedEnvPath)) config({ path: generatedEnvPath, override: false });

const knexConfig: Knex.Config = buildKnexConfig();

export default knexConfig;
