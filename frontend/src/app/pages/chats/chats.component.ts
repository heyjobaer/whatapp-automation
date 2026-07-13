import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { BehaviorSubject, Subject, combineLatest, defer } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LangService } from '../../core/lang.service';
import { SocketService } from '../../core/socket.service';
import { ToastService } from '../../core/toast.service';
import { type LightboxItem } from './media-lightbox.component';
import {
  mergeChatMessages,
  mapEngineHistoryMessage,
  mergeOrAppend,
  mergeDeliveryStatus,
  updateMessageById,
  type ChatMessageView,
} from '../../shared/utils/chatMessages';
import { decideScroll, type ScrollDirection } from '../../shared/utils/scrollDecision';
import { asMessageType, type Chat, type ChatLead, type MessageType, type Session } from '../../core/api.types';

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
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chats.component.html',
  styleUrl: './chats.component.css',
})
export class ChatsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  readonly popularEmojis = POPULAR_EMOJIS;
  readonly quickReactions = QUICK_REACTIONS;
  readonly getMediaSrc = getMediaSrc;

  // Sessions & chats
  readonly sessions$ = new BehaviorSubject<Session[]>([]);
  readonly loadingSessions$ = new BehaviorSubject(true);
  readonly selectedSessionId$ = new BehaviorSubject('');
  readonly chats$ = new BehaviorSubject<Chat[]>([]);
  readonly loadingChats$ = new BehaviorSubject(false);
  readonly searchQuery$ = new BehaviorSubject('');

  // Active chat + the thread that drives the view. There is NO frontend message cache: the thread
  // is (re)loaded from the API each time a chat is opened and mutated in place by realtime events
  // for the active chat only. (Caching is planned on the backend.)
  readonly activeChat$ = new BehaviorSubject<Chat | null>(null);
  readonly messages$ = new BehaviorSubject<ChatMessageView[]>([]);
  readonly loadingMessages$ = new BehaviorSubject(false);
  readonly messagesError$ = new BehaviorSubject(false);

  messageInput = '';
  readonly sending$ = new BehaviorSubject(false);
  readonly showEmojiPicker$ = new BehaviorSubject(false);
  readonly replyingTo$ = new BehaviorSubject<ChatMessageView | null>(null);
  readonly lightboxIndex$ = new BehaviorSubject<number | null>(null);

  readonly attachment$ = new BehaviorSubject<{ file: File; base64: string; mimetype: string; filename: string } | null>(
    null,
  );
  readonly previewUrl$ = new BehaviorSubject<string | null>(null);

  // AI lead qualification per chat, keyed by chatId (drives the Hot/Warm badges).
  readonly leads$ = new BehaviorSubject<Record<string, ChatLead>>({});

  // Chats with an in-flight "Disable AI reply" toggle request, so a double-click can't double-fire.
  private readonly aiToggleBusy = new Set<string>();

  @ViewChild('fileInput') private fileInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('messagesContainer') private messagesContainerRef?: ElementRef<HTMLDivElement>;

  // Per-chat scroll memory (port of useChatScrollPosition).
  private readonly scrollMap = new Map<string, number>();
  private prevChatId: string | null = null;

  private unregisterSocket: (() => void) | null = null;

  private readonly filteredChats$ = combineLatest([this.chats$, this.searchQuery$]).pipe(
    map(([chats, search]) => {
      const q = search.toLowerCase();
      return chats.filter(c => c.name?.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
    }),
  );

  // Image media items for the lightbox, in render order.
  private readonly imageMedia$ = this.messages$.pipe(map(messages => this.buildImageMedia(messages)));

  readonly vm$ = defer(() =>
    combineLatest({
      connectionFailed: this.socket.connectionFailed$,
      loadingSessions: this.loadingSessions$,
      sessions: this.sessions$,
      selectedSessionId: this.selectedSessionId$,
      loadingChats: this.loadingChats$,
      filteredChats: this.filteredChats$,
      activeChat: this.activeChat$,
      messages: this.messages$,
      loadingMessages: this.loadingMessages$,
      messagesError: this.messagesError$,
      sending: this.sending$,
      showEmojiPicker: this.showEmojiPicker$,
      replyingTo: this.replyingTo$,
      lightboxIndex: this.lightboxIndex$,
      attachment: this.attachment$,
      previewUrl: this.previewUrl$,
      imageMedia: this.imageMedia$,
      searchQuery: this.searchQuery$,
      canWrite: this.auth.canWrite$,
      leads: this.leads$,
    }),
  );

  constructor(
    private readonly api: ApiService,
    private readonly titleService: Title,
    private readonly toast: ToastService,
    readonly socket: SocketService,
    readonly auth: AuthService,
    readonly lang: LangService,
  ) {
    // Subscribe to realtime rooms whenever session or connection changes.
    combineLatest([this.selectedSessionId$, this.socket.isConnected$])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([sessionId, connected]) => {
        if (sessionId && connected) {
          this.socket.subscribe(sessionId, [
            'message.received',
            'message.sent',
            'message.ack',
            'message.reaction',
            'message.revoked',
          ]);
        }
      });

    // Session switch: reload chats, clear active chat/attachment/thread.
    this.selectedSessionId$.pipe(takeUntil(this.destroy$)).subscribe(sessionId => {
      if (!sessionId) return;
      void this.loadChats(sessionId);
      void this.loadLeads(sessionId);
      this.activeChat$.next(null);
      this.removeAttachment();
      this.messages$.next([]);
    });
  }

  ngOnInit(): void {
    this.titleService.setTitle(`${this.lang.t('nav.chats')}`);
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
        this.sessions$.next(ready);
        if (ready.length > 0) this.selectedSessionId$.next(ready[0].id);
      })
      .catch(err => this.toast.error(this.lang.t('chats.errors.loadSessions'), err instanceof Error ? err.message : undefined))
      .finally(() => this.loadingSessions$.next(false));
  }

  ngOnDestroy(): void {
    this.unregisterSocket?.();
    const url = this.previewUrl$.value;
    if (url) URL.revokeObjectURL(url);
    this.destroy$.next();
    this.destroy$.complete();
  }

  private buildImageMedia(messages: ChatMessageView[]): LightboxItem[] {
    return messages
      .filter(m => m.type === 'image' && Boolean(getMediaSrc(m.metadata?.media)))
      .map(m => ({
        id: m.id,
        url: getMediaSrc(m.metadata?.media),
        alt: m.body || m.metadata?.media?.filename || '',
        timestamp: this.formatChatTime(m.timestamp || Math.floor(new Date(m.createdAt).getTime() / 1000)),
      }));
  }

  private async loadLeads(sessionId: string): Promise<void> {
    try {
      const list = await this.api.sessions.getLeads(sessionId);
      this.leads$.next(Object.fromEntries(list.map(l => [l.chatId, l])));
    } catch {
      // Leads are non-critical (e.g. AI not enabled) — leave the map empty on failure.
    }
  }

  /** Hot ≥ 70, Warm ≥ 40, otherwise Cold. Used for the lead badge in the list + room header. */
  leadStatus(score: number): 'hot' | 'warm' | 'cold' {
    return score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold';
  }

  /** Current "Disable AI reply" state for a chat (defaults to false when no lead row exists yet). */
  isAiDisabled(chatId: string): boolean {
    return this.leads$.value[chatId]?.disableAiReply ?? false;
  }

  /**
   * Admin toggle: flip the "Disable AI reply" flag for one chat. Updates the local leads map from the
   * server's returned row so the switch reflects the persisted state. Guarded so a double-click can't
   * fire two in-flight requests for the same chat.
   */
  async toggleDisableAiReply(chatId: string): Promise<void> {
    const sessionId = this.selectedSessionId$.value;
    if (!sessionId || this.aiToggleBusy.has(chatId)) return;
    const next = !this.isAiDisabled(chatId);
    this.aiToggleBusy.add(chatId);
    try {
      const lead = await this.api.sessions.setDisableAiReply(sessionId, chatId, next);
      this.leads$.next({ ...this.leads$.value, [chatId]: lead });
    } catch (err) {
      this.toast.error(this.lang.t('chats.aiReply.toggleError'), err instanceof Error ? err.message : undefined);
    } finally {
      this.aiToggleBusy.delete(chatId);
    }
  }

  // ── Template setters ──

  setSelectedSessionId(id: string): void {
    this.selectedSessionId$.next(id);
  }

  setSearchQuery(value: string): void {
    this.searchQuery$.next(value);
  }

  setReplyingTo(msg: ChatMessageView | null): void {
    this.replyingTo$.next(msg);
  }

  setLightboxIndex(index: number | null): void {
    this.lightboxIndex$.next(index);
  }

  toggleEmojiPicker(): void {
    this.showEmojiPicker$.next(!this.showEmojiPicker$.value);
  }

  // ── Chats list ──

  private async loadChats(sessionId: string): Promise<void> {
    try {
      this.loadingChats$.next(true);
      const data = await this.api.sessions.getChats(sessionId);
      this.chats$.next([...data].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
    } catch (err) {
      this.toast.error(this.lang.t('chats.errors.loadChats'), err instanceof Error ? err.message : undefined);
      this.chats$.next([]);
    } finally {
      this.loadingChats$.next(false);
    }
  }

  selectChat(chat: Chat): void {
    // Save the leaving chat's scroll position (only when its content was rendered).
    const el = this.messagesContainerRef?.nativeElement;
    if (el && this.prevChatId && this.prevChatId !== chat.id && this.messages$.value.length > 0) {
      this.scrollMap.set(this.prevChatId, el.scrollTop);
    }
    this.prevChatId = chat.id;

    this.activeChat$.next(chat);
    // No cache: clear the thread and always (re)load from the API.
    this.messages$.next([]);
    this.markChatRead(chat.id);
    this.chats$.next(this.chats$.value.map(c => (c.id === chat.id ? { ...c, unreadCount: 0 } : c)));

    void this.loadMessages(chat.id);
  }

  closeChat(): void {
    const el = this.messagesContainerRef?.nativeElement;
    if (el && this.prevChatId) this.scrollMap.set(this.prevChatId, el.scrollTop);
    this.prevChatId = null;
    this.activeChat$.next(null);
    this.messages$.next([]);
  }

  private async loadMessages(chatId: string): Promise<void> {
    const sessionId = this.selectedSessionId$.value;
    this.loadingMessages$.next(true);
    this.messagesError$.next(false);
    try {
      // Engine history is fetched WITHOUT media to keep the cache small; recent media still renders
      // from the DB copy (which wins in mergeChatMessages).
      const [dbRes, historyRes] = await Promise.allSettled([
        this.api.sessions.getChatMessages(sessionId, chatId, 100),
        this.api.sessions.getChatHistory(sessionId, chatId, 100, true),
      ]);
      if (dbRes.status === 'rejected' && historyRes.status === 'rejected') throw dbRes.reason;
      const dbMessages = dbRes.status === 'fulfilled' ? dbRes.value.messages : [];
      const history = historyRes.status === 'fulfilled' ? historyRes.value.map(mapEngineHistoryMessage) : [];

      // A slow load must not clobber the thread if the user switched chats meanwhile.
      if (this.activeChat$.value?.id !== chatId) return;
      const merged = mergeChatMessages(dbMessages, history);
      this.messages$.next(merged);
      this.restoreScroll(chatId);
    } catch (err) {
      console.error('[loadMessages] failed', err);
      if (this.activeChat$.value?.id === chatId) this.messagesError$.next(true);
    } finally {
      this.loadingMessages$.next(false);
    }
  }

  private restoreScroll(chatId: string): void {
    // Wait a frame so the message list is in the DOM before setting scrollTop.
    requestAnimationFrame(() => {
      const el = this.messagesContainerRef?.nativeElement;
      if (!el) return;
      const saved = this.scrollMap.get(chatId);
      el.scrollTop = saved !== undefined ? saved : el.scrollHeight;
    });
  }

  private onMessageAppended(direction: ScrollDirection): void {
    const el = this.messagesContainerRef?.nativeElement;
    if (!el) return;
    const action = decideScroll(direction, {
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    });
    if (action === 'preserve') return;
    requestAnimationFrame(() => {
      const cur = this.messagesContainerRef?.nativeElement;
      if (cur) cur.scrollTop = cur.scrollHeight;
    });
  }

  private markChatRead(chatId: string): void {
    void this.api.sessions.markChatRead(this.selectedSessionId$.value, chatId).catch(err => {
      this.toast.warning(this.lang.t('chats.errors.markRead'), err instanceof Error ? err.message : undefined);
    });
  }

  // ── Thread mutators (active chat only — no cache) ──

  private appendMessage(msg: ChatMessageView): void {
    this.messages$.next(mergeOrAppend(this.messages$.value, msg));
  }

  private updateMessage(id: string, patch: Partial<ChatMessageView>): void {
    this.messages$.next(updateMessageById(this.messages$.value, id, patch));
  }

  // ── Realtime handlers ──

  private handleIncomingMessage(sessionId: string, newMsg: IncomingWsMessage): void {
    if (sessionId !== this.selectedSessionId$.value) return;

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

    const activeChat = this.activeChat$.value;
    if (activeChat && newMsg.chatId === activeChat.id) {
      this.appendMessage(mappedMessage);
      this.markChatRead(activeChat.id);
      if (!newMsg.fromMe) this.onMessageAppended('incoming');
    }

    // A customer message re-scores the lead server-side (after the AI replies) — refresh the badges.
    if (!newMsg.fromMe) void this.loadLeads(sessionId);

    // Update sidebar chat list.
    const prevChats = this.chats$.value;
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
    this.chats$.next(updatedChats);
  }

  private handleIncomingAck(sessionId: string, messageId: string, status: ChatMessageView['status']): void {
    if (sessionId !== this.selectedSessionId$.value) return;
    // Only the open thread is held in memory — apply the forward-only merge to it.
    const list = this.messages$.value;
    const idx = list.findIndex(m => m.id === messageId || m.waMessageId === messageId);
    if (idx === -1) return;
    const target = list[idx];
    const nextStatus = mergeDeliveryStatus(target.status, status) ?? target.status;
    const next = list.slice();
    next[idx] = { ...target, status: nextStatus };
    this.messages$.next(next);
  }

  private handleIncomingReaction(sessionId: string, messageId: string, reactions: Record<string, string>): void {
    if (sessionId !== this.selectedSessionId$.value) return;
    // Deep-merge metadata.reactions so existing media / quotedMessage survive.
    const list = this.messages$.value;
    const idx = list.findIndex(m => m.id === messageId || m.waMessageId === messageId);
    if (idx === -1) return;
    const target = list[idx];
    const next = list.slice();
    next[idx] = { ...target, metadata: { ...(target.metadata || {}), reactions } };
    this.messages$.next(next);
  }

  private handleIncomingRevoked(sessionId: string, id: string, type: string): void {
    if (sessionId !== this.selectedSessionId$.value) return;
    const list = this.messages$.value;
    const idx = list.findIndex(m => m.id === id || m.waMessageId === id);
    if (idx === -1) return;
    const target = list[idx];
    const next = list.slice();
    next[idx] = { ...target, body: '', type: asMessageType(type) };
    this.messages$.next(next);
  }

  // ── Reactions / delete ──

  async reactToMessage(msg: ChatMessageView, emoji: string): Promise<void> {
    const sessionId = this.selectedSessionId$.value;
    const activeChat = this.activeChat$.value;
    if (!sessionId || !activeChat) return;

    const msgId = msg.waMessageId || msg.id;
    const currentReactions = msg.metadata?.reactions || {};
    const sessionPhone = this.sessions$.value.find(s => s.id === sessionId)?.phone || 'me';

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

      // Only apply the optimistic update if this chat is still open.
      if (this.activeChat$.value?.id !== activeChat.id) return;
      this.messages$.next(
        this.messages$.value.map(m => {
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
    } catch (err) {
      this.toast.error(this.lang.t('chats.errors.react'), err instanceof Error ? err.message : undefined);
    }
  }

  async deleteMessage(msg: ChatMessageView): Promise<void> {
    const sessionId = this.selectedSessionId$.value;
    const activeChat = this.activeChat$.value;
    if (!sessionId || !activeChat) return;
    if (!window.confirm(this.lang.t('chats.deleteConfirm'))) return;

    try {
      await this.api.messages.delete(sessionId, {
        chatId: activeChat.id,
        messageId: msg.waMessageId || msg.id,
        forEveryone: true,
      });
      if (this.activeChat$.value?.id === activeChat.id) this.updateMessage(msg.id, { body: '', type: 'revoked' });
    } catch (err) {
      this.toast.error(this.lang.t('chats.errors.delete'), err instanceof Error ? err.message : undefined);
    }
  }

  // ── Attachments / emoji ──

  triggerFileSelect(): void {
    this.fileInputRef?.nativeElement.click();
  }

  onFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const oldUrl = this.previewUrl$.value;
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    this.previewUrl$.next(file.type.startsWith('image/') ? URL.createObjectURL(file) : null);

    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target?.result as string;
      const base64Data = dataUrl.split(',')[1];
      this.attachment$.next({ file, base64: base64Data, mimetype: file.type, filename: file.name });
    };
    reader.readAsDataURL(file);
  }

  removeAttachment(): void {
    this.attachment$.next(null);
    const url = this.previewUrl$.value;
    if (url) URL.revokeObjectURL(url);
    this.previewUrl$.next(null);
    const input = this.fileInputRef?.nativeElement;
    if (input) input.value = '';
  }

  addEmoji(emoji: string): void {
    this.messageInput += emoji;
    this.showEmojiPicker$.next(false);
  }

  // ── Send ──

  sendDisabled(): boolean {
    return !this.auth.canWrite() || (!this.messageInput.trim() && !this.attachment$.value) || this.sending$.value;
  }

  async handleSend(event?: Event): Promise<void> {
    event?.preventDefault();
    const sessionId = this.selectedSessionId$.value;
    const activeChat = this.activeChat$.value;
    if (!sessionId || !activeChat || this.sending$.value) return;

    const textToSend = this.messageInput.trim();
    const attachment = this.attachment$.value;
    if (!textToSend && !attachment) return;

    this.messageInput = '';
    this.sending$.next(true);

    const tempId = `temp_${Date.now()}`;
    const replyingTo = this.replyingTo$.value;
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

    this.appendMessage(tempMessage);
    this.onMessageAppended('outgoing');

    this.removeAttachment();
    this.replyingTo$.next(null);

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
      // otherwise both the echo and the renamed temp render as duplicate bubbles. Skip entirely if
      // the user switched chats mid-send (the thread no longer holds this chat's messages).
      if (this.activeChat$.value?.id === activeChat.id) {
        const list = this.messages$.value;
        const echoAlreadyAdded = list.some(m => m.id === result.messageId || m.waMessageId === result.messageId);
        this.messages$.next(
          echoAlreadyAdded
            ? list.filter(m => m.id !== tempId)
            : list.map(m =>
                m.id === tempId ? { ...m, id: result.messageId, waMessageId: result.messageId, status: 'sent' as const } : m,
              ),
        );
      }

      // Update sidebar chat list (move active chat to the top with the new snippet).
      const prevChats = this.chats$.value;
      const chatIndex = prevChats.findIndex(c => c.id === activeChat.id);
      if (chatIndex !== -1) {
        const updatedChats = [...prevChats];
        const target = { ...updatedChats[chatIndex] };
        target.lastMessage = attachment ? `[${attachment.mimetype.split('/')[0]}]` : textToSend;
        target.timestamp = Math.floor(Date.now() / 1000);
        updatedChats.splice(chatIndex, 1);
        updatedChats.unshift(target);
        this.chats$.next(updatedChats);
      }
    } catch (err) {
      this.toast.error(this.lang.t('chats.errors.send'), err instanceof Error ? err.message : undefined);
      if (this.activeChat$.value?.id === activeChat.id) this.updateMessage(tempId, { status: 'failed' });
    } finally {
      this.sending$.next(false);
    }
  }

  // ── Formatting / template helpers ──

  formatTime(msg: ChatMessageView): string {
    const timestamp = msg.timestamp || Math.floor(new Date(msg.createdAt).getTime() / 1000);
    if (!timestamp) return '';
    return new Date(timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /** Unix-seconds timestamp (falls back to createdAt) as a Date, for day grouping. */
  private messageDate(msg: ChatMessageView): Date {
    const ts = msg.timestamp ? msg.timestamp * 1000 : new Date(msg.createdAt).getTime();
    return new Date(ts);
  }

  /** Show a day-separator pill before the first message of each calendar day. */
  showDateSeparator(messages: ChatMessageView[], index: number): boolean {
    if (index <= 0) return true;
    return this.messageDate(messages[index]).toDateString() !== this.messageDate(messages[index - 1]).toDateString();
  }

  /** "Today" / "Yesterday" / a short date for the day-separator pill. */
  dayLabel(msg: ChatMessageView): string {
    const date = this.messageDate(msg);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return this.lang.t('chats.today', { defaultValue: 'Today' });
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return this.lang.t('chats.yesterday');
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
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
    const idx = this.buildImageMedia(this.messages$.value).findIndex(x => x.id === msg.id);
    if (idx >= 0) this.lightboxIndex$.next(idx);
  }

  replyingToName(): string {
    const replying = this.replyingTo$.value;
    const chat = this.activeChat$.value;
    if (!replying || !chat) return '';
    return replying.direction === 'outgoing' ? this.lang.t('chats.you') : this.chatDisplayName(chat);
  }

  replyingToBody(): string {
    const replying = this.replyingTo$.value;
    if (!replying) return '';
    return replying.type !== 'text' ? `[${replying.type}]` : replying.body;
  }

  attachmentSizeKb(): string {
    const att = this.attachment$.value;
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
