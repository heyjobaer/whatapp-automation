/**
 * Authorization roles, stored in their own `roles` table. `users.roleId` references `roles.id`.
 * Plain data class — persistence is handled by the Knex data-access layer.
 */

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  READONLY = 'READONLY',
}

/** Privilege ranking for hierarchy checks (higher = more privileged). */
export const ROLE_RANK: Record<UserRole, number> = {
  [UserRole.READONLY]: 1,
  [UserRole.ADMIN]: 2,
  [UserRole.SUPER_ADMIN]: 3,
};

/** The seed definitions for the three roles. */
export const ROLE_SEED: Array<{ name: UserRole; rank: number; description: string }> = [
  { name: UserRole.SUPER_ADMIN, rank: 3, description: 'Full access, including user & role management' },
  { name: UserRole.ADMIN, rank: 2, description: 'Read + write access to all WhatsApp features' },
  { name: UserRole.READONLY, rank: 1, description: 'Read-only access' },
];

export class Role {
  id: number;

  name: UserRole;

  rank: number;

  description: string | null;

  createdAt: Date;

  updatedAt: Date;
}
