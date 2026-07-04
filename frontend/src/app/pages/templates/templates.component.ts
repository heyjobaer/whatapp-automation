import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { BehaviorSubject, Subject, combineLatest, defer } from 'rxjs';
import { distinctUntilChanged, map, takeUntil } from 'rxjs/operators';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LangService } from '../../core/lang.service';
import { copyToClipboard } from '../../shared/utils/clipboard';
import type { MessageTemplate, Session, TemplatePayload } from '../../core/api.types';

interface TemplateForm {
  name: string;
  header: string;
  body: string;
  footer: string;
}

const EMPTY_FORM: TemplateForm = { name: '', header: '', body: '', footer: '' };

function extractPlaceholders(template: TemplateForm | MessageTemplate): string[] {
  const source = [template.header, template.body, template.footer].filter(Boolean).join('\n');
  return Array.from(
    new Set(Array.from(source.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g), match => match[1])),
  ).sort();
}

function toPayload(form: TemplateForm): TemplatePayload {
  return {
    name: form.name.trim(),
    header: form.header.trim() || null,
    body: form.body.trim(),
    footer: form.footer.trim() || null,
  };
}

@Component({
  selector: 'app-templates',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './templates.component.html',
  styleUrl: './templates.component.css',
})
export class TemplatesComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  readonly sessions$ = new BehaviorSubject<Session[]>([]);
  readonly loadingSessions$ = new BehaviorSubject(true);
  readonly selectedSessionId$ = new BehaviorSubject('');
  readonly templates$ = new BehaviorSubject<MessageTemplate[]>([]);
  readonly loadingTemplates$ = new BehaviorSubject(false);

  readonly form$ = new BehaviorSubject<TemplateForm>({ ...EMPTY_FORM });
  readonly editingTemplate$ = new BehaviorSubject<MessageTemplate | null>(null);
  readonly deleteTarget$ = new BehaviorSubject<MessageTemplate | null>(null);
  readonly toast$ = new BehaviorSubject<{ type: 'success' | 'error'; message: string } | null>(null);
  readonly previewValues$ = new BehaviorSubject<Record<string, string>>({});
  readonly searchTerm$ = new BehaviorSubject('');
  readonly isSaving$ = new BehaviorSubject(false);
  readonly isDeleting$ = new BehaviorSubject(false);

  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly selectedSession$ = combineLatest([this.sessions$, this.selectedSessionId$]).pipe(
    map(([sessions, id]) => sessions.find(s => s.id === id)),
  );
  private readonly placeholders$ = this.form$.pipe(
    map(form => extractPlaceholders(form)),
    distinctUntilChanged((a, b) => a.join('|') === b.join('|')),
  );

  private readonly preview$ = combineLatest([this.form$, this.previewValues$]).pipe(
    map(([form, values]) =>
      [form.header, form.body, form.footer]
        .filter(Boolean)
        .join('\n\n')
        .replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => values[key] || `{{${key}}}`),
    ),
  );

  private readonly filteredTemplates$ = combineLatest([this.templates$, this.searchTerm$]).pipe(
    map(([templates, term]) => {
      const query = term.trim().toLowerCase();
      if (!query) return templates;
      return templates.filter(template =>
        [template.name, template.header, template.body, template.footer]
          .filter(Boolean)
          .some(value => value!.toLowerCase().includes(query)),
      );
    }),
  );

  readonly vm$ = defer(() =>
    combineLatest({
      loadingSessions: this.loadingSessions$,
      sessions: this.sessions$,
      selectedSessionId: this.selectedSessionId$,
      templates: this.templates$,
      loadingTemplates: this.loadingTemplates$,
      form: this.form$,
      editingTemplate: this.editingTemplate$,
      deleteTarget: this.deleteTarget$,
      toast: this.toast$,
      previewValues: this.previewValues$,
      searchTerm: this.searchTerm$,
      isSaving: this.isSaving$,
      isDeleting: this.isDeleting$,
      selectedSession: this.selectedSession$,
      placeholders: this.placeholders$,
      preview: this.preview$,
      filteredTemplates: this.filteredTemplates$,
      canWrite: this.auth.canWrite$,
    }),
  );

  constructor(
    private readonly api: ApiService,
    private readonly titleService: Title,
    readonly auth: AuthService,
    readonly lang: LangService,
  ) {
    // Reload templates whenever the selected session changes.
    this.selectedSessionId$.pipe(takeUntil(this.destroy$)).subscribe(sessionId => {
      if (!sessionId) {
        this.templates$.next([]);
        return;
      }
      this.loadingTemplates$.next(true);
      this.api.templates
        .list(sessionId)
        .then(list => this.templates$.next(list))
        .catch(() => this.templates$.next([]))
        .finally(() => this.loadingTemplates$.next(false));
    });

    // Keep preview inputs in sync with the current placeholder set.
    this.placeholders$.pipe(takeUntil(this.destroy$)).subscribe(keys => {
      const current = this.previewValues$.value;
      const next: Record<string, string> = {};
      for (const key of keys) next[key] = current[key] || '';
      this.previewValues$.next(next);
    });
  }

  ngOnInit(): void {
    this.titleService.setTitle(`${this.lang.t('templates.title')} · OpenWA`);
    this.api.sessions
      .list()
      .then(sessions => {
        this.sessions$.next(sessions);
        if (!this.selectedSessionId$.value && sessions.length > 0) this.selectedSessionId$.next(sessions[0].id);
      })
      .catch(() => {})
      .finally(() => this.loadingSessions$.next(false));
  }

  private showToast(type: 'success' | 'error', message: string): void {
    this.toast$.next({ type, message });
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast$.next(null), 4000);
  }

  clearToast(): void {
    this.toast$.next(null);
  }

  setSearchTerm(term: string): void {
    this.searchTerm$.next(term);
  }

  setDeleteTarget(target: MessageTemplate | null): void {
    this.deleteTarget$.next(target);
  }

  onSessionChange(sessionId: string): void {
    this.selectedSessionId$.next(sessionId);
    this.resetForm();
  }

  patchForm(patch: Partial<TemplateForm>): void {
    this.form$.next({ ...this.form$.value, ...patch });
  }

  setPreviewValue(key: string, value: string): void {
    this.previewValues$.next({ ...this.previewValues$.value, [key]: value });
  }

  resetForm(): void {
    this.form$.next({ ...EMPTY_FORM });
    this.editingTemplate$.next(null);
    this.previewValues$.next({});
  }

  openEdit(template: MessageTemplate): void {
    this.editingTemplate$.next(template);
    this.form$.next({
      name: template.name,
      header: template.header || '',
      body: template.body,
      footer: template.footer || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  templatePlaceholderSummary(template: MessageTemplate): string {
    const keys = extractPlaceholders(template);
    return keys.length > 0 ? keys.map(key => `{{${key}}}`).join(' ') : this.lang.t('templates.noPlaceholders');
  }

  saveDisabled(): boolean {
    const form = this.form$.value;
    return (
      !this.auth.canWrite() ||
      this.isSaving$.value ||
      !this.selectedSessionId$.value ||
      !form.name.trim() ||
      !form.body.trim()
    );
  }

  async handleSave(): Promise<void> {
    const sessionId = this.selectedSessionId$.value;
    const form = this.form$.value;
    if (!sessionId || !form.name.trim() || !form.body.trim()) return;

    const editing = this.editingTemplate$.value;
    this.isSaving$.next(true);
    try {
      if (editing) {
        await this.api.templates.update(sessionId, editing.id, toPayload(form));
        this.showToast('success', this.lang.t('templates.toasts.updated'));
      } else {
        await this.api.templates.create(sessionId, toPayload(form));
        this.showToast('success', this.lang.t('templates.toasts.created'));
      }
      this.resetForm();
      const list = await this.api.templates.list(sessionId);
      this.templates$.next(list);
    } catch (err) {
      this.showToast(
        'error',
        this.lang.t(editing ? 'templates.toasts.updateFailed' : 'templates.toasts.createFailed', {
          message: err instanceof Error ? err.message : this.lang.t('common.unknownError'),
        }),
      );
    } finally {
      this.isSaving$.next(false);
    }
  }

  async handleDelete(): Promise<void> {
    const sessionId = this.selectedSessionId$.value;
    const target = this.deleteTarget$.value;
    if (!sessionId || !target) return;
    this.isDeleting$.next(true);
    try {
      await this.api.templates.delete(sessionId, target.id);
      this.showToast('success', this.lang.t('templates.toasts.deleted'));
      if (this.editingTemplate$.value?.id === target.id) this.resetForm();
      this.deleteTarget$.next(null);
      const list = await this.api.templates.list(sessionId);
      this.templates$.next(list);
    } catch (err) {
      this.showToast(
        'error',
        this.lang.t('templates.toasts.deleteFailed', {
          message: err instanceof Error ? err.message : this.lang.t('common.unknownError'),
        }),
      );
    } finally {
      this.isDeleting$.next(false);
    }
  }

  async copyName(name: string): Promise<void> {
    if (await copyToClipboard(name)) {
      this.showToast('success', this.lang.t('templates.toasts.copied'));
    }
  }

  ngOnDestroy(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.destroy$.next();
    this.destroy$.complete();
  }
}
