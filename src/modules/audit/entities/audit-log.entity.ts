/**
 * An audit-log row (table `audit_logs`). Plain data class — persistence is handled by the Knex
 * data-access layer. Audit logs now live in the SAME PostgreSQL database as everything else;
 * `metadata` is stored as jsonb.
 */

export enum AuditAction {
  // API Key events
  API_KEY_CREATED = 'api_key_created',
  API_KEY_USED = 'api_key_used',
  API_KEY_REVOKED = 'api_key_revoked',
  API_KEY_DELETED = 'api_key_deleted',
  API_KEY_AUTH_FAILED = 'api_key_auth_failed',

  // Session events
  SESSION_CREATED = 'session_created',
  SESSION_STARTED = 'session_started',
  SESSION_STOPPED = 'session_stopped',
  SESSION_FORCE_KILLED = 'session_force_killed',
  SESSION_DELETED = 'session_deleted',
  SESSION_QR_GENERATED = 'session_qr_generated',
  SESSION_CONNECTED = 'session_connected',
  SESSION_DISCONNECTED = 'session_disconnected',

  // Message events
  MESSAGE_SENT = 'message_sent',
  MESSAGE_FAILED = 'message_failed',

  // Webhook events
  WEBHOOK_CREATED = 'webhook_created',
  WEBHOOK_DELETED = 'webhook_deleted',
  WEBHOOK_TRIGGERED = 'webhook_triggered',
  WEBHOOK_FAILED = 'webhook_failed',
}

export enum AuditSeverity {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export class AuditLog {
  id: string;

  action: AuditAction;

  severity: AuditSeverity;

  userId: string | null;

  userEmail: string | null;

  sessionId: string | null;

  sessionName: string | null;

  ipAddress: string | null;

  userAgent: string | null;

  method: string | null;

  path: string | null;

  statusCode: number | null;

  metadata: Record<string, unknown> | null;

  errorMessage: string | null;

  createdAt: Date;
}
