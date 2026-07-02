import { Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { API_KEY_STORAGE_KEY } from './api.service';

export interface SessionStatusEvent {
  sessionId: string;
  status: string;
  timestamp: string;
}

export interface QRCodeEvent {
  sessionId: string;
  qrCode: string;
  timestamp: string;
}

export interface SocketMessageEvent {
  sessionId: string;
  message: Record<string, unknown>;
  timestamp: string;
}

export interface MessageAckEvent {
  sessionId: string;
  id: string;
  messageId: string;
  // Neutral delivery status emitted by the backend (engine-agnostic), not a raw wwebjs ack integer.
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  ack?: number;
  timestamp?: string;
}

export interface MessageReactionEvent {
  sessionId: string;
  messageId: string;
  chatId: string;
  reaction: string;
  senderId: string;
  reactions: Record<string, string>;
  timestamp: string;
}

export interface MessageRevokedEvent {
  sessionId: string;
  id: string;
  chatId: string;
  from: string;
  to: string;
  body: string;
  type: string;
  timestamp: number;
}

export interface WebSocketEvents {
  onSessionStatus?: (event: SessionStatusEvent) => void;
  onQRCode?: (event: QRCodeEvent) => void;
  onMessage?: (event: SocketMessageEvent) => void;
  onMessageAck?: (event: MessageAckEvent) => void;
  onMessageReaction?: (event: MessageReactionEvent) => void;
  onMessageRevoked?: (event: MessageRevokedEvent) => void;
}

// Shape of the server -> client event envelope produced by the NestJS gateway.
interface ServerEventEnvelope {
  type: string;
  timestamp: string;
  payload?: {
    event: string;
    sessionId: string;
    data: Record<string, unknown>;
  };
}

/**
 * Socket.IO wrapper (port of useWebSocket). Pages register their typed handlers with
 * `register()` and get back a disposer to call on destroy; the socket itself is shared.
 */
@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket | null = null;
  private readonly handlers = new Set<WebSocketEvents>();

  private readonly _isConnected = signal(false);
  // True once Socket.IO exhausts its reconnection attempts and permanently gives up — lets the
  // UI show a "connection lost" indicator + a manual retry instead of silently going stale.
  private readonly _connectionFailed = signal(false);

  readonly isConnected = this._isConnected.asReadonly();
  readonly connectionFailed = this._connectionFailed.asReadonly();

  /** Register page callbacks and ensure the socket is up. Returns an unregister disposer. */
  register(events: WebSocketEvents): () => void {
    this.handlers.add(events);
    this.connect();
    return () => this.handlers.delete(events);
  }

  connect(): void {
    if (this.socket?.connected || this.socket?.active) return;

    const apiKey = sessionStorage.getItem(API_KEY_STORAGE_KEY);
    if (!apiKey) {
      console.warn('[WebSocket] No API key found, skipping connection');
      return;
    }

    // Use the current origin for WebSocket (goes through the same proxy as the API).
    this.socket = io(`${window.location.origin}/events`, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      // Send the key via `auth` (and a header for proxies). NOT via `query` — a key in the
      // handshake URL leaks into access logs / Referer. The gateway reads auth first.
      auth: { apiKey },
      extraHeaders: { 'X-API-Key': apiKey },
    });

    this.socket.on('connect', () => {
      this._isConnected.set(true);
      this._connectionFailed.set(false);
    });

    this.socket.on('disconnect', () => {
      this._isConnected.set(false);
    });

    this.socket.on('connect_error', error => {
      console.warn('[WebSocket] Connection error:', error.message);
    });

    // `reconnect_failed` is emitted on the Manager once all reconnectionAttempts are exhausted.
    this.socket.io.on('reconnect_failed', () => {
      console.warn('[WebSocket] Reconnection failed after max attempts');
      this._connectionFailed.set(true);
    });

    this.socket.on('message', (msg: ServerEventEnvelope) => this.dispatch(msg));
  }

  /** Manual retry after the socket permanently gave up: tear down the dead socket and reconnect. */
  reconnect(): void {
    this._connectionFailed.set(false);
    this.disconnect();
    this.connect();
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this._isConnected.set(false);
  }

  subscribe(sessionId: string, eventsList: string[]): void {
    if (this.socket?.connected) {
      this.socket.emit('message', { type: 'subscribe', sessionId, events: eventsList });
    }
  }

  unsubscribe(sessionId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('message', { type: 'unsubscribe', sessionId });
    }
  }

  // Fan the single envelope out to every registered page's typed callbacks.
  private dispatch(msg: ServerEventEnvelope): void {
    if (!msg || msg.type !== 'event' || !msg.payload) return;

    const { event, sessionId, data } = msg.payload;

    for (const events of this.handlers) {
      switch (event) {
        case 'session.status':
          events.onSessionStatus?.({ sessionId, status: String(data['status']), timestamp: msg.timestamp });
          break;
        case 'session.qr':
          events.onQRCode?.({ sessionId, qrCode: String(data['qrCode']), timestamp: msg.timestamp });
          break;
        case 'message.received':
        case 'message.sent':
          events.onMessage?.({ sessionId, message: data, timestamp: msg.timestamp });
          break;
        case 'message.ack':
          events.onMessageAck?.({
            sessionId,
            id: String(data['id']),
            messageId: String(data['messageId']),
            status: data['status'] as MessageAckEvent['status'],
            ack: typeof data['ack'] === 'number' ? data['ack'] : undefined,
            timestamp: msg.timestamp,
          });
          break;
        case 'message.reaction':
          events.onMessageReaction?.({
            sessionId,
            messageId: String(data['messageId']),
            chatId: String(data['chatId']),
            reaction: String(data['reaction']),
            senderId: String(data['senderId']),
            reactions: (data['reactions'] as Record<string, string>) || {},
            timestamp: msg.timestamp,
          });
          break;
        case 'message.revoked':
          events.onMessageRevoked?.({
            sessionId,
            id: String(data['id']),
            chatId: String(data['chatId']),
            from: String(data['from']),
            to: String(data['to']),
            body: String(data['body'] ?? ''),
            type: String(data['type']),
            timestamp: Number(data['timestamp']),
          });
          break;
        default:
          break;
      }
    }
  }
}
