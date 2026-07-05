import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { BehaviorSubject, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { ApiService } from '../../core/api.service';
import { LangService } from '../../core/lang.service';
import type { OverviewStats, Session, SessionStats, Webhook } from '../../core/api.types';

@Component({
  selector: 'app-dashboard',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  constructor(
    private readonly api: ApiService,
    private readonly router: Router,
    private readonly titleService: Title,
    readonly lang: LangService,
  ) {}

  readonly sessions$ = new BehaviorSubject<Session[]>([]);
  readonly stats$ = new BehaviorSubject<SessionStats | null>(null);
  readonly webhooks$ = new BehaviorSubject<Webhook[]>([]);
  readonly overview$ = new BehaviorSubject<OverviewStats | null>(null);
  readonly loading$ = new BehaviorSubject(true);
  readonly error$ = new BehaviorSubject<string | null>(null);

  private readonly messagesToday$ = this.overview$.pipe(
    map(o => (o ? (o.messages.today.sent + o.messages.today.received).toLocaleString() : '—')),
  );
  private readonly totalMessages$ = this.overview$.pipe(
    map(o => (o ? (o.messages.sent + o.messages.received).toLocaleString() : '—')),
  );

  readonly vm$ = combineLatest({
    sessions: this.sessions$,
    stats: this.stats$,
    webhooks: this.webhooks$,
    overview: this.overview$,
    loading: this.loading$,
    error: this.error$,
    messagesToday: this.messagesToday$,
    totalMessages: this.totalMessages$,
  });

  ngOnInit(): void {
    this.titleService.setTitle(`${this.lang.t('dashboard.title')}`);

    this.api.sessions
      .list()
      .then(data => this.sessions$.next(data))
      .catch(err => this.error$.next(err instanceof Error ? err.message : this.lang.t('dashboard.loadError')))
      .finally(() => this.loading$.next(false));

    this.api.sessions.getStats().then(s => this.stats$.next(s)).catch(() => {});
    this.api.webhooks
      .listAll()
      .then(w => this.webhooks$.next(Array.isArray(w) ? w : []))
      .catch(() => {});
    // /stats/overview is ADMIN-only; for a non-admin key it 403s → overview stays null and the
    // message cards fall back to '—' without breaking the (un-gated) session cards.
    this.api.stats.getOverview().then(o => this.overview$.next(o)).catch(() => {});
  }

  async disconnect(id: string): Promise<void> {
    try {
      await this.api.sessions.stop(id);
      const data = await this.api.sessions.list();
      this.sessions$.next(data);
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
