import type { Knex } from 'knex';
import { seedRolesAndAdmin } from '../../auth/auth.seed';

export async function seed(knex: Knex): Promise<void> {
  const result = await seedRolesAndAdmin(knex);

  if (result.createdAdmin && result.password) {
    // eslint-disable-next-line no-console
    console.log(
      `\n  👤 Seeded SUPER_ADMIN in the database: ${result.email}\n     password: ${result.password}` +
        `${result.generated ? '   (randomly generated — set SUPER_ADMIN_PASSWORD in .env to pin it)' : ''}\n`,
    );
  } else {
    // eslint-disable-next-line no-console
    console.log('  ✅ Roles ensured; users already present — no admin created.');
  }
}
