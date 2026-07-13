// API types for the OpenWA dashboard (ported 1:1 from the React dashboard's services/api.ts).

export interface Session {
  id: string;
  name: string;
  status: 'created' | 'idle' | 'initializing' | 'connecting' | 'qr_ready' | 'ready' | 'disconnected' | 'failed';
  phone?: string;
  pushName?: string;
  lastActive?: string;
  createdAt: string;
  updatedAt: string;
  /** Human-readable reason for the most recent terminal engine failure (set only when status is 'failed'). */
  lastError?: string | null;
}

export interface SessionStats {
  total: number;
  active: number;
  ready: number;
  disconnected: number;
  byStatus: Record<string, number>;
  memoryUsage: { heapUsed: number; heapTotal: number; rss: number };
}

export type WebhookFilterOperator = 'is' | 'isNot' | 'contains' | 'equals';

export interface WebhookFilterCondition {
  field: string;
  operator: WebhookFilterOperator;
  value: string | string[] | boolean;
  caseSensitive?: boolean;
}

export interface WebhookFilters {
  conditions: WebhookFilterCondition[];
}

export interface Webhook {
  id: string;
  sessionId: string;
  url: string;
  events: string[];
  filters?: WebhookFilters | null;
  active: boolean;
  secret?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageTemplate {
  id: string;
  sessionId: string;
  name: string;
  body: string;
  header?: string | null;
  footer?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TemplatePayload {
  name: string;
  body: string;
  header?: string | null;
  footer?: string | null;
}

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'READONLY';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoginResponse {
  token: string;
  user: { id: string; email: string; name: string; role: UserRole };
}

export interface AuditLog {
  id: string;
  action: string;
  severity: 'info' | 'warn' | 'error';
  apiKeyId?: string;
  apiKeyName?: string;
  sessionId?: string;
  sessionName?: string;
  ipAddress?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  errorMessage?: string;
  createdAt: string;
}

export interface MessageResponse {
  messageId: string;
  timestamp: number;
}

// Chat summary returned by GET /sessions/:id/chats (mirrors the backend ChatSummary).
export interface Chat {
  id: string;
  name: string;
  isGroup: boolean;
  unreadCount: number;
  timestamp: number;
  lastMessage?: string;
}

// Engine-neutral message types (mirrors the backend's IWhatsAppEngine MessageType). The backend
// normalizes raw engine tokens at the adapter boundary (#265/#270), so persisted rows, the
// message.received/sent payloads, and the websocket all use these values.
export const MESSAGE_TYPES = [
  'text',
  'image',
  'video',
  'audio',
  'voice',
  'document',
  'sticker',
  'location',
  'contact',
  'call',
  'revoked',
  'unknown',
] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

/** Coerce an arbitrary string (e.g. a raw websocket payload field) to a known MessageType. */
export function asMessageType(value: string | undefined): MessageType {
  return (MESSAGE_TYPES as readonly string[]).includes(value ?? '') ? (value as MessageType) : 'unknown';
}

export interface ChatMessage {
  id: string;
  waMessageId?: string;
  chatId: string;
  from: string;
  to: string;
  body: string;
  type: MessageType;
  direction: 'incoming' | 'outgoing';
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  timestamp?: number;
  createdAt: string;
  metadata?: {
    media?: { mimetype: string; filename?: string; data?: string; omitted?: boolean; sizeBytes?: number };
    quotedMessage?: { id: string; body: string };
    reactions?: Record<string, string>;
    call?: { video: boolean; missed: boolean };
  };
}

// Live WhatsApp message from the engine history endpoint (not a persisted DB row): it carries `fromMe`
// instead of `direction`/`status`. Used to backfill a chat thread the gateway never captured live.
export interface EngineHistoryMessage {
  id: string;
  chatId: string;
  from: string;
  to: string;
  body: string;
  type: string;
  timestamp: number;
  fromMe?: boolean;
  media?: { mimetype: string; filename?: string; data?: string };
}

export interface SendMediaPayload {
  base64?: string;
  url?: string;
  mimetype?: string;
  filename?: string;
  caption?: string;
}

export interface HealthStatus {
  status: 'ok' | 'error';
  timestamp?: string;
  /** Running backend version (from package.json) — read live so the sidebar never shows a stale build. */
  version?: string;
  details?: {
    database?: { status: string };
    redis?: { status: string };
    queue?: { status: string };
  };
}

export interface InfraStatus {
  // `builtIn` = OpenWA's own bundled container is actually running and backing this service (live),
  // not just the saved intent — falls back to the saved flag when Docker is unavailable. (#488)
  database: { connected: boolean; type: string; host: string; builtIn: boolean };
  redis: { enabled: boolean; connected: boolean; host: string; port: number; builtIn: boolean };
  queue: {
    enabled: boolean;
    webhooks: { pending: number; completed: number; failed: number };
  };
  storage: { type: 'local' | 's3'; path?: string; bucket?: string; builtIn: boolean; s3Available?: boolean };
  engine: {
    type: string;
    headless: boolean;
    webVersion?: string | null;
    webVersionSource?: 'pinned' | 'auto' | 'native';
  };
}

// Saved infrastructure config (from data/.env.generated) used to hydrate the form.
// Secrets are never returned — `*Set` flags indicate whether a value is stored.
export interface SavedConfig {
  database: {
    type: 'sqlite' | 'postgres';
    builtIn: boolean;
    host: string;
    port: string;
    username: string;
    database: string;
    poolSize: number;
    sslEnabled: boolean;
    sslRejectUnauthorized: boolean;
    passwordSet: boolean;
  };
  redis: { enabled: boolean; builtIn: boolean; host: string; port: string; passwordSet: boolean };
  queue: { enabled: boolean };
  storage: {
    type: 'local' | 's3';
    builtIn: boolean;
    localPath: string;
    s3Bucket: string;
    s3Region: string;
    s3Endpoint: string;
    s3CredentialsSet: boolean;
  };
  engine: { type: string; headless: boolean; sessionDataPath: string; browserArgs: string };
}

export interface SaveConfigPayload {
  database?: {
    type: 'sqlite' | 'postgres';
    builtIn?: boolean;
    host?: string;
    port?: string;
    username?: string;
    password?: string;
    database?: string;
    poolSize?: number;
    sslEnabled?: boolean;
    sslRejectUnauthorized?: boolean;
  };
  redis?: {
    enabled?: boolean;
    builtIn?: boolean;
    host?: string;
    port?: string;
    password?: string;
  };
  queue?: {
    enabled?: boolean;
  };
  storage?: {
    type: 'local' | 's3';
    builtIn?: boolean;
    localPath?: string;
    s3Bucket?: string;
    s3Region?: string;
    s3AccessKey?: string;
    s3SecretKey?: string;
    s3Endpoint?: string;
  };
  engine?: {
    type?: string;
    headless?: boolean;
    sessionDataPath?: string;
    browserArgs?: string;
  };
}

export interface Settings {
  general: { apiBaseUrl: string; sessionTimeout: number; autoReconnect: boolean; debugMode: boolean };
  api: { rateLimit: number; rateLimitWindow: number; enableDocs: boolean };
  notifications: { emailEnabled: boolean; notificationEmail: string; webhookAlerts: boolean };
}

export interface CheckNumberResponse {
  number: string;
  exists: boolean;
  /** Engine-canonical WhatsApp id for the number (e.g. `…@c.us` or `…@lid`), or null if unregistered. */
  whatsappId: string | null;
}

export interface Engine {
  id: string;
  name: string;
  enabled: boolean;
  features: string[];
  /** Underlying engine library (e.g. whatsapp-web.js 1.34.7), distinct from the adapter version. */
  library?: { name: string; version: string };
}

// ── Statistics API (mirrors src/modules/stats) ──

export type StatsPeriod = '24h' | '7d' | '30d';

export interface OverviewStats {
  sessions: { active: number; total: number; byStatus: Record<string, number> };
  messages: { sent: number; received: number; failed: number; today: { sent: number; received: number } };
}

export interface MessageTimeSeriesPoint {
  timestamp: string;
  sent: number;
  received: number;
}

export interface MessageStats {
  timeSeries: MessageTimeSeriesPoint[];
  byType: Record<string, number>;
  bySession: Array<{ sessionId: string; name: string; sent: number; received: number }>;
  topChats: Array<{ chatId: string; messageCount: number }>;
}

// ── Mortgage products (the UK broker's "product list") ──
export type MortgageProductStatus = 'available' | 'withdrawn';
export type MortgageCategory =
  | 'residential'
  | 'first-time-buyer'
  | 'home-mover'
  | 'remortgage'
  | 'buy-to-let';
export type RateType = 'fixed' | 'tracker' | 'discount' | 'variable';
export type RepaymentType = 'repayment' | 'interest-only';

export interface MortgageProduct {
  id: string;
  lender: string;
  productName: string;
  category: MortgageCategory | string;
  rateType: RateType | string;
  initialRate: number;
  initialPeriodMonths: number;
  followOnRate?: number | null;
  maxLtvPercent: number;
  maxTermYears: number;
  productFee: number;
  repaymentType: RepaymentType | string;
  ercApplies: boolean;
  status: MortgageProductStatus | string;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface MortgageProductPage {
  data: MortgageProduct[];
  total: number;
}

/** Create/update payload — the server fills id/timestamps and defaults. */
export interface MortgageProductPayload {
  lender: string;
  productName: string;
  category?: MortgageCategory | string;
  rateType?: RateType | string;
  initialRate: number;
  initialPeriodMonths?: number;
  followOnRate?: number | null;
  maxLtvPercent?: number;
  maxTermYears?: number;
  productFee?: number;
  repaymentType?: RepaymentType | string;
  ercApplies?: boolean;
  status?: MortgageProductStatus | string;
  description?: string | null;
}

// ── AI lead qualification (per session+chat, powers the Hot/Warm/Cold marking) ──
export interface ChatLead {
  id: string;
  sessionId: string;
  chatId: string;
  phone?: string | null;
  name?: string | null;
  language: string;
  budget?: string | null;
  purpose?: string | null;
  propType?: string | null;
  isLead: boolean;
  leadScore: number;
  /** Per-chat "Disable AI reply" toggle. Defaults to false (AI replies); when true the AI stays silent. */
  disableAiReply: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// ── AI settings (admin-editable, DB-backed; API key is never returned raw) ──
export interface AiSettingsView {
  provider: string;
  model: string;
  autoReplyEnabled: boolean;
  replyDelayMinMs: number;
  replyDelayMaxMs: number;
  agencyName: string | null;
  assistantName: string | null;
  systemPrompt: string | null;
  apiKeySet: boolean;
  apiKeyPreview: string | null;
  updatedAt: string;
}

export interface AiSettingsUpdate {
  provider?: string;
  apiKey?: string;
  model?: string;
  autoReplyEnabled?: boolean;
  replyDelayMinMs?: number;
  replyDelayMaxMs?: number;
  agencyName?: string | null;
  assistantName?: string | null;
  systemPrompt?: string | null;
}
