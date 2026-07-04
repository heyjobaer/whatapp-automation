/**
 * A WhatsApp session row (table `sessions`). Plain data class — persistence is handled by the Knex
 * data-access layer (services inject the Knex connection directly; see src/database/database.module.ts).
 */

export enum SessionStatus {
  CREATED = 'created',
  INITIALIZING = 'initializing',
  QR_READY = 'qr_ready',
  AUTHENTICATING = 'authenticating',
  READY = 'ready',
  DISCONNECTED = 'disconnected',
  FAILED = 'failed',
}

export class Session {
  id: string;

  name: string;

  status: SessionStatus;

  phone: string | null;

  pushName: string | null;

  config: Record<string, unknown>;

  // Phase 3: Proxy per session
  proxyUrl: string | null;

  proxyType: 'http' | 'https' | 'socks4' | 'socks5' | null;

  connectedAt: Date | null;

  lastActiveAt: Date | null;

  createdAt: Date;

  updatedAt: Date;

  /**
   * Transient (non-persisted) human-readable reason for the most recent terminal engine failure.
   * Populated at read time from the in-memory error map so the dashboard can explain a FAILED
   * status; intentionally not a column because it is runtime state that resets on re-init.
   */
  lastError?: string;
}
