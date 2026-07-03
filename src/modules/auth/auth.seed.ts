import { Knex } from 'knex';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { ROLE_SEED, UserRole } from './entities/role.entity';

export const BCRYPT_ROUNDS = 10;

/**
 * Resolve the initial SUPER_ADMIN credentials to seed on first boot.
 * `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` win when set; otherwise a sensible default email and a
 * cryptographically random password are used (surfaced once so the operator can capture it).
 */
export function resolveSeedAdmin(): { email: string; password: string; generated: boolean } {
  const email = process.env.SUPER_ADMIN_EMAIL || 'admin@openwa.local';
  const envPassword = process.env.SUPER_ADMIN_PASSWORD;
  return {
    email,
    password: envPassword || randomBytes(12).toString('base64url'),
    generated: !envPassword,
  };
}

/**
 * Idempotently seed the three roles and, when no users exist yet, a single SUPER_ADMIN user.
 * Shared by the CLI seed and AuthService boot seeding so both paths agree.
 *
 * Returns the created admin's credentials only when it actually created one (so the caller can
 * surface the generated password exactly once).
 */
export async function seedRolesAndAdmin(
  knex: Knex,
): Promise<{ createdAdmin: boolean; email?: string; password?: string; generated?: boolean }> {
  // Upsert the roles (safe to run repeatedly).
  for (const role of ROLE_SEED) {
    await knex('roles')
      .insert({ name: role.name, rank: role.rank, description: role.description })
      .onConflict('name')
      .merge(['rank', 'description', 'updatedAt']);
  }

  const [{ count }] = await knex('users').count<{ count: string }[]>('* as count');
  if (Number(count) > 0) {
    return { createdAdmin: false };
  }

  const superRole = await knex('roles').where({ name: UserRole.SUPER_ADMIN }).first();
  if (!superRole) throw new Error('SUPER_ADMIN role missing after seeding roles');

  const admin = resolveSeedAdmin();
  await knex('users').insert({
    email: admin.email,
    passwordHash: await bcrypt.hash(admin.password, BCRYPT_ROUNDS),
    name: 'Super Admin',
    roleId: superRole.id,
  });

  return { createdAdmin: true, email: admin.email, password: admin.password, generated: admin.generated };
}
