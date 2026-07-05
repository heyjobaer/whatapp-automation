import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { BehaviorSubject, Subject, combineLatest, defer } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LangService } from '../../core/lang.service';
import type { Session } from '../../core/api.types';

interface ApiResponse {
  success: boolean;
  messageId?: string;
  timestamp: string;
  error?: string;
}

interface SessionGroup {
  id: string;
  name: string;
  linkedParentJID?: string | null;
}

const MESSAGE_TYPES = ['text', 'image', 'video', 'audio', 'document'] as const;
type TesterMessageType = (typeof MESSAGE_TYPES)[number];

@Component({
  selector: 'app-message-tester',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './message-tester.component.html',
  styleUrl: './message-tester.component.css',
})
export class MessageTesterComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  readonly messageTypes = MESSAGE_TYPES;

  readonly allSessions$ = new BehaviorSubject<Session[]>([]);
  readonly loadingSessions$ = new BehaviorSubject(true);
  readonly sessions$ = this.allSessions$.pipe(map(all => all.filter(s => s.status === 'ready')));

  readonly session$ = new BehaviorSubject('');
  recipient = '';
  readonly recipientType$ = new BehaviorSubject<'personal' | 'group'>('personal');
  readonly selectedGroup$ = new BehaviorSubject('');
  readonly messageType$ = new BehaviorSubject<TesterMessageType>('text');
  content = '';
  mediaUrl = '';
  readonly isLoading$ = new BehaviorSubject(false);
  readonly response$ = new BehaviorSubject<ApiResponse | null>(null);

  readonly groups$ = new BehaviorSubject<SessionGroup[]>([]);
  readonly loadingGroups$ = new BehaviorSubject(false);

  readonly vm$ = defer(() =>
    combineLatest({
      loadingSessions: this.loadingSessions$,
      sessions: this.sessions$,
      session: this.session$,
      recipientType: this.recipientType$,
      selectedGroup: this.selectedGroup$,
      messageType: this.messageType$,
      isLoading: this.isLoading$,
      response: this.response$,
      groups: this.groups$,
      loadingGroups: this.loadingGroups$,
      canWrite: this.auth.canWrite$,
    }),
  );

  constructor(
    private readonly api: ApiService,
    private readonly titleService: Title,
    readonly auth: AuthService,
    readonly lang: LangService,
  ) {
    // Load groups when a session is selected in group mode; clear the group selection when the
    // session changes so a stale group id from the previous session can't be sent to.
    combineLatest([this.session$, this.recipientType$])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([sessionId, recipientType]) => {
        const wantGroups = recipientType === 'group';
        this.selectedGroup$.next('');
        if (!wantGroups || !sessionId) {
          this.groups$.next([]);
          return;
        }
        this.loadingGroups$.next(true);
        this.api.sessions
          .getGroups(sessionId)
          .then(groups => {
            this.groups$.next(groups);
            if (groups.length > 0) this.selectedGroup$.next(groups[0].id);
          })
          .catch(() => this.groups$.next([]))
          .finally(() => this.loadingGroups$.next(false));
      });
  }

  ngOnInit(): void {
    this.titleService.setTitle(`${this.lang.t('messageTester.title')}`);
    this.api.sessions
      .list()
      .then(sessions => {
        this.allSessions$.next(sessions);
        const ready = sessions.filter(s => s.status === 'ready');
        if (ready.length > 0 && !this.session$.value) this.session$.next(ready[0].id);
      })
      .catch(() => {})
      .finally(() => this.loadingSessions$.next(false));
  }

  setSession(id: string): void {
    this.session$.next(id);
  }

  setRecipientType(type: 'personal' | 'group'): void {
    this.recipientType$.next(type);
  }

  setSelectedGroup(id: string): void {
    this.selectedGroup$.next(id);
  }

  setMessageType(type: TesterMessageType): void {
    this.messageType$.next(type);
  }

  sendDisabled(): boolean {
    return (
      !this.auth.canWrite() ||
      this.isLoading$.value ||
      !this.session$.value ||
      (this.recipientType$.value === 'group' ? !this.selectedGroup$.value : !this.recipient)
    );
  }

  async handleSend(): Promise<void> {
    const targetId = this.recipientType$.value === 'group' ? this.selectedGroup$.value : this.recipient;
    const session = this.session$.value;
    if (!session || !targetId) return;
    this.isLoading$.next(true);
    this.response$.next(null);

    try {
      // For a personal recipient, let the engine resolve the number to its canonical chat id rather
      // than hand-building an engine-specific JID here (#265) — also surfaces unregistered numbers.
      let chatId = targetId;
      if (this.recipientType$.value !== 'group') {
        const resolved = await this.api.contacts.checkNumber(session, targetId.replace(/[^0-9]/g, ''));
        if (!resolved.exists || !resolved.whatsappId) {
          this.response$.next({
            success: false,
            timestamp: new Date().toISOString(),
            error: this.lang.t('messageTester.notOnWhatsApp'),
          });
          return;
        }
        chatId = resolved.whatsappId;
      }

      const type = this.messageType$.value;
      let result;
      if (type === 'text') {
        result = await this.api.messages.sendText(session, chatId, this.content);
      } else if (type === 'audio') {
        result = await this.api.messages.sendMedia(session, chatId, 'audio', { url: this.mediaUrl });
      } else if (type === 'document') {
        result = await this.api.messages.sendMedia(session, chatId, 'document', {
          url: this.mediaUrl,
          filename: this.content || undefined,
        });
      } else {
        result = await this.api.messages.sendMedia(session, chatId, type, {
          url: this.mediaUrl,
          caption: this.content || undefined,
        });
      }

      this.response$.next({
        success: !!result.messageId,
        messageId: result.messageId,
        timestamp: result.timestamp ? new Date(result.timestamp * 1000).toISOString() : new Date().toISOString(),
      });
    } catch (err) {
      this.response$.next({
        success: false,
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : this.lang.t('messageTester.sendFailed'),
      });
    } finally {
      this.isLoading$.next(false);
    }
  }

  responseJson(): string {
    return JSON.stringify(this.response$.value, null, 2);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
