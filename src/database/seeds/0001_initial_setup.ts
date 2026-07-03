import type { Knex } from 'knex';
import { join } from 'path';
import { seedRolesAndAdmin } from '../../modules/auth/auth.seed';
import { writeSecretFile } from '../../common/utils/secret-file';

/**
 * Initial-setup seed for a newly provisioned project.
 *
 * Idempotent: upserts the three roles (SUPER_ADMIN, ADMIN, READONLY) and, when the `users` table is
 * empty, creates a single SUPER_ADMIN account. Credentials come from `SUPER_ADMIN_EMAIL` /
 * `SUPER_ADMIN_PASSWORD`, else a default email and a random password (written to
 * `data/.admin-credentials`, 0600, so the operator can capture it).
 *
 * The running app also self-seeds this on first boot (AuthService.onModuleInit); this seed exists so
 * a schema-managed / CI deployment can provision it up front without starting the app.
 */
export async function seed(knex: Knex): Promise<void> {
  const result = await seedRolesAndAdmin(knex);

  if (result.createdAdmin && result.password) {
    try {
      writeSecretFile(join(process.cwd(), 'data', '.admin-credentials'), `${result.email}\n${result.password}\n`);
    } catch {
      /* best-effort */
    }
    // eslint-disable-next-line no-console
    console.log(
      `\n  👤 Seeded SUPER_ADMIN: ${result.email}\n     password: ${result.password}\n     (also written to data/.admin-credentials)\n`,
    );
  } else {
    // eslint-disable-next-line no-console
    console.log('  ✅ Roles ensured; users already present — no admin created.');
  }
}
