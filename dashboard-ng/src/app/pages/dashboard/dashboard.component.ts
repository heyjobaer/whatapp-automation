import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideAngularModule } from 'lucide-angular';

import { ApiService } from '../../core/api.service';
import { LangService } from '../../core/lang.service';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { DashboardChartsComponent } from './dashboard-charts.component';
import type { OverviewStats, Session, SessionStats, Webhook } from '../../core/api.types';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, LucideAngularModule, PageHeaderComponent, DashboardChartsComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly titleService = inject(Title);
  readonly lang = inject(LangService);

  readonly sessions = signal<Session[]>([]);
  readonly stats = signal<SessionStats | null>(null);
  readonly webhooks = signal<Webhook[]>([]);
  readonly overview = signal<OverviewStats | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly messagesToday = computed(() => {
    const o = this.overview();
    return o ? (o.messages.today.sent + o.messages.today.received).toLocaleString() : '—';
  });
  readonly totalMessages = computed(() => {
    const o = this.overview();
    return o ? (o.messages.sent + o.messages.received).toLocaleString() : '—';
  });

  ngOnInit(): void {
    this.titleService.setTitle(`${this.lang.t('dashboard.title')} · OpenWA`);

    this.api.sessions
      .list()
      .then(data => this.sessions.set(data))
      .catch(err => this.error.set(err instanceof Error ? err.message : this.lang.t('dashboard.loadError')))
      .finally(() => this.loading.set(false));

    this.api.sessions.getStats().then(s => this.stats.set(s)).catch(() => {});
    this.api.webhooks
      .listAll()
      .then(w => this.webhooks.set(Array.isArray(w) ? w : []))
      .catch(() => {});
    // /stats/overview is ADMIN-only; for a non-admin key it 403s → overview stays null and the
    // message cards fall back to '—' without breaking the (un-gated) session cards.
    this.api.stats.getOverview().then(o => this.overview.set(o)).catch(() => {});
  }

  async disconnect(id: string): Promise<void> {
    try {
      await this.api.sessions.stop(id);
      const data = await this.api.sessions.list();
      this.sessions.set(data);
    } catch (err) {
      console.error('Failed to disconnect:', err);
    }
  }

  goToSessions(): void {
    void this.router.navigate(['/sessions']);
  }

  formatLastActive(date?: string): string {
    if (!date) return this.lang.t('common.never');
    const diff = Date.now() - new Date(date).getTime();
    if (diff < 60000) return this.lang.t('common.justNow');
    if (diff < 3600000) return this.lang.t('common.minAgo', { count: Math.floor(diff / 60000) });
    if (diff < 86400000) return this.lang.t('common.hoursAgo', { count: Math.floor(diff / 3600000) });
    return new Date(date).toLocaleDateString();
  }

  formatStatus(status: string): string {
    return this.lang.t(`sessionStatus.${status}`, { defaultValue: status });
  }

  canDisconnect(status: string): boolean {
    return ['ready', 'initializing', 'connecting', 'qr_ready'].includes(status);
  }
}
