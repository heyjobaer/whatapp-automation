import {
  Injectable,
  Inject,
  OnModuleInit,
  UnauthorizedException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Knex } from 'knex';
import * as bcrypt from 'bcryptjs';
import { KNEX_CONNECTION } from '../database/database.module';
import { createLogger } from '../shared/logger.service';
import { ROLE_RANK, UserRole } from './entities/role.entity';
import { AuthUser } from './entities/user.entity';
import { CreateUserDto, UpdateUserDto } from './dto';
import { BCRYPT_ROUNDS, seedRolesAndAdmin } from './auth.seed';
import { isUniqueConstraintError } from '../../common/utils/unique-constraint.util';

/** A user row joined with its role name. */
interface UserRow {
  id: string;
  email: string;
  name: string;
  roleId: number;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = createLogger('AuthService');

  constructor(
    @Inject(KNEX_CONNECTION) private readonly knex: Knex,
    private readonly jwt: JwtService,
  ) {}

  /** Seed roles + a first SUPER_ADMIN on boot (zero-config), and print a welcome banner. */
  async onModuleInit(): Promise<void> {
    const result = await seedRolesAndAdmin(this.knex);

    const apiBaseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 2785}`;
    const dashboardUrl = process.env.DASHBOARD_URL || apiBaseUrl;
    this.logger.log('');
    this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.log('  🟢 Welcome to OpenWA - WhatsApp API Gateway');
    this.logger.log(`  📊 Dashboard: ${dashboardUrl}`);
    this.logger.log(`  📚 API Docs:  ${apiBaseUrl}/api/docs`);
    if (result.createdAdmin) {
      this.logger.log('  👤 SUPER_ADMIN account created — sign in at POST /api/auth/login:');
      this.logger.log(`     email:    ${result.email}`);
      this.logger.log(
        result.generated
          ? `     password: ${result.password}   (randomly generated — capture it now; set SUPER_ADMIN_PASSWORD in .env to pin it)`
          : '     password: (as configured via SUPER_ADMIN_PASSWORD)',
      );
    } else {
      this.logger.log('  👤 Sign in at POST /api/auth/login with your email & password.');
    }
    this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.log('');
  }

  /** Verify email + password and issue a signed JWT. */
  async login(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
    const user = (await this.userQuery().where('users.email', email).first()) as UserRow | undefined;
    // Always run a bcrypt compare (even on a missing user) to avoid a user-enumeration timing signal.
    const hash = user?.email ? await this.rawHash(user.id) : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinva';
    const valid = await bcrypt.compare(password, hash);
    if (!user || !valid) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedException('Account is disabled');

    await this.knex('users').where({ id: user.id }).update({ lastLoginAt: new Date(), updatedAt: this.knex.fn.now() });

    const authUser: AuthUser = { id: user.id, email: user.email, name: user.name, role: user.role };
    const token = await this.jwt.signAsync({ sub: user.id, email: user.email, name: user.name, role: user.role });
    return { token, user: authUser };
  }

  /**
   * Verify a raw JWT (used by non-HTTP entrypoints that don't go through the passport guard:
   * the WebSocket gateway and the Bull-Board middleware). Returns the principal.
   */
  verifyToken(token: string): AuthUser {
    try {
      const payload = this.jwt.verify<{ sub: string; email: string; name: string; role: UserRole }>(token);
      return { id: payload.sub, email: payload.email, name: payload.name, role: payload.role };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  /** True when `user`'s role rank meets or exceeds the required role (SUPER_ADMIN > ADMIN > READONLY). */
  hasRole(user: AuthUser, required: UserRole): boolean {
    return ROLE_RANK[user.role] >= ROLE_RANK[required];
  }

  async getMe(userId: string): Promise<PublicUser> {
    const user = (await this.userQuery().where('users.id', userId).first()) as UserRow | undefined;
    if (!user) throw new NotFoundException('User not found');
    return this.toPublic(user);
  }

  // ===== User management (SUPER_ADMIN) =====

  async listUsers(): Promise<PublicUser[]> {
    const rows = (await this.userQuery().orderBy('users.createdAt', 'desc')) as UserRow[];
    return rows.map(r => this.toPublic(r));
  }

  async createUser(dto: CreateUserDto): Promise<PublicUser> {
    const roleId = await this.resolveRoleId(dto.role);
    try {
      const [row] = (await this.knex('users')
        .insert({
          email: dto.email,
          passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
          name: dto.name,
          roleId,
        })
        .returning('id')) as Array<{ id: string }>;
      this.logger.log(`User created: ${dto.email}`, { role: dto.role, action: 'user_created' });
      return this.getMe(row.id);
    } catch (err) {
      if (isUniqueConstraintError(err)) throw new ConflictException(`A user with email '${dto.email}' already exists`);
      throw err;
    }
  }

  async updateUser(id: string, dto: UpdateUserDto): Promise<PublicUser> {
    await this.getMe(id); // 404 if missing
    const patch: Record<string, unknown> = { updatedAt: this.knex.fn.now() };
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.isActive !== undefined) patch.isActive = dto.isActive;
    if (dto.role !== undefined) patch.roleId = await this.resolveRoleId(dto.role);
    if (dto.password !== undefined) patch.passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    await this.knex('users').where({ id }).update(patch);
    return this.getMe(id);
  }

  async deleteUser(id: string, actingUserId: string): Promise<void> {
    if (id === actingUserId) throw new BadRequestException('You cannot delete your own account');
    const target = (await this.userQuery().where('users.id', id).first()) as UserRow | undefined;
    if (!target) throw new NotFoundException('User not found');
    // Never leave the system without a SUPER_ADMIN.
    if (target.role === UserRole.SUPER_ADMIN) {
      const [{ count }] = await this.knex('users')
        .join('roles', 'users.roleId', 'roles.id')
        .where('roles.name', UserRole.SUPER_ADMIN)
        .count<{ count: string }[]>('* as count');
      if (Number(count) <= 1) throw new BadRequestException('Cannot delete the last SUPER_ADMIN');
    }
    await this.knex('users').where({ id }).del();
    this.logger.log(`User deleted: ${target.email}`, { action: 'user_deleted' });
  }

  // ===== helpers =====

  private userQuery(): Knex.QueryBuilder {
    return this.knex('users')
      .join('roles', 'users.roleId', 'roles.id')
      .select(
        'users.id',
        'users.email',
        'users.name',
        'users.roleId',
        'users.isActive',
        'users.lastLoginAt',
        'users.createdAt',
        'users.updatedAt',
        this.knex.ref('roles.name').as('role'),
      );
  }

  private async rawHash(userId: string): Promise<string> {
    const row = (await this.knex('users').where({ id: userId }).select('passwordHash').first()) as
      | { passwordHash: string }
      | undefined;
    return row?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinva';
  }

  private async resolveRoleId(role: UserRole): Promise<number> {
    const row = (await this.knex('roles').where({ name: role }).select('id').first()) as { id: number } | undefined;
    if (!row) throw new BadRequestException(`Unknown role '${role}'`);
    return row.id;
  }

  private toPublic(row: UserRow): PublicUser {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      isActive: row.isActive,
      lastLoginAt: row.lastLoginAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
