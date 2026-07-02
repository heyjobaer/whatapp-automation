import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideAngularModule } from 'lucide-angular';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LangService } from '../../core/lang.service';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { FilterBuilderComponent } from '../../shared/filter-builder.component';
import type { Chat, Session, Webhook, WebhookFilterCondition, WebhookFilters } from '../../core/api.types';

// Filters only apply to message.* events (the wildcard subscribes to them too).
const supportsFilters = (events: string[]) => events.some(e => e === '*' || e.startsWith('message.'));

// Must stay aligned with the backend WEBHOOK_EVENTS: the API now rejects unknown
// event names, so offering e.g. the never-emitted 'session.connected' would 400 on save.
const AVAILABLE_EVENT_NAMES = [
  'message.received',
  'message.sent',
  'message.ack',
  'message.failed',
  'message.revoked',
  'message.reaction',
  'session.status',
  'session.qr',
  'session.authenticated',
  'session.disconnected',
  'group.join',
  'group.leave',
  'group.update',
  '*',
] as const;

interface NewWebhookDraft {
  url: string;
  events: string[];
  sessionId: string;
  filters: WebhookFilters | null;
}

@Component({
  selector: 'app-webhooks',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, LucideAngularModule, PageHeaderComponent, FilterBuilderComponent],
  templateUrl: './webhooks.component.html',
  styleUrl: './webhooks.component.css',
})
export class WebhooksComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly titleService = inject(Title);
  readonly auth = inject(AuthService);
  readonly lang = inject(LangService);

  readonly availableEventNames = AVAILABLE_EVENT_NAMES;

  readonly webhooks = signal<Webhook[]>([]);
  readonly sessions = signal<Session[]>([]);
  readonly loading = signal(true);
  readonly webhooksError = signal(false);

  readonly showCreateModal = signal(false);
  readonly showEditModal = signal(false);
  readonly showDeleteModal = signal(false);
  readonly deleteTarget = signal<{ sessionId: string; id: string; url: string } | null>(null);
  readonly editWebhook = signal<Webhook | null>(null);
  readonly newWebhook = signal<NewWebhookDraft>({ url: '', events: ['message.received'], sessionId: '', filters: null });
  readonly testingId = signal<string | null>(null);
  readonly toast = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filter-count badge popover state (coords are fixed-position so card overflow doesn't clip it).
  readonly popover = signal<{ webhookId: string; top: number; left: number } | null>(null);

  // Single source for the contact/group autocomplete in whichever modal is open.
  readonly chats = signal<Chat[]>([]);
  private readonly activeSessionId = computed(() =>
    this.showEditModal() ? (this.editWebhook()?.sessionId ?? '') : this.newWebhook().sessionId,
  );

  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const sessionId = this.activeSessionId();
      const enabled = this.showCreateModal() || this.showEditModal();
      if (!enabled || !sessionId) return;
      this.api.sessions
        .getChats(sessionId)
        .then(chats => this.chats.set(chats))
        .catch(() => this.chats.set([]));
    });
  }

  ngOnInit(): void {
    this.titleService.setTitle(`${this.lang.t('webhooks.title')} · OpenWA`);
    void this.reload();
    this.api.sessions.list().then(s => this.sessions.set(s)).catch(() => {});
  }

  private async reload(): Promise<void> {
    try {
      const webhooks = await this.api.webhooks.listAll();
      // Normalize `events` to an array at the data boundary so every consumer (list render + edit
      // modal) can trust the declared string[] shape.
      this.webhooks.set(webhooks.map(w => ({ ...w, events: Array.isArray(w.events) ? w.events : [] })));
    } catch {
      this.webhooksError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  supportsFilters(events: string[]): boolean {
    return supportsFilters(events);
  }

  sessionName(sessionId: string): string {
    return this.sessions().find(s => s.id === sessionId)?.name || sessionId.substring(0, 12);
  }

  eventDescription(name: string): string {
    if (name === '*') return this.lang.t('webhooks.eventDescriptions.all');
    return this.lang.t(`webhooks.eventDescriptions.${name}`, { defaultValue: name });
  }

  filterBadgeLabel(count: number): string {
    // en.json ships badge (singular base) + badge_other (plural); mirror i18next's plural pick.
    const key = count === 1 ? 'webhooks.filters.badge' : 'webhooks.filters.badge_other';
    const result = this.lang.t(key, { count });
    return result.includes('webhooks.filters') ? this.lang.t('webhooks.filters.badge', { count }) : result;
  }

  // One-line, human-readable summary of a condition for the badge popover.
  conditionSummary(c: WebhookFilterCondition): string {
    const field = this.lang.t(`webhooks.filters.fields.${c.field}`, { defaultValue: c.field });
    const operator = this.lang.t(`webhooks.filters.operators.${c.operator}`, { defaultValue: c.operator });
    let value: string;
    if (typeof c.value === 'boolean') {
      value = c.value ? this.lang.t('webhooks.filters.yes') : this.lang.t('webhooks.filters.no');
    } else if (Array.isArray(c.value)) {
      value = c.value.join(', ');
    } else {
      value = `"${c.value}"`;
    }
    const caseNote = c.caseSensitive ? ` · ${this.lang.t('webhooks.filters.caseSensitive')}` : '';
    return `${field} ${operator} ${value}${caseNote}`;
  }

  openPopover(webhookId: string, el: EventTarget | null): void {
    const rect = (el as HTMLElement).getBoundingClientRect();
    this.popover.set({ webhookId, top: rect.bottom + 6, left: rect.left });
  }

  closePopover(): void {
    this.popover.set(null);
  }

  popoverConditions(webhook: Webhook): WebhookFilterCondition[] {
    return webhook.filters?.conditions ?? [];
  }

  private showToast(type: 'success' | 'error', message: string): void {
    this.toast.set({ type, message });
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), 4000);
  }

  // ── Create ──

  patchNewWebhook(patch: Partial<NewWebhookDraft>): void {
    this.newWebhook.update(v => ({ ...v, ...patch }));
  }

  toggleNewEvent(event: string): void {
    this.newWebhook.update(prev => ({
      ...prev,
      events: prev.events.includes(event) ? prev.events.filter(e => e !== event) : [...prev.events, event],
    }));
  }

  async handleCreate(): Promise<void> {
    const draft = this.newWebhook();
    if (!draft.url || !draft.sessionId) return;
    try {
      await this.api.webhooks.create(draft.sessionId, {
        url: draft.url,
        events: draft.events,
        // Don't persist message-filters when no message events are selected (the filter UI is hidden).
        filters: supportsFilters(draft.events) ? draft.filters : null,
      });
      this.showCreateModal.set(false);
      this.newWebhook.set({ url: '', events: ['message.received'], sessionId: '', filters: null });
      this.showToast('success', this.lang.t('webhooks.toasts.created'));
      void this.reload();
    } catch (err) {
      this.showToast(
        'error',
        this.lang.t('webhooks.toasts.createFailed', {
          message: err instanceof Error ? err.message : this.lang.t('common.unknownError'),
        }),
      );
    }
  }

  // ── Edit ──

  openEdit(webhook: Webhook): void {
    this.editWebhook.set({ ...webhook });
    this.showEditModal.set(true);
  }

  patchEditWebhook(patch: Partial<Webhook>): void {
    this.editWebhook.update(v => (v ? { ...v, ...patch } : v));
  }

  toggleEditEvent(event: string): void {
    this.editWebhook.update(v =>
      v
        ? { ...v, events: v.events.includes(event) ? v.events.filter(e => e !== event) : [...v.events, event] }
        : v,
    );
  }

  async handleEdit(): Promise<void> {
    const webhook = this.editWebhook();
    if (!webhook) return;
    try {
      await this.api.webhooks.update(webhook.sessionId, webhook.id, {
        url: webhook.url,
        events: webhook.events,
        active: webhook.active,
        // Clear message-filters if the edit removed all message events (the filter UI is hidden then).
        filters: supportsFilters(webhook.events) ? (webhook.filters ?? null) : null,
      });
      this.showEditModal.set(false);
      this.editWebhook.set(null);
      this.showToast('success', this.lang.t('webhooks.toasts.updated'));
      void this.reload();
    } catch (err) {
      this.showToast(
        'error',
        this.lang.t('webhooks.toasts.updateFailed', {
          message: err instanceof Error ? err.message : this.lang.t('common.unknownError'),
        }),
      );
    }
  }

  // ── Delete ──

  confirmDelete(sessionId: string, id: string, url: string): void {
    this.deleteTarget.set({ sessionId, id, url });
    this.showDeleteModal.set(true);
  }

  async handleDelete(): Promise<void> {
    const target = this.deleteTarget();
    if (!target) return;
    try {
      await this.api.webhooks.delete(target.sessionId, target.id);
      this.showDeleteModal.set(false);
      this.deleteTarget.set(null);
      this.showToast('success', this.lang.t('webhooks.toasts.deleted'));
      void this.reload();
    } catch (err) {
      this.showToast(
        'error',
        this.lang.t('webhooks.toasts.deleteFailed', {
          message: err instanceof Error ? err.message : this.lang.t('common.unknownError'),
        }),
      );
    }
  }

  // ── Test ──

  async handleTest(sessionId: string, id: string): Promise<void> {
    this.testingId.set(id);
    try {
      const result = await this.api.webhooks.test(sessionId, id);
      if (result.success) {
        this.showToast('success', this.lang.t('webhooks.toasts.testOk', { status: result.statusCode }));
      } else {
        this.showToast(
          'error',
          this.lang.t('webhooks.toasts.testFailed', { message: result.error || `Status ${result.statusCode}` }),
        );
      }
    } catch (err) {
      this.showToast(
        'error',
        this.lang.t('webhooks.toasts.testError', {
          message: err instanceof Error ? err.message : this.lang.t('common.unknownError'),
        }),
      );
    } finally {
      this.testingId.set(null);
    }
  }
}
