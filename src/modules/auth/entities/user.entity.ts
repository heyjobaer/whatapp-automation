/**
 * A user account (the authentication table `users`). Email + password login; `roleId` is the
 * reference id into the `roles` table. Plain data class — persistence is handled by the Knex layer.
 */
import { UserRole } from './role.entity';

export class User {
  id: string;

  email: string;

  passwordHash: string;

  name: string;

  /** Reference id into the roles table. */
  roleId: number;

  isActive: boolean;

  lastLoginAt: Date | null;

  createdAt: Date;

  updatedAt: Date;
}

/** The authenticated principal attached to the request (from the JWT). */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}
