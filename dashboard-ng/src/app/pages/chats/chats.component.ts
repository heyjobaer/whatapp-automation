import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideAngularModule } from 'lucide-angular';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LangService } from '../../core/lang.service';
import { SocketService } from '../../core/socket.service';
import { ToastService } from '../../core/toast.service';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { MessageBodyComponent } from './message-body.component';
import { MediaLightboxComponent, type LightboxItem } from './media-lightbox.component';
import {
  mergeChatMessages,
  mapEngineHistoryMessage,
  mergeOrAppend,
  mergeDeliveryStatus,
  updateMessageById,
  type ChatMessageView,
} from '../../shared/utils/chatMessages';
import { decideScroll, type ScrollDirection } from '../../shared/utils/scrollDecision';
import { asMessageType, type Chat, type MessageType, type Session } from '../../core/api.types';

type MessageMedia = { mimetype: string; filename?: string; data?: string; omitted?: boolean; sizeBytes?: number };

interface IncomingWsMessage {
  id: string;
  chatId: string;
  from: string;
  to: string;
  body: string;
  type: string;
  timestamp: number;
  fromMe?: boolean;
  media?: MessageMedia;
  quotedMessage?: { id: string; body: string };
  // The backend emits `call` as a top-level field on the live `message.received` event (it's only
  // folded into `metadata` on the persisted/history path), so declare it here to carry it through.
  call?: { video: boolean; missed: boolean };
  metadata?: ChatMessageView['metadata'];
}

// Map an attachment MIME type to the neutral MessageType for the optimistic outgoing bubble, so the
// placeholder matches what the backend will persist (e.g. a PDF is `document`, not `application`).
const messageTypeFromMime = (mimetype: string): MessageType => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  return 'document';
};

const getMediaSrc = (media?: MessageMedia): string => {
  if (!media || !media.data) return '';
  if (media.data.startsWith('data:') || media.data.startsWith('http://') || media.data.startsWith('https://')) {
    return media.data;
  }
  return `data:${media.mimetype};base64,${media.data}`;
};

const POPULAR_EMOJIS = ['😀', '😂', '👍', '❤️', '🔥', '👏', '🙏', '🎉', '💡', '🤔', '😅', '😍', '😊', '😭', '😎', '😜', '🚀', '✨'];
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

