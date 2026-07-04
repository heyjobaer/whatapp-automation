import type { z } from 'zod';
import type { AuthUser } from '../../modules/auth/entities/user.entity';
import { UserRole } from '../../modules/auth/entities/role.entity';

/** A single agent-invocable capability. Protocol-neutral: no transport-specific types here. */
export interface ToolDescriptor<I = unknown> {
  /** Explicit, stable public name, e.g. 'MessageSendText'. */
  name: string;
  /** Agent-legible description: what it does, when to use it, preconditions. */
  description: string;
  /** Input contract: validates the call AND is advertised to the agent. */
  inputSchema: z.ZodType<I>;
  tier: 'read' | 'write';
  /** True for irreversible/dangerous ops (none are exposed in v1). */
  destructive?: boolean;
  /** Safe to repeat without additional effect. Defaults to (tier === 'read'). */
  idempotent?: boolean;
  /** Minimum role; checked via AuthService.hasRole. */
  requiredRole?: UserRole;
  /** If true, input MUST carry `sessionId`. */
  sessionScoped?: boolean;
  /** Result rendering hint for tool-result adapters. Default 'smart'. */
  resultDisposition?: 'json' | 'smart';
  /** Calls the service. Receives validated input + the authenticated user. */
  handler: (input: I, user: AuthUser) => Promise<unknown>;
}
