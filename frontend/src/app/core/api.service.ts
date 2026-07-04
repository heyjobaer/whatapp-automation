import { Injectable } from '@angular/core';
import type {
  User,
  UserRole,
  LoginResponse,
  AuditLog,
  Chat,
  ChatMessage,
  CheckNumberResponse,
  Engine,
  EngineHistoryMessage,
  HealthStatus,
  InfraStatus,
  MessageResponse,
  MessageStats,
  MessageTemplate,
  Property,
  PropertyPage,
  PropertyPayload,
  ChatLead,
  AiSettingsView,
  AiSettingsUpdate,
  SaveConfigPayload,
  SavedConfig,
  SendMediaPayload,
  Session,
  SessionStats,
  Settings,
  StatsPeriod,
  OverviewStats,
  TemplatePayload,
  Webhook,
  WebhookFilters,
} from './api.types';

// Resolve the API base URL. By default this is the same-origin relative path '/api', correct when
// the dashboard and API are served from the same origin (the default single-container setup). For a
// split-origin deployment set API_ORIGIN to the API origin (e.g. 'https://gateway.example.com') —
// the '/api' prefix is appended here.
const API_ORIGIN = '';
export const API_BASE_URL = `${API_ORIGIN.replace(/\/+$/, '')}/api`;

