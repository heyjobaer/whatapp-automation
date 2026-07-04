/**
 * Reset (or create) the SUPER_ADMIN login from SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD in `.env`.
 *
 * First-boot seeding only creates an admin when the `users` table is EMPTY, so changing the password
 * in `.env` after the account already exists does nothing — logging in then fails with "Invalid
 * credentials". This script always (re)sets the password of the matching account, so use it after
 * editing SUPER_ADMIN_PASSWORD.
 *
 * Run (after `npm run build`):  npm run admin:reset
 */
import 'reflect-metadata';
import '../../config/load-env';
import knex from 'knex';
import * as bcrypt from 'bcryptjs';
import { buildKnexConfig } from './database.module';
import { BCRYPT_ROUNDS } from '../auth/auth.seed';
import { ROLE_SEED, UserRole } from '../auth/entities/role.entity';

async function main(): Promise<void> {
  const email = process.env.SUPER_ADMIN_EMAIL || 'admin@openwa.local';
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!password) {
    console.error('✖ SUPER_ADMIN_PASSWORD is not set in .env — set it, then re-run `npm run admin:reset`.');
    process.exit(1);
  }

  const db = knex(buildKnexConfig());
  try {
    // Ensure the roles exist (idempotent) so roleId can be resolved.
    for (const role of ROLE_SEED) {
      await db('roles')
        .insert({ name: role.name, rank: role.rank, description: role.description })
        .onConflict('name')
        .merge(['rank', 'description', 'updatedAt']);
    }
    const superRole = await db('roles').where({ name: UserRole.SUPER_ADMIN }).first();
    if (!superRole) throw new Error('SUPER_ADMIN role missing after seeding roles');

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const existing = await db('users').where({ email }).first();

    if (existing) {
      await db('users')
        .where({ id: existing.id })
        .update({ passwordHash, roleId: superRole.id, isActive: true, updatedAt: db.fn.now() });
      console.log(`✅ Reset password for existing SUPER_ADMIN: ${email}`);
    } else {
      await db('users').insert({ email, passwordHash, name: 'Super Admin', roleId: superRole.id });
      console.log(`✅ Created SUPER_ADMIN: ${email}`);
    }
    console.log(`   Log in with ${email} and the SUPER_ADMIN_PASSWORD set in .env.`);
  } finally {
    await db.destroy();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
