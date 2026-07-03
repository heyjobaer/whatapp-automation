import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ZodError } from 'zod';
import type { AuthService } from '../../modules/auth/auth.service';
import type { ToolDescriptor } from './tool-descriptor';
import { UserRole } from '../../modules/auth/entities/role.entity';

/**
 * Run one tool call with REST-equivalent guarantees, reusing the app's JWT auth:
 * authenticate (verify token) → authorize (role; writes require ADMIN) → validate input → handler.
 * Mirrors the REST guard-then-pipe order (auth before validation).
 *
 * @param rawKey a JWT (the MCP `Authorization: Bearer <token>` / `x-api-key` value).
 * @param onAuthenticated Optional callback invoked with the authenticated user's id immediately
 * after the token verifies and BEFORE role/input checks (used to key rate-limiters off identity).
 */
export async function invokeTool(
  tool: ToolDescriptor,
  rawInput: unknown,
  rawKey: string | undefined,
  authService: AuthService,
  onAuthenticated?: (userId: string) => void,
): Promise<unknown> {
  if (!rawKey) {
    throw new UnauthorizedException('Missing bearer token');
  }
  // Pre-extract sessionId BEFORE full validation (REST reads req.params.sessionId in the guard).
  const probe = (rawInput ?? {}) as Record<string, unknown>;
  const sessionId = tool.sessionScoped && typeof probe.sessionId === 'string' ? probe.sessionId : undefined;
  if (tool.sessionScoped && !sessionId) {
    throw new BadRequestException('sessionId is required for this tool');
  }

  const user = authService.verifyToken(rawKey);
  onAuthenticated?.(user.id);

  // A write tool always needs ADMIN+; otherwise the declared minimum role (default READONLY).
  const requiredRole = tool.tier === 'write' ? UserRole.ADMIN : tool.requiredRole;
  if (requiredRole && !authService.hasRole(user, requiredRole)) {
    throw new ForbiddenException('Your role lacks permission for this tool');
  }

  let input: unknown;
  try {
    input = tool.inputSchema.parse(rawInput);
  } catch (e) {
    if (e instanceof ZodError) {
      throw new BadRequestException(e.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`));
    }
    throw e;
  }
  return tool.handler(input, user);
}
