import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideAngularModule } from 'lucide-angular';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LangService } from '../../core/lang.service';
import { PageHeaderComponent } from '../../shared/page-header.component';
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, LucideAngularModule, PageHeaderComponent],
  templateUrl: './templates.component.html',
  styleUrl: './templates.component.css',
})
export class TemplatesComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly titleService = inject(Title);
  readonly auth = inject(AuthService);
  readonly lang = inject(LangService);

  readonly sessions = signal<Session[]>([]);
  readonly loadingSessions = signal(true);
  readonly selectedSessionId = signal('');
  readonly templates = signal<MessageTemplate[]>([]);
  readonly loadingTemplates = signal(false);

  readonly form = signal<TemplateForm>({ ...EMPTY_FORM });
  readonly editingTemplate = signal<MessageTemplate | null>(null);
  readonly deleteTarget = signal<MessageTemplate | null>(null);
  readonly toast = signal<{ type: 'success' | 'error'; message: string } | null>(null);
  readonly previewValues = signal<Record<string, string>>({});
  readonly searchTerm = signal('');
  readonly isSaving = signal(false);
  readonly isDeleting = signal(false);

  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  readonly selectedSession = computed(() => this.sessions().find(s => s.id === this.selectedSessionId()));
  readonly placeholders = computed(() => extractPlaceholders(this.form()));

  readonly preview = computed(() => {
    const form = this.form();
    const values = this.previewValues();
    return [form.header, form.body, form.footer]
      .filter(Boolean)
      .join('\n\n')
      .replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => values[key] || `{{${key}}}`);
  });

  readonly filteredTemplates = computed(() => {
    const query = this.searchTerm().trim().toLowerCase();
    if (!query) return this.templates();
    return this.templates().filter(template =>
      [template.name, template.header, template.body, template.footer]
        .filter(Boolean)
        .some(value => value!.toLowerCase().includes(query)),
    );
  });

  constructor() {
    // Reload templates whenever the selected session changes.
    effect(() => {
      const sessionId = this.selectedSessionId();
      if (!sessionId) {
        this.templates.set([]);
        return;
      }
      this.loadingTemplates.set(true);
      this.api.templates
        .list(sessionId)
        .then(list => this.templates.set(list))
        .catch(() => this.templates.set([]))
        .finally(() => this.loadingTemplates.set(false));
    });

    // Keep preview inputs in sync with the current placeholder set.
    effect(() => {
      const keys = this.placeholders();
      this.previewValues.update(current => {
        const next: Record<string, string> = {};
        for (const key of keys) next[key] = current[key] || '';
        return next;
      });
    });
  }

  ngOnInit(): void {
    this.titleService.setTitle(`${this.lang.t('templates.title')} · OpenWA`);
    this.api.sessions
      .list()
      .then(sessions => {
        this.sessions.set(sessions);
        if (!this.selectedSessionId() && sessions.length > 0) this.selectedSessionId.set(sessions[0].id);
      })
      .catch(() => {})
      .finally(() => this.loadingSessions.set(false));
  }

  private showToast(type: 'success' | 'error', message: string): void {
    this.toast.set({ type, message });
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), 4000);
  }

  onSessionChange(sessionId: string): void {
    this.selectedSessionId.set(sessionId);
    this.resetForm();
  }

  patchForm(patch: Partial<TemplateForm>): void {
    this.form.update(f => ({ ...f, ...patch }));
  }

  setPreviewValue(key: string, value: string): void {
    this.previewValues.update(v => ({ ...v, [key]: value }));
  }

  resetForm(): void {
    this.form.set({ ...EMPTY_FORM });
    this.editingTemplate.set(null);
    this.previewValues.set({});
  }

  openEdit(template: MessageTemplate): void {
    this.editingTemplate.set(template);
    this.form.set({
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
    return (
      !this.auth.canWrite() ||
      this.isSaving() ||
      !this.selectedSessionId() ||
      !this.form().name.trim() ||
      !this.form().body.trim()
    );
  }

  async handleSave(): Promise<void> {
    const sessionId = this.selectedSessionId();
    const form = this.form();
    if (!sessionId || !form.name.trim() || !form.body.trim()) return;

    const editing = this.editingTemplate();
    this.isSaving.set(true);
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
      this.templates.set(list);
    } catch (err) {
      this.showToast(
        'error',
        this.lang.t(editing ? 'templates.toasts.updateFailed' : 'templates.toasts.createFailed', {
          message: err instanceof Error ? err.message : this.lang.t('common.unknownError'),
        }),
      );
    } finally {
      this.isSaving.set(false);
    }
  }

  async handleDelete(): Promise<void> {
    const sessionId = this.selectedSessionId();
    const target = this.deleteTarget();
    if (!sessionId || !target) return;
    this.isDeleting.set(true);
    try {
      await this.api.templates.delete(sessionId, target.id);
      this.showToast('success', this.lang.t('templates.toasts.deleted'));
      if (this.editingTemplate()?.id === target.id) this.resetForm();
      this.deleteTarget.set(null);
      const list = await this.api.templates.list(sessionId);
      this.templates.set(list);
    } catch (err) {
      this.showToast(
        'error',
        this.lang.t('templates.toasts.deleteFailed', {
          message: err instanceof Error ? err.message : this.lang.t('common.unknownError'),
        }),
      );
    } finally {
      this.isDeleting.set(false);
    }
  }

  async copyName(name: string): Promise<void> {
    if (await copyToClipboard(name)) {
      this.showToast('success', this.lang.t('templates.toasts.copied'));
    }
  }
}