export const TOKEN_STORAGE_KEY = 'openwa_token';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const token = sessionStorage.getItem(TOKEN_STORAGE_KEY);

  // For FormData (file uploads) let the browser set multipart/form-data + boundary itself.
  const isFormData = options.body instanceof FormData;
  const headers: HeadersInit = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    // The stored token is missing/expired — clear it and return to login so the user isn't
    // stuck on a dashboard that 401s every request.
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    if (typeof window !== 'undefined') {
      window.location.assign('/');
      // The page is navigating away — halt this request's promise chain so callers neither
      // throw the generic error below (flashing a toast) nor receive an undefined payload.
      return new Promise<T>(() => {});
    }
  }

  if (!response.ok) {
    // On a non-JSON body (e.g. a reverse-proxy 502/503 HTML page) fall through to `HTTP <status>`
    // rather than statusText: the status code is what the toast connection-lost de-dup matches on,
    // and statusText is empty over HTTP/2 anyway.
    const error = (await response.json().catch(() => ({}))) as { message?: string };
    // Carry the HTTP status on the Error so callers can tell apart a permission 403 from a real
    // server 5xx instead of guessing from text.
    const err = new Error(error.message || `HTTP ${response.status}`) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

/**
 * Promise-based API client, grouped per backend module (same surface as the React dashboard's
 * services/api.ts). The disabled Plugins management API is intentionally not ported.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly sessions = {
    list: () => request<Session[]>('/sessions'),
    get: (id: string) => request<Session>(`/sessions/${id}`),
    create: (name: string) => request<Session>('/sessions', { method: 'POST', body: JSON.stringify({ name }) }),
    delete: (id: string) => request<void>(`/sessions/${id}`, { method: 'DELETE' }),
    start: (id: string) => request<Session>(`/sessions/${id}/start`, { method: 'POST' }),
    stop: (id: string) => request<Session>(`/sessions/${id}/stop`, { method: 'POST' }),
    forceKill: (id: string) => request<Session>(`/sessions/${id}/force-kill`, { method: 'POST' }),
    getQR: (id: string) => request<{ qrCode: string; status: string }>(`/sessions/${id}/qr`),
    requestPairingCode: (id: string, phoneNumber: string) =>
      request<{ pairingCode: string; status: string }>(`/sessions/${id}/pairing-code`, {
        method: 'POST',
        body: JSON.stringify({ phoneNumber }),
      }),
    getStats: () => request<SessionStats>('/sessions/stats/overview'),
    getGroups: (id: string) =>
      request<{ id: string; name: string; linkedParentJID?: string | null }[]>(`/sessions/${id}/groups`),
    getChats: (id: string) => request<Chat[]>(`/sessions/${id}/chats`),
    markChatRead: (id: string, chatId: string) =>
      request<{ success: boolean }>(`/sessions/${id}/chats/read`, {
        method: 'POST',
        body: JSON.stringify({ chatId }),
      }),
    markChatUnread: (id: string, chatId: string) =>
      request<{ success: boolean }>(`/sessions/${id}/chats/unread`, {
        method: 'POST',
        body: JSON.stringify({ chatId }),
      }),
    // AI lead-qualification state for every chat in the session (Hot/Warm/Cold marking).
    getLeads: (id: string) => request<ChatLead[]>(`/sessions/${id}/leads`),
    getChatMessages: (id: string, chatId: string, limit = 100) =>
      request<{ messages: ChatMessage[]; total: number }>(
        `/sessions/${id}/messages?chatId=${encodeURIComponent(chatId)}&limit=${limit}`,
      ),
    // Live history straight from WhatsApp (bypasses the DB) — backfills a thread the gateway never
    // captured, e.g. a freshly paired session whose persisted store is still empty.
    getChatHistory: (id: string, chatId: string, limit = 100, includeMedia = false) =>
      request<EngineHistoryMessage[]>(
        `/sessions/${id}/messages/${encodeURIComponent(chatId)}/history?limit=${limit}${
          includeMedia ? '&includeMedia=true' : ''
        }`,
      ),
  };

  readonly webhooks = {
    listBySession: (sessionId: string) => request<Webhook[]>(`/sessions/${sessionId}/webhooks`),
    listAll: () => request<Webhook[]>('/webhooks'),
    get: (sessionId: string, id: string) => request<Webhook>(`/sessions/${sessionId}/webhooks/${id}`),
    create: (sessionId: string, data: { url: string; events: string[]; filters?: WebhookFilters | null }) =>
      request<Webhook>(`/sessions/${sessionId}/webhooks`, { method: 'POST', body: JSON.stringify(data) }),
    update: (sessionId: string, id: string, data: Partial<Webhook>) =>
      request<Webhook>(`/sessions/${sessionId}/webhooks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (sessionId: string, id: string) =>
      request<void>(`/sessions/${sessionId}/webhooks/${id}`, { method: 'DELETE' }),
    test: (sessionId: string, id: string) =>
      request<{ success: boolean; statusCode?: number; error?: string }>(
        `/sessions/${sessionId}/webhooks/${id}/test`,
        { method: 'POST' },
      ),
  };

  readonly templates = {
    list: (sessionId: string) => request<MessageTemplate[]>(`/sessions/${sessionId}/templates`),
    get: (sessionId: string, id: string) => request<MessageTemplate>(`/sessions/${sessionId}/templates/${id}`),
    create: (sessionId: string, data: TemplatePayload) =>
      request<MessageTemplate>(`/sessions/${sessionId}/templates`, { method: 'POST', body: JSON.stringify(data) }),
    update: (sessionId: string, id: string, data: Partial<TemplatePayload>) =>
      request<MessageTemplate>(`/sessions/${sessionId}/templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (sessionId: string, id: string) =>
      request<void>(`/sessions/${sessionId}/templates/${id}`, { method: 'DELETE' }),
  };

  readonly contacts = {
    checkNumber: (sessionId: string, number: string) =>
      request<CheckNumberResponse>(`/sessions/${sessionId}/contacts/check/${encodeURIComponent(number)}`),
  };

  readonly auth = {
    login: (email: string, password: string) =>
      request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    me: () => request<User>('/auth/me'),
  };

  /** SUPER_ADMIN-only user management (replaces the old API-key management). */
  readonly users = {
    list: () => request<User[]>('/auth/users'),
    create: (data: { email: string; password: string; name: string; role: UserRole }) =>
      request<User>('/auth/users', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<{ name: string; role: UserRole; password: string; isActive: boolean }>) =>
      request<User>(`/auth/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/auth/users/${id}`, { method: 'DELETE' }),
  };

  readonly audit = {
    list: (params?: { action?: string; severity?: string; limit?: number; offset?: number }) => {
      const query = new URLSearchParams();
      if (params?.action) query.set('action', params.action);
      if (params?.severity) query.set('severity', params.severity);
      if (params?.limit) query.set('limit', String(params.limit));
      if (params?.offset) query.set('offset', String(params.offset));
      const queryStr = query.toString();
      return request<{ data: AuditLog[]; total: number }>(`/audit${queryStr ? `?${queryStr}` : ''}`);
    },
  };

  readonly messages = {
    sendText: (sessionId: string, chatId: string, text: string) =>
      request<MessageResponse>(`/sessions/${sessionId}/messages/send-text`, {
        method: 'POST',
        body: JSON.stringify({ chatId, text }),
      }),
    sendMedia: (
      sessionId: string,
      chatId: string,
      mediaType: 'image' | 'video' | 'audio' | 'document',
      payload: SendMediaPayload,
    ) =>
      request<MessageResponse>(`/sessions/${sessionId}/messages/send-${mediaType}`, {
        method: 'POST',
        body: JSON.stringify({ chatId, ...payload }),
      }),
    reply: (sessionId: string, data: { chatId: string; quotedMessageId: string; text: string }) =>
      request<MessageResponse>(`/sessions/${sessionId}/messages/reply`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    react: (sessionId: string, data: { chatId: string; messageId: string; emoji: string }) =>
      request<void>(`/sessions/${sessionId}/messages/react`, { method: 'POST', body: JSON.stringify(data) }),
    sendTemplate: (
      sessionId: string,
      data: { chatId: string; templateId?: string; templateName?: string; variables?: Record<string, string> },
    ) =>
      request<MessageResponse>(`/sessions/${sessionId}/messages/send-template`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    delete: (sessionId: string, data: { chatId: string; messageId: string; forEveryone?: boolean }) =>
      request<void>(`/sessions/${sessionId}/messages/delete`, { method: 'POST', body: JSON.stringify(data) }),
  };

  readonly health = {
    check: () => request<HealthStatus>('/health'),
    ready: () => request<HealthStatus>('/health/ready'),
  };

  readonly infra = {
    getStatus: () => request<InfraStatus>('/infra/status'),
    getConfig: () => request<SavedConfig>('/infra/config'),
    saveConfig: (config: SaveConfigPayload) =>
      request<{ message: string; saved: boolean; envPath: string; profiles: string[] }>('/infra/config', {
        method: 'PUT',
        body: JSON.stringify(config),
      }),
    restart: (profiles?: string[], profilesToRemove?: string[]) =>
      request<{
        message: string;
        restarting: boolean;
        profiles: string[];
        profilesToRemove: string[];
        estimatedTime: number;
      }>('/infra/restart', {
        method: 'POST',
        body: JSON.stringify({ profiles: profiles || [], profilesToRemove: profilesToRemove || [] }),
      }),
    healthCheck: () => request<{ status: string; timestamp: string }>('/infra/health'),
    // Data migration: export all Data-DB tables (call while still on the OLD database, before
    // switching), then import after the switch + restart.
    exportData: () =>
      request<{
        exportedAt: string;
        dataDbType: string;
        tables: Record<string, unknown[]>;
        counts: Record<string, number>;
      }>('/infra/export-data'),
    importData: (tables: Record<string, unknown[]>) =>
      request<{ imported: boolean; counts?: Record<string, number>; message?: string; warnings?: string[] }>(
        '/infra/import-data',
        { method: 'POST', body: JSON.stringify({ tables }) },
      ),
    getEngines: () => request<Engine[]>('/infra/engines'),
    getCurrentEngine: () => request<{ engineType: string }>('/infra/engines/current'),
  };

  readonly settings = {
    get: () => request<Settings>('/settings'),
    update: (settings: Partial<Settings>) =>
      request<Settings>('/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  };

  readonly stats = {
    getOverview: () => request<OverviewStats>('/stats/overview'),
    getMessages: (period: StatsPeriod) => request<MessageStats>(`/stats/messages?period=${period}`),
  };

  /** Admin AI configuration (auto-reply toggle, delay, provider/model/key). API key masked on read. */
  readonly aiSettings = {
    get: () => request<AiSettingsView>('/ai/settings'),
    update: (data: AiSettingsUpdate) => request<AiSettingsView>('/ai/settings', { method: 'PUT', body: JSON.stringify(data) }),
  };

  /** Real-estate "product list" CRUD (ported from the AI-automation project). */
  readonly properties = {
    list: (params?: { limit?: number; offset?: number; search?: string }) => {
      const query = new URLSearchParams();
      if (params?.limit != null) query.set('limit', String(params.limit));
      if (params?.offset != null) query.set('offset', String(params.offset));
      if (params?.search) query.set('search', params.search);
      const queryStr = query.toString();
      return request<PropertyPage>(`/properties${queryStr ? `?${queryStr}` : ''}`);
    },
    get: (id: string) => request<Property>(`/properties/${id}`),
    create: (data: PropertyPayload) => request<Property>('/properties', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<PropertyPayload>) =>
      request<Property>(`/properties/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    setStatus: (id: string, status: string) =>
      request<Property>(`/properties/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    delete: (id: string) => request<void>(`/properties/${id}`, { method: 'DELETE' }),
  };
}
