import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PUBLIC_KEY, REQUIRED_ROLE_KEY } from '../decorators/auth.decorators';
import { ROLE_RANK, UserRole } from '../entities/role.entity';
import { AuthUser } from '../entities/user.entity';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Global authorization guard, enforcing the role hierarchy after JwtAuthGuard has authenticated.
 *
 * Rules:
 *  - `@RequireRole(X)` requires the user's role rank >= X's rank (SUPER_ADMIN > ADMIN > READONLY).
 *  - Any mutating request (POST/PUT/PATCH/DELETE) requires ADMIN or higher, regardless of the
 *    declared role — so a READONLY user can read but never write.
 *  - A route with no `@RequireRole` needs only authentication (READONLY+) for reads.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = request.user;
    // JwtAuthGuard runs first and rejects unauthenticated requests; this is a defensive fallback.
    if (!user) throw new ForbiddenException('Not authenticated');

    const declared = this.reflector.getAllAndOverride<UserRole | undefined>(REQUIRED_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // A write always needs at least ADMIN; a read defaults to READONLY when nothing stricter is set.
    let required: UserRole = declared ?? UserRole.READONLY;
    if (WRITE_METHODS.has(request.method) && ROLE_RANK[required] < ROLE_RANK[UserRole.ADMIN]) {
      required = UserRole.ADMIN;
    }

    if (ROLE_RANK[user.role] < ROLE_RANK[required]) {
      throw new ForbiddenException(`Insufficient permissions. Required: ${required}`);
    }
    return true;
  }
}