@Component({
  selector: 'app-chats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, LucideAngularModule, PageHeaderComponent, MessageBodyComponent, MediaLightboxComponent],
  templateUrl: './chats.component.html',
  styleUrl: './chats.component.css',
})
export class ChatsComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly titleService = inject(Title);
  private readonly toast = inject(ToastService);
  readonly socket = inject(SocketService);
  readonly auth = inject(AuthService);
  readonly lang = inject(LangService);

  readonly popularEmojis = POPULAR_EMOJIS;
  readonly quickReactions = QUICK_REACTIONS;
  readonly getMediaSrc = getMediaSrc;

  // Sessions & chats
  readonly sessions = signal<Session[]>([]);
  readonly loadingSessions = signal(true);
  readonly selectedSessionId = signal('');
  readonly chats = signal<Chat[]>([]);
  readonly loadingChats = signal(false);
  searchQuery = '';
  readonly searchTick = signal(0);

  // Active chat + per-chat message cache (replaces the React Query cache; component-lifetime,
  // cleared on session switch). Map is keyed by chatId; the signal ticks on every write.
  readonly activeChat = signal<Chat | null>(null);
  private readonly messageCache = new Map<string, ChatMessageView[]>();
  private readonly cacheTick = signal(0);
  readonly loadingMessages = signal(false);
  readonly messagesError = signal(false);

  messageInput = '';
  readonly inputTick = signal(0);
  readonly sending = signal(false);
  readonly showEmojiPicker = signal(false);
  readonly replyingTo = signal<ChatMessageView | null>(null);
  readonly lightboxIndex = signal<number | null>(null);

  readonly attachment = signal<{ file: File; base64: string; mimetype: string; filename: string } | null>(null);
  readonly previewUrl = signal<string | null>(null);

  private readonly fileInputRef = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private readonly messagesContainerRef = viewChild<ElementRef<HTMLDivElement>>('messagesContainer');

  // Per-chat scroll memory (port of useChatScrollPosition).
  private readonly scrollMap = new Map<string, number>();
  private prevChatId: string | null = null;

  private unregisterSocket: (() => void) | null = null;

  readonly messages = computed<ChatMessageView[]>(() => {
    this.cacheTick();
    const chat = this.activeChat();
    return chat ? (this.messageCache.get(chat.id) ?? []) : [];
  });

  readonly filteredChats = computed(() => {
    this.searchTick();
    const q = this.searchQuery.toLowerCase();
    return this.chats().filter(c => c.name?.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
  });

  // Image media items for the lightbox, in render order.
  readonly imageMedia = computed<LightboxItem[]>(() =>
    this.messages()
      .filter(m => m.type === 'image' && Boolean(getMediaSrc(m.metadata?.media)))
      .map(m => ({
        id: m.id,
        url: getMediaSrc(m.metadata?.media),
        alt: m.body || m.metadata?.media?.filename || '',
        timestamp: this.formatChatTime(m.timestamp || Math.floor(new Date(m.createdAt).getTime() / 1000)),
      })),
  );

  constructor() {
    // Subscribe to realtime rooms whenever session or connection changes.
    effect(() => {
      const sessionId = this.selectedSessionId();
      if (sessionId && this.socket.isConnected()) {
        this.socket.subscribe(sessionId, [
          'message.received',
          'message.sent',
          'message.ack',
          'message.reaction',
          'message.revoked',
        ]);
      }
    });

    // Session switch: reload chats, clear active chat/attachment/cache.
    effect(() => {
      const sessionId = this.selectedSessionId();
      if (!sessionId) return;
      void this.loadChats(sessionId);
      this.activeChat.set(null);
      this.removeAttachment();
      this.messageCache.clear();
      this.cacheTick.update(v => v + 1);
    });
  }

  ngOnInit(): void {
    this.titleService.setTitle(`${this.lang.t('nav.chats')} · OpenWA`);
    this.unregisterSocket = this.socket.register({
      onMessage: event => this.handleIncomingMessage(event.sessionId, event.message as unknown as IncomingWsMessage),
      onMessageAck: event => this.handleIncomingAck(event.sessionId, event.messageId, event.status),
      onMessageReaction: event => this.handleIncomingReaction(event.sessionId, event.messageId, event.reactions),
      onMessageRevoked: event => this.handleIncomingRevoked(event.sessionId, event.id, event.type),
    });

    this.api.sessions
      .list()
      .then(list => {
        const ready = list.filter(s => s.status === 'ready');
        this.sessions.set(ready);
        if (ready.length > 0) this.selectedSessionId.set(ready[0].id);
      })
      .catch(err => this.toast.error(this.lang.t('chats.errors.loadSessions'), err instanceof Error ? err.message : undefined))
      .finally(() => this.loadingSessions.set(false));
  }

  ngOnDestroy(): void {
    this.unregisterSocket?.();
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
  }

  // ── Chats list ──

  private async loadChats(sessionId: string): Promise<void> {
    try {
      this.loadingChats.set(true);
      const data = await this.api.sessions.getChats(sessionId);
      this.chats.set([...data].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
    } catch (err) {
      this.toast.error(this.lang.t('chats.errors.loadChats'), err instanceof Error ? err.message : undefined);
      this.chats.set([]);
    } finally {
      this.loadingChats.set(false);
    }
  }

  selectChat(chat: Chat): void {
    // Save the leaving chat's scroll position (only when its content was rendered).
    const el = this.messagesContainerRef()?.nativeElement;
    if (el && this.prevChatId && this.prevChatId !== chat.id && this.messages().length > 0) {
      this.scrollMap.set(this.prevChatId, el.scrollTop);
    }
    this.prevChatId = chat.id;

    this.activeChat.set(chat);
    this.markChatRead(chat.id);
    this.chats.update(prev => prev.map(c => (c.id === chat.id ? { ...c, unreadCount: 0 } : c)));

    if (!this.messageCache.has(chat.id)) {
      void this.loadMessages(chat.id);
    } else {
      this.restoreScroll(chat.id);
    }
  }

  closeChat(): void {
    const el = this.messagesContainerRef()?.nativeElement;
    if (el && this.prevChatId) this.scrollMap.set(this.prevChatId, el.scrollTop);
    this.prevChatId = null;
    this.activeChat.set(null);
  }

  private async loadMessages(chatId: string): Promise<void> {
    const sessionId = this.selectedSessionId();
    this.loadingMessages.set(true);
    this.messagesError.set(false);
    try {
      // Engine history is fetched WITHOUT media to keep the cache small; recent media still renders
      // from the DB copy (which wins in mergeChatMessages).
      const [dbRes, historyRes] = await Promise.allSettled([
        this.api.sessions.getChatMessages(sessionId, chatId, 100),
        this.api.sessions.getChatHistory(sessionId, chatId, 100, false),
      ]);
      if (dbRes.status === 'rejected' && historyRes.status === 'rejected') throw dbRes.reason;
      const dbMessages = dbRes.status === 'fulfilled' ? dbRes.value.messages : [];
      const history = historyRes.status === 'fulfilled' ? historyRes.value.map(mapEngineHistoryMessage) : [];
      this.messageCache.set(chatId, mergeChatMessages(dbMessages, history));
      this.cacheTick.update(v => v + 1);
      this.restoreScroll(chatId);
    } catch {
      this.messagesError.set(true);
    } finally {
      this.loadingMessages.set(false);
    }
  }

  private restoreScroll(chatId: string): void {
    // Wait a frame so the message list is in the DOM before setting scrollTop.
    requestAnimationFrame(() => {
      const el = this.messagesContainerRef()?.nativeElement;
      if (!el) return;
      const saved = this.scrollMap.get(chatId);
      el.scrollTop = saved !== undefined ? saved : el.scrollHeight;
    });
  }

  private onMessageAppended(direction: ScrollDirection): void {
    const el = this.messagesContainerRef()?.nativeElement;
    if (!el) return;
    const action = decideScroll(direction, {
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    });
    if (action === 'preserve') return;
    requestAnimationFrame(() => {
      const cur = this.messagesContainerRef()?.nativeElement;
      if (cur) cur.scrollTop = cur.scrollHeight;
    });
  }

  private markChatRead(chatId: string): void {
    void this.api.sessions.markChatRead(this.selectedSessionId(), chatId).catch(err => {
      this.toast.warning(this.lang.t('chats.errors.markRead'), err instanceof Error ? err.message : undefined);
    });
  }

  // ── Cache mutators (port of useChatMessagesActions) ──

  private appendToCache(chatId: string, msg: ChatMessageView): void {
    // Only append to a slice that already exists (a chat that has been opened) — a phantom slice
    // for a never-opened chat would mask the full-history fetch when it is opened.
    const existing = this.messageCache.get(chatId);
    if (existing === undefined) return;
    this.messageCache.set(chatId, mergeOrAppend(existing, msg));
    this.cacheTick.update(v => v + 1);
  }

  private updateInCache(chatId: string, id: string, patch: Partial<ChatMessageView>): void {
    const existing = this.messageCache.get(chatId) ?? [];
    this.messageCache.set(chatId, updateMessageById(existing, id, patch));
    this.cacheTick.update(v => v + 1);
  }

  // ── Realtime handlers ──

  private handleIncomingMessage(sessionId: string, newMsg: IncomingWsMessage): void {
    if (sessionId !== this.selectedSessionId()) return;

    const mappedMessage: ChatMessageView = {
      id: newMsg.id,
      waMessageId: newMsg.id,
      chatId: newMsg.chatId,
      from: newMsg.from,
      to: newMsg.to,
      body: newMsg.body,
      type: asMessageType(newMsg.type),
      direction: newMsg.fromMe ? 'outgoing' : 'incoming',
      status: 'sent',
      timestamp: newMsg.timestamp,
      createdAt: new Date(newMsg.timestamp * 1000).toISOString(),
      metadata: newMsg.metadata || {
        media: newMsg.media,
        quotedMessage: newMsg.quotedMessage,
        call: newMsg.call,
      },
    };

    this.appendToCache(newMsg.chatId, mappedMessage);

    const activeChat = this.activeChat();
    if (activeChat && newMsg.chatId === activeChat.id) {
      this.markChatRead(activeChat.id);
      if (!newMsg.fromMe) this.onMessageAppended('incoming');
    }

    // Update sidebar chat list.
    const prevChats = this.chats();
    const chatIndex = prevChats.findIndex(c => c.id === newMsg.chatId);
    if (chatIndex === -1) {
      void this.loadChats(sessionId);
      return;
    }
    const updatedChats = [...prevChats];
    const targetChat = { ...updatedChats[chatIndex] };
    // A location message's body is the (multi-KB) base64 map thumbnail; show a label instead.
    targetChat.lastMessage = newMsg.type === 'location' ? `📍 ${this.lang.t('chats.media.location')}` : newMsg.body;
    targetChat.timestamp = newMsg.timestamp;
    if (!newMsg.fromMe && (!activeChat || activeChat.id !== targetChat.id)) {
      targetChat.unreadCount = (targetChat.unreadCount || 0) + 1;
    }
    updatedChats.splice(chatIndex, 1);
    updatedChats.unshift(targetChat);
    this.chats.set(updatedChats);
  }

  private handleIncomingAck(sessionId: string, messageId: string, status: ChatMessageView['status']): void {
    if (sessionId !== this.selectedSessionId()) return;
    // Acks can arrive for any cached chat under this session — apply the forward-only merge.
    for (const [chatId, list] of this.messageCache) {
      const idx = list.findIndex(m => m.id === messageId || m.waMessageId === messageId);
      if (idx === -1) continue;
      const target = list[idx];
      const nextStatus = mergeDeliveryStatus(target.status, status) ?? target.status;
      const next = list.slice();
      next[idx] = { ...target, status: nextStatus };
      this.messageCache.set(chatId, next);
    }
    this.cacheTick.update(v => v + 1);
  }

  private handleIncomingReaction(sessionId: string, messageId: string, reactions: Record<string, string>): void {
    if (sessionId !== this.selectedSessionId()) return;
    // Deep-merge metadata.reactions so existing media / quotedMessage survive.
    for (const [chatId, list] of this.messageCache) {
      const idx = list.findIndex(m => m.id === messageId || m.waMessageId === messageId);
      if (idx === -1) continue;
      const target = list[idx];
      const next = list.slice();
      next[idx] = { ...target, metadata: { ...(target.metadata || {}), reactions } };
      this.messageCache.set(chatId, next);
    }
    this.cacheTick.update(v => v + 1);
  }

  private handleIncomingRevoked(sessionId: string, id: string, type: string): void {
    if (sessionId !== this.selectedSessionId()) return;
    for (const [chatId, list] of this.messageCache) {
      const idx = list.findIndex(m => m.id === id || m.waMessageId === id);
      if (idx === -1) continue;
      const target = list[idx];
      const next = list.slice();
      next[idx] = { ...target, body: '', type: asMessageType(type) };
      this.messageCache.set(chatId, next);
    }
    this.cacheTick.update(v => v + 1);
  }

  // ── Reactions / delete ──

  async reactToMessage(msg: ChatMessageView, emoji: string): Promise<void> {
    const sessionId = this.selectedSessionId();
    const activeChat = this.activeChat();
    if (!sessionId || !activeChat) return;

    const msgId = msg.waMessageId || msg.id;
    const currentReactions = msg.metadata?.reactions || {};
    const sessionPhone = this.sessions().find(s => s.id === sessionId)?.phone || 'me';

    let alreadyReacted = false;
    for (const [sender, emo] of Object.entries(currentReactions)) {
      if ((sender === 'me' || sender.includes(sessionPhone)) && emo === emoji) {
        alreadyReacted = true;
        break;
      }
    }
    const emojiToSend = alreadyReacted ? '' : emoji;

    try {
      await this.api.messages.react(sessionId, { chatId: activeChat.id, messageId: msgId, emoji: emojiToSend });

      const list = this.messageCache.get(activeChat.id) ?? [];
      this.messageCache.set(
        activeChat.id,
        list.map(m => {
          if (m.id === msg.id || m.waMessageId === msg.id) {
            const metadata = m.metadata || {};
            const reactions = { ...(metadata.reactions || {}) };
            if (emojiToSend === '') delete reactions['me'];
            else reactions['me'] = emojiToSend;
            return { ...m, metadata: { ...metadata, reactions } };
          }
          return m;
        }),
      );
      this.cacheTick.update(v => v + 1);
    } catch (err) {
      this.toast.error(this.lang.t('chats.errors.react'), err instanceof Error ? err.message : undefined);
    }
  }

  async deleteMessage(msg: ChatMessageView): Promise<void> {
    const sessionId = this.selectedSessionId();
    const activeChat = this.activeChat();
    if (!sessionId || !activeChat) return;
    if (!window.confirm(this.lang.t('chats.deleteConfirm'))) return;

    try {
      await this.api.messages.delete(sessionId, {
        chatId: activeChat.id,
        messageId: msg.waMessageId || msg.id,
        forEveryone: true,
      });
      this.updateInCache(activeChat.id, msg.id, { body: '', type: 'revoked' });
    } catch (err) {
      this.toast.error(this.lang.t('chats.errors.delete'), err instanceof Error ? err.message : undefined);
    }
  }

  // ── Attachments / emoji ──

  triggerFileSelect(): void {
    this.fileInputRef()?.nativeElement.click();
  }

  onFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const oldUrl = this.previewUrl();
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    this.previewUrl.set(file.type.startsWith('image/') ? URL.createObjectURL(file) : null);

    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target?.result as string;
      const base64Data = dataUrl.split(',')[1];
      this.attachment.set({ file, base64: base64Data, mimetype: file.type, filename: file.name });
    };
    reader.readAsDataURL(file);
  }

  removeAttachment(): void {
    this.attachment.set(null);
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
    this.previewUrl.set(null);
    const input = this.fileInputRef()?.nativeElement;
    if (input) input.value = '';
  }

  addEmoji(emoji: string): void {
    this.messageInput += emoji;
    this.inputTick.update(v => v + 1);
    this.showEmojiPicker.set(false);
  }

  // ── Send ──

  sendDisabled(): boolean {
    this.inputTick();
    return !this.auth.canWrite() || (!this.messageInput.trim() && !this.attachment()) || this.sending();
  }

  async handleSend(event?: Event): Promise<void> {
    event?.preventDefault();
    const sessionId = this.selectedSessionId();
    const activeChat = this.activeChat();
    if (!sessionId || !activeChat || this.sending()) return;

    const textToSend = this.messageInput.trim();
    const attachment = this.attachment();
    if (!textToSend && !attachment) return;

    this.messageInput = '';
    this.inputTick.update(v => v + 1);
    this.sending.set(true);

    const tempId = `temp_${Date.now()}`;
    const replyingTo = this.replyingTo();
    const tempMessage: ChatMessageView = {
      id: tempId,
      chatId: activeChat.id,
      from: 'me',
      to: activeChat.id,
      body: attachment
        ? attachment.mimetype.startsWith('image/') ||
          attachment.mimetype.startsWith('video/') ||
          attachment.mimetype.startsWith('audio/')
          ? textToSend
          : attachment.filename
        : textToSend,
      type: attachment ? messageTypeFromMime(attachment.mimetype) : 'text',
      direction: 'outgoing',
      status: 'pending',
      createdAt: new Date().toISOString(),
      metadata: attachment
        ? { media: { mimetype: attachment.mimetype, filename: attachment.filename, data: attachment.base64 } }
        : replyingTo
          ? {
              quotedMessage: {
                id: replyingTo.waMessageId || replyingTo.id,
                body: replyingTo.type !== 'text' ? `[${replyingTo.type}]` : replyingTo.body,
              },
            }
          : undefined,
    };

    this.appendToCache(activeChat.id, tempMessage);
    this.onMessageAppended('outgoing');

    this.removeAttachment();
    this.replyingTo.set(null);

    try {
      let result;
      if (attachment) {
        let mediaType: 'image' | 'video' | 'audio' | 'document' = 'document';
        const mime = attachment.mimetype;
        if (mime.startsWith('image/')) mediaType = 'image';
        else if (mime.startsWith('video/')) mediaType = 'video';
        else if (mime.startsWith('audio/')) mediaType = 'audio';

        result = await this.api.messages.sendMedia(sessionId, activeChat.id, mediaType, {
          base64: attachment.base64,
          mimetype: attachment.mimetype,
          filename: attachment.filename,
          caption: mediaType !== 'audio' ? textToSend : undefined,
        });
      } else if (replyingTo) {
        result = await this.api.messages.reply(sessionId, {
          chatId: activeChat.id,
          quotedMessageId: replyingTo.waMessageId || replyingTo.id,
          text: textToSend,
        });
      } else {
        result = await this.api.messages.sendText(sessionId, activeChat.id, textToSend);
      }

      // Race guard: the realtime `message.sent` echo can arrive before this response and already
      // append the message by its real WA id. If so, drop the placeholder instead of renaming it —
      // otherwise both the echo and the renamed temp render as duplicate bubbles.
      const list = this.messageCache.get(activeChat.id) ?? [];
      const echoAlreadyAdded = list.some(m => m.id === result.messageId || m.waMessageId === result.messageId);
      this.messageCache.set(
        activeChat.id,
        echoAlreadyAdded
          ? list.filter(m => m.id !== tempId)
          : list.map(m =>
              m.id === tempId ? { ...m, id: result.messageId, waMessageId: result.messageId, status: 'sent' as const } : m,
            ),
      );
      this.cacheTick.update(v => v + 1);

      // Update sidebar chat list (move active chat to the top with the new snippet).
      const prevChats = this.chats();
      const chatIndex = prevChats.findIndex(c => c.id === activeChat.id);
      if (chatIndex !== -1) {
        const updatedChats = [...prevChats];
        const target = { ...updatedChats[chatIndex] };
        target.lastMessage = attachment ? `[${attachment.mimetype.split('/')[0]}]` : textToSend;
        target.timestamp = Math.floor(Date.now() / 1000);
        updatedChats.splice(chatIndex, 1);
        updatedChats.unshift(target);
        this.chats.set(updatedChats);
      }
    } catch (err) {
      this.toast.error(this.lang.t('chats.errors.send'), err instanceof Error ? err.message : undefined);
      this.updateInCache(activeChat.id, tempId, { status: 'failed' });
    } finally {
      this.sending.set(false);
    }
  }

  // ── Formatting / template helpers ──

  formatTime(msg: ChatMessageView): string {
    const timestamp = msg.timestamp || Math.floor(new Date(msg.createdAt).getTime() / 1000);
    if (!timestamp) return '';
    return new Date(timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  formatChatTime(timestamp?: number): string {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return this.lang.t('chats.yesterday');
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  chatDisplayName(chat: Chat): string {
    return chat.name || chat.id.split('@')[0];
  }

  locationThumb(msg: ChatMessageView): string {
    // WhatsApp location messages carry a base64 JPEG map-preview thumbnail in `body`.
    return msg.body && msg.body.length > 100 ? `data:image/jpeg;base64,${msg.body}` : '';
  }

  callLabel(msg: ChatMessageView): string {
    const call = msg.metadata?.call;
    const callKey = call?.video ? (call.missed ? 'callVideoMissed' : 'callVideo') : call?.missed ? 'callMissed' : 'call';
    return `${call?.video ? '📹' : '📞'} ${this.lang.t(`chats.media.${callKey}`)}`;
  }

  showBody(msg: ChatMessageView): boolean {
    const mediaInfo = msg.metadata?.media;
    return Boolean(
      msg.body && (!mediaInfo || msg.body !== mediaInfo.filename) && msg.type !== 'location' && msg.type !== 'call',
    );
  }

  reactionValues(msg: ChatMessageView): string[] {
    return Object.values(msg.metadata?.reactions || {}).slice(0, 3);
  }

  reactionCount(msg: ChatMessageView): number {
    return Object.keys(msg.metadata?.reactions || {}).length;
  }

  openLightbox(msg: ChatMessageView): void {
    const idx = this.imageMedia().findIndex(x => x.id === msg.id);
    if (idx >= 0) this.lightboxIndex.set(idx);
  }

  replyingToName(): string {
    const replying = this.replyingTo();
    const chat = this.activeChat();
    if (!replying || !chat) return '';
    return replying.direction === 'outgoing' ? this.lang.t('chats.you') : this.chatDisplayName(chat);
  }

  replyingToBody(): string {
    const replying = this.replyingTo();
    if (!replying) return '';
    return replying.type !== 'text' ? `[${replying.type}]` : replying.body;
  }

  attachmentSizeKb(): string {
    const att = this.attachment();
    return att ? (att.file.size / 1024).toFixed(1) : '0';
  }

  statusTick(status: ChatMessageView['status']): string {
    switch (status) {
      case 'pending':
        return '🕒';
      case 'sent':
        return '✓';
      case 'delivered':
      case 'read':
        return '✓✓';
      case 'failed':
        return '⚠️';
      default:
        return '';
    }
  }
}
