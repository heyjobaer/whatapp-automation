import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { BehaviorSubject, Subject, combineLatest, defer } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LangService } from '../../core/lang.service';
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
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './webhooks.component.html',
  styleUrl: './webhooks.component.css',
})
export class WebhooksComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  readonly availableEventNames = AVAILABLE_EVENT_NAMES;

  readonly webhooks$ = new BehaviorSubject<Webhook[]>([]);
  readonly sessions$ = new BehaviorSubject<Session[]>([]);
  readonly loading$ = new BehaviorSubject(true);
  readonly webhooksError$ = new BehaviorSubject(false);

  readonly showCreateModal$ = new BehaviorSubject(false);
  readonly showEditModal$ = new BehaviorSubject(false);
  readonly showDeleteModal$ = new BehaviorSubject(false);
  readonly deleteTarget$ = new BehaviorSubject<{ sessionId: string; id: string; url: string } | null>(null);
  readonly editWebhook$ = new BehaviorSubject<Webhook | null>(null);
  readonly newWebhook$ = new BehaviorSubject<NewWebhookDraft>({
    url: '',
    events: ['message.received'],
    sessionId: '',
    filters: null,
  });
  readonly testingId$ = new BehaviorSubject<string | null>(null);
  readonly toast$ = new BehaviorSubject<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filter-count badge popover state (coords are fixed-position so card overflow doesn't clip it).
  readonly popover$ = new BehaviorSubject<{ webhookId: string; top: number; left: number } | null>(null);

  // Single source for the contact/group autocomplete in whichever modal is open.
  readonly chats$ = new BehaviorSubject<Chat[]>([]);
  private readonly activeSessionId$ = combineLatest([this.showEditModal$, this.editWebhook$, this.newWebhook$]).pipe(
    map(([showEdit, editWebhook, newWebhook]) => (showEdit ? (editWebhook?.sessionId ?? '') : newWebhook.sessionId)),
  );

  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  readonly vm$ = defer(() =>
    combineLatest({
      loading: this.loading$,
      toast: this.toast$,
      webhooksError: this.webhooksError$,
      showCreateModal: this.showCreateModal$,
      showEditModal: this.showEditModal$,
      showDeleteModal: this.showDeleteModal$,
      deleteTarget: this.deleteTarget$,
      editWebhook: this.editWebhook$,
      newWebhook: this.newWebhook$,
      testingId: this.testingId$,
      popover: this.popover$,
      chats: this.chats$,
      sessions: this.sessions$,
      webhooks: this.webhooks$,
      canWrite: this.auth.canWrite$,
    }),
  );

  constructor(
    private readonly api: ApiService,
    private readonly titleService: Title,
    readonly auth: AuthService,
    readonly lang: LangService,
  ) {
    combineLatest([this.activeSessionId$, this.showCreateModal$, this.showEditModal$])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([sessionId, showCreate, showEdit]) => {
        const enabled = showCreate || showEdit;
        if (!enabled || !sessionId) return;
        this.api.sessions
          .getChats(sessionId)
          .then(chats => this.chats$.next(chats))
          .catch(() => this.chats$.next([]));
      });
  }

  ngOnInit(): void {
    this.titleService.setTitle(`${this.lang.t('webhooks.title')}`);
    void this.reload();
    this.api.sessions.list().then(s => this.sessions$.next(s)).catch(() => {});
  }

  private async reload(): Promise<void> {
    try {
      const webhooks = await this.api.webhooks.listAll();
      // Normalize `events` to an array at the data boundary so every consumer (list render + edit
      // modal) can trust the declared string[] shape.
      this.webhooks$.next(webhooks.map(w => ({ ...w, events: Array.isArray(w.events) ? w.events : [] })));
    } catch {
      this.webhooksError$.next(true);
    } finally {
      this.loading$.next(false);
    }
  }

  setShowCreateModal(show: boolean): void {
    this.showCreateModal$.next(show);
  }

  setShowEditModal(show: boolean): void {
    this.showEditModal$.next(show);
  }

  setShowDeleteModal(show: boolean): void {
    this.showDeleteModal$.next(show);
  }

  clearToast(): void {
    this.toast$.next(null);
  }

  supportsFilters(events: string[]): boolean {
    return supportsFilters(events);
  }

  sessionName(sessionId: string): string {
    return this.sessions$.value.find(s => s.id === sessionId)?.name || sessionId.substring(0, 12);
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
    this.popover$.next({ webhookId, top: rect.bottom + 6, left: rect.left });
  }

  closePopover(): void {
    this.popover$.next(null);
  }

  popoverConditions(webhook: Webhook): WebhookFilterCondition[] {
    return webhook.filters?.conditions ?? [];
  }

  private showToast(type: 'success' | 'error', message: string): void {
    this.toast$.next({ type, message });
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast$.next(null), 4000);
  }

  // ── Create ──

  patchNewWebhook(patch: Partial<NewWebhookDraft>): void {
    this.newWebhook$.next({ ...this.newWebhook$.value, ...patch });
  }

  toggleNewEvent(event: string): void {
    const prev = this.newWebhook$.value;
    this.newWebhook$.next({
      ...prev,
      events: prev.events.includes(event) ? prev.events.filter(e => e !== event) : [...prev.events, event],
    });
  }

  async handleCreate(): Promise<void> {
    const draft = this.newWebhook$.value;
    if (!draft.url || !draft.sessionId) return;
    try {
      await this.api.webhooks.create(draft.sessionId, {
        url: draft.url,
        events: draft.events,
        // Don't persist message-filters when no message events are selected (the filter UI is hidden).
        filters: supportsFilters(draft.events) ? draft.filters : null,
      });
      this.showCreateModal$.next(false);
      this.newWebhook$.next({ url: '', events: ['message.received'], sessionId: '', filters: null });
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
    this.editWebhook$.next({ ...webhook });
    this.showEditModal$.next(true);
  }

  patchEditWebhook(patch: Partial<Webhook>): void {
    const v = this.editWebhook$.value;
    if (v) this.editWebhook$.next({ ...v, ...patch });
  }

  toggleEditEvent(event: string): void {
    const v = this.editWebhook$.value;
    if (!v) return;
    this.editWebhook$.next({
      ...v,
      events: v.events.includes(event) ? v.events.filter(e => e !== event) : [...v.events, event],
    });
  }

  async handleEdit(): Promise<void> {
    const webhook = this.editWebhook$.value;
    if (!webhook) return;
    try {
      await this.api.webhooks.update(webhook.sessionId, webhook.id, {
        url: webhook.url,
        events: webhook.events,
        active: webhook.active,
        // Clear message-filters if the edit removed all message events (the filter UI is hidden then).
        filters: supportsFilters(webhook.events) ? (webhook.filters ?? null) : null,
      });
      this.showEditModal$.next(false);
      this.editWebhook$.next(null);
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
    this.deleteTarget$.next({ sessionId, id, url });
    this.showDeleteModal$.next(true);
  }

  async handleDelete(): Promise<void> {
    const target = this.deleteTarget$.value;
    if (!target) return;
    try {
      await this.api.webhooks.delete(target.sessionId, target.id);
      this.showDeleteModal$.next(false);
      this.deleteTarget$.next(null);
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
    this.testingId$.next(id);
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
      this.testingId$.next(null);
    }
  }

  ngOnDestroy(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.destroy$.next();
    this.destroy$.complete();
  }
}
