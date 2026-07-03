import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { UserRole } from '../entities/role.entity';
import { AuthUser } from '../entities/user.entity';

export const REQUIRED_ROLE_KEY = 'requiredRole';
export const PUBLIC_KEY = 'isPublic';

/**
 * Mark a route as requiring at least a given role. The RolesGuard enforces the role hierarchy
 * (SUPER_ADMIN > ADMIN > READONLY) AND treats any mutating request (POST/PUT/PATCH/DELETE) as
 * needing ADMIN+, so a READONLY user can read but never write.
 * @example @RequireRole(UserRole.ADMIN)
 */
export const RequireRole = (role: UserRole): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ROLE_KEY, role);

/**
 * Mark a route as public (no authentication required).
 * @example @Public()
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_KEY, true);

/**
 * Get the current authenticated user (or one of its fields) from the request.
 * @example @CurrentUser() user: AuthUser   |   @CurrentUser('id') userId: string
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext): AuthUser | AuthUser[keyof AuthUser] | undefined => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
