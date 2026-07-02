import { ChangeDetectionStrategy, Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideAngularModule } from 'lucide-angular';

import { ApiService } from '../../core/api.service';
import { LangService } from '../../core/lang.service';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { copyToClipboard } from '../../shared/utils/clipboard';
import type { ApiKey } from '../../core/api.types';

const ROLE_NAMES = ['admin', 'operator', 'viewer'] as const;

@Component({
  selector: 'app-api-keys',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, LucideAngularModule, PageHeaderComponent],
  templateUrl: './api-keys.component.html',
  styleUrl: './api-keys.component.css',
})
export class ApiKeysComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly titleService = inject(Title);
  readonly lang = inject(LangService);

  readonly roleNames = ROLE_NAMES;

  readonly apiKeys = signal<ApiKey[]>([]);
  readonly loading = signal(true);
  readonly apiKeysError = signal(false);
  readonly visibleKeys = signal<Set<string>>(new Set());
  readonly showModal = signal(false);
  newKeyName = '';
  newKeyRole = 'operator';
  readonly creating = signal(false);
  readonly createdKey = signal<string | null>(null);
  readonly copied = signal<string | null>(null);
  readonly confirmAction = signal<{ type: 'delete' | 'revoke'; id: string; name: string } | null>(null);

  private readonly windowWidth = signal(window.innerWidth);
  // Responsive column hiding (mirrors the TanStack columnVisibility behavior).
  readonly showKeyColumn = computed(() => this.windowWidth() >= 640);
  readonly showLastUsedColumn = computed(() => this.windowWidth() >= 768);

  @HostListener('window:resize')
  onResize(): void {
    this.windowWidth.set(window.innerWidth);
  }

  ngOnInit(): void {
    this.titleService.setTitle(`${this.lang.t('apiKeys.title')} · OpenWA`);
    void this.reload();
  }

  private async reload(): Promise<void> {
    try {
      this.apiKeys.set(await this.api.apiKeys.list());
    } catch {
      this.apiKeysError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  isKeyVisible(id: string): boolean {
    return this.visibleKeys().has(id);
  }

  toggleKeyVisibility(id: string): void {
    this.visibleKeys.update(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  closeModal(): void {
    this.showModal.set(false);
    this.createdKey.set(null);
  }

  async handleCreate(): Promise<void> {
    if (!this.newKeyName) return;
    this.creating.set(true);
    try {
      const created = await this.api.apiKeys.create({ name: this.newKeyName, role: this.newKeyRole });
      this.createdKey.set(created.apiKey || null);
      this.newKeyName = '';
      this.newKeyRole = 'operator';
      void this.reload();
    } catch (err) {
      console.error('Failed to create:', err);
    } finally {
      this.creating.set(false);
    }
  }

  async confirmAndExecute(): Promise<void> {
    const action = this.confirmAction();
    if (!action) return;
    this.confirmAction.set(null);
    try {
      if (action.type === 'delete') await this.api.apiKeys.delete(action.id);
      else await this.api.apiKeys.revoke(action.id);
      void this.reload();
    } catch (err) {
      console.error(`Failed to ${action.type}:`, err);
    }
  }

  async handleCopy(text: string, id: string): Promise<void> {
    if (await copyToClipboard(text)) {
      this.copied.set(id);
      setTimeout(() => this.copied.set(null), 2000);
    }
  }

  formatLastUsed(date?: string): string {
    return date ? new Date(date).toLocaleDateString() : this.lang.t('common.never');
  }
}
