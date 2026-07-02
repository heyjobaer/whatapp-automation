import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideAngularModule } from 'lucide-angular';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LangService } from '../../core/lang.service';
import { PageHeaderComponent } from '../../shared/page-header.component';
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, LucideAngularModule, PageHeaderComponent],
  templateUrl: './message-tester.component.html',
  styleUrl: './message-tester.component.css',
})
export class MessageTesterComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly titleService = inject(Title);
  readonly auth = inject(AuthService);
  readonly lang = inject(LangService);

  readonly messageTypes = MESSAGE_TYPES;

  readonly allSessions = signal<Session[]>([]);
  readonly loadingSessions = signal(true);
  readonly sessions = computed(() => this.allSessions().filter(s => s.status === 'ready'));

  readonly session = signal('');
  recipient = '';
  readonly recipientType = signal<'personal' | 'group'>('personal');
  readonly selectedGroup = signal('');
  readonly messageType = signal<TesterMessageType>('text');
  content = '';
  mediaUrl = '';
  readonly isLoading = signal(false);
  readonly response = signal<ApiResponse | null>(null);
  readonly recipientTick = signal(0);

  readonly groups = signal<SessionGroup[]>([]);
  readonly loadingGroups = signal(false);

  constructor() {
    // Load groups when a session is selected in group mode; clear the group selection when the
    // session changes so a stale group id from the previous session can't be sent to.
    effect(() => {
      const sessionId = this.session();
      const wantGroups = this.recipientType() === 'group';
      this.selectedGroup.set('');
      if (!wantGroups || !sessionId) {
        this.groups.set([]);
        return;
      }
      this.loadingGroups.set(true);
      this.api.sessions
        .getGroups(sessionId)
        .then(groups => {
          this.groups.set(groups);
          if (groups.length > 0) this.selectedGroup.set(groups[0].id);
        })
        .catch(() => this.groups.set([]))
        .finally(() => this.loadingGroups.set(false));
    });
  }

  ngOnInit(): void {
    this.titleService.setTitle(`${this.lang.t('messageTester.title')} · OpenWA`);
    this.api.sessions
      .list()
      .then(sessions => {
        this.allSessions.set(sessions);
        const ready = sessions.filter(s => s.status === 'ready');
        if (ready.length > 0 && !this.session()) this.session.set(ready[0].id);
      })
      .catch(() => {})
      .finally(() => this.loadingSessions.set(false));
  }

  sendDisabled(): boolean {
    this.recipientTick();
    return (
      !this.auth.canWrite() ||
      this.isLoading() ||
      !this.session() ||
      (this.recipientType() === 'group' ? !this.selectedGroup() : !this.recipient)
    );
  }

  async handleSend(): Promise<void> {
    const targetId = this.recipientType() === 'group' ? this.selectedGroup() : this.recipient;
    const session = this.session();
    if (!session || !targetId) return;
    this.isLoading.set(true);
    this.response.set(null);

    try {
      // For a personal recipient, let the engine resolve the number to its canonical chat id rather
      // than hand-building an engine-specific JID here (#265) — also surfaces unregistered numbers.
      let chatId = targetId;
      if (this.recipientType() !== 'group') {
        const resolved = await this.api.contacts.checkNumber(session, targetId.replace(/[^0-9]/g, ''));
        if (!resolved.exists || !resolved.whatsappId) {
          this.response.set({
            success: false,
            timestamp: new Date().toISOString(),
            error: this.lang.t('messageTester.notOnWhatsApp'),
          });
          return;
        }
        chatId = resolved.whatsappId;
      }

      const type = this.messageType();
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

      this.response.set({
        success: !!result.messageId,
        messageId: result.messageId,
        timestamp: result.timestamp ? new Date(result.timestamp * 1000).toISOString() : new Date().toISOString(),
      });
    } catch (err) {
      this.response.set({
        success: false,
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : this.lang.t('messageTester.sendFailed'),
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  responseJson(): string {
    return JSON.stringify(this.response(), null, 2);
  }
}
