import { Injectable, NestMiddleware, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../../modules/auth/auth.service';
import { UserRole } from '../../modules/auth/entities/role.entity';

/**
 * Protects the Bull Board UI (/admin/queues).
 *
 * Bull Board is mounted as raw Express middleware by @bull-board/nestjs, so the global JWT guard —
 * which only runs on Nest controller handlers — does not cover it. This middleware requires a valid
 * ADMIN (or SUPER_ADMIN) JWT, supplied via `Authorization: Bearer <token>` (or the `X-API-Key`
 * header). No query-string fallback — a token in the URL leaks into logs/history.
 */
@Injectable()
export class BullBoardAuthMiddleware implements NestMiddleware {
  constructor(private readonly authService: AuthService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    try {
      const token = this.extractToken(req);
      if (!token) {
        throw new UnauthorizedException('Authentication is required to access the queue dashboard');
      }
      const user = this.authService.verifyToken(token);
      if (!this.authService.hasRole(user, UserRole.ADMIN)) {
        throw new ForbiddenException('Admin role required to access the queue dashboard');
      }
      next();
    } catch (err) {
      // Forward to Nest's exception layer so the response uses the standard format.
      next(err);
    }
  }

  private extractToken(req: Request): string | undefined {
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);

    const header = req.headers['x-api-key'];
    if (typeof header === 'string' && header) return header;

    return undefined;
  }
}
