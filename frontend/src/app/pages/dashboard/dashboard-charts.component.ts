import { ChangeDetectionStrategy, Component, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject, combineLatest, defer } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';

import { ApiService } from '../../core/api.service';
import { LangService } from '../../core/lang.service';
import { ThemeService } from '../../core/theme.service';
import type { MessageStats, StatsPeriod } from '../../core/api.types';

const PERIODS: StatsPeriod[] = ['24h', '7d', '30d'];

// Stable, distinct color per message type (Chart.js needs literal colors). Keyed by type name —
// not array index — so two types can never share a color, and a slice keeps its color even when
// the set of present types changes between requests. Covers every type mapMessageType() can emit.
// vs the React original: contact a855f7→d946ef and video 14b8a6→0d9488 — the old purple/blue pair
// was indistinguishable under deuteranopia (ΔE 1.9); validated with the dataviz palette checker.
const TYPE_COLORS: Record<string, string> = {
  text: '#25d366',
  image: '#3b82f6',
  contact: '#d946ef',
  document: '#f59e0b',
  audio: '#06b6d4',
  voice: '#ec4899',
  video: '#0d9488',
  sticker: '#ef4444',
  location: '#84cc16',
  revoked: '#f43f5e',
  unknown: '#64748b', // neutral by design: the "unknown/Other" slot
};

// Deterministic fallback for any unmapped type, so its color is stable across renders.
const FALLBACK_COLORS = ['#0ea5e9', '#d946ef', '#f97316', '#10b981', '#6366f1', '#eab308'];
function colorForType(name: string): string {
  if (TYPE_COLORS[name]) return TYPE_COLORS[name];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

// '2026-06-24 14:00:00' (hour buckets) → '14:00'; '2026-06-24' (day buckets) → '06-24'.
function formatTick(ts: string, period: StatsPeriod): string {
  return period === '24h' ? ts.slice(11, 16) : ts.slice(5);
}

// WhatsApp ids look like '62812...@c.us' / '...@g.us' / '...@lid' — show just the local part.
function shortChat(chatId: string): string {
  return chatId.split('@')[0] || chatId;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

@Component({
  selector: 'app-dashboard-charts',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-charts.component.html',
  styleUrl: './dashboard-charts.css',
})
export class DashboardChartsComponent implements OnDestroy {
  private readonly destroy$ = new Subject<void>();

  readonly periods = PERIODS;
  readonly period$ = new BehaviorSubject<StatsPeriod>('7d');
  readonly loading$ = new BehaviorSubject(true);
  readonly error$ = new BehaviorSubject(false);
  // Non-admin keys 403 on /stats/messages → hide the section entirely. Any OTHER error (e.g. a
  // server 500) is a real fault: surface a small notice instead of silently vanishing (#488).
  readonly forbidden$ = new BehaviorSubject(false);
  readonly data$ = new BehaviorSubject<MessageStats | null>(null);

  // Re-render charts when the theme flips (Chart.js needs literal colors, not CSS vars).
  // Deferred so the injected `theme` is available (field runs before the constructor body).
  private readonly chartTheme$ = defer(() =>
    combineLatest([this.theme.theme$, this.theme.palette$]).pipe(
      map(() => ({ border: cssVar('--border'), text: cssVar('--text-secondary') })),
    ),
  );

  private readonly hasData$ = this.data$.pipe(
    map(d => !!d && (d.timeSeries.length > 0 || Object.keys(d.byType).length > 0 || d.topChats.length > 0)),
  );

  private readonly byType$ = this.data$.pipe(
    map(d =>
      Object.entries(d?.byType ?? {})
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
    ),
  );

  private readonly topChats$ = this.data$.pipe(
    map(d => (d?.topChats ?? []).slice(0, 8).map(c => ({ name: shortChat(c.chatId), count: c.messageCount }))),
  );

  private readonly timeSeriesData$ = combineLatest([this.data$, this.period$]).pipe(
    map(([data, period]) => {
      const series = data?.timeSeries ?? [];
      return {
        labels: series.map(p => formatTick(p.timestamp, period)),
        datasets: [
          {
            label: this.lang.t('dashboard.charts.sent'),
            data: series.map(p => p.sent),
            borderColor: '#25d366',
            backgroundColor: 'rgba(37, 211, 102, 0.18)',
            fill: true,
            borderWidth: 2,
            pointRadius: 0,
            pointHitRadius: 12,
            cubicInterpolationMode: 'monotone' as const,
          },
          {
            label: this.lang.t('dashboard.charts.received'),
            data: series.map(p => p.received),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.18)',
            fill: true,
            borderWidth: 2,
            pointRadius: 0,
            pointHitRadius: 12,
            cubicInterpolationMode: 'monotone' as const,
          },
        ],
      };
    }),
  );

  private readonly timeSeriesOptions$ = this.chartTheme$.pipe(
    map(({ border, text }) => ({
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: { legend: { position: 'bottom' as const, labels: { color: text, usePointStyle: true, boxHeight: 8 } } },
      scales: {
        x: { grid: { color: border, borderDash: [3, 3] }, ticks: { color: text, font: { size: 12 } } },
        y: { grid: { color: border, borderDash: [3, 3] }, ticks: { color: text, font: { size: 12 }, precision: 0 } },
      },
    })),
  );

  private readonly byTypeData$ = this.byType$.pipe(
    map(entries => ({
      labels: entries.map(e => e.name),
      datasets: [
        {
          data: entries.map(e => e.value),
          backgroundColor: entries.map(e => colorForType(e.name)),
          // 2px surface gap between slices (identity never rides on hue alone).
          borderColor: cssVar('--bg-card') || '#ffffff',
          borderWidth: 2,
        },
      ],
    })),
  );

  private readonly byTypeOptions$ = this.chartTheme$.pipe(
    map(({ text }) => ({
      maintainAspectRatio: false,
      cutout: '58%',
      plugins: { legend: { position: 'bottom' as const, labels: { color: text, usePointStyle: true, boxHeight: 8 } } },
    })),
  );

  private readonly topChatsData$ = this.topChats$.pipe(
    map(chats => ({
      labels: chats.map(c => c.name),
      datasets: [
        {
          label: this.lang.t('dashboard.charts.messages'),
          data: chats.map(c => c.count),
          backgroundColor: '#25d366',
          borderRadius: 4,
          maxBarThickness: 18,
        },
      ],
    })),
  );

  private readonly topChatsOptions$ = this.chartTheme$.pipe(
    map(({ border, text }) => ({
      maintainAspectRatio: false,
      indexAxis: 'y' as const,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: border, borderDash: [3, 3] }, ticks: { color: text, font: { size: 12 }, precision: 0 } },
        y: { grid: { display: false }, ticks: { color: text, font: { size: 12 } } },
      },
    })),
  );

  readonly vm$ = combineLatest({
    period: this.period$,
    loading: this.loading$,
    error: this.error$,
    forbidden: this.forbidden$,
    hasData: this.hasData$,
    byType: this.byType$,
    topChats: this.topChats$,
    timeSeriesData: this.timeSeriesData$,
    timeSeriesOptions: this.timeSeriesOptions$,
    byTypeData: this.byTypeData$,
    byTypeOptions: this.byTypeOptions$,
    topChatsData: this.topChatsData$,
    topChatsOptions: this.topChatsOptions$,
  });

  constructor(
    private readonly api: ApiService,
    private readonly lang: LangService,
    private readonly theme: ThemeService,
  ) {
    // Re-fetch whenever the selected period changes (mirrors the old effect on period()).
    this.period$.pipe(takeUntil(this.destroy$)).subscribe(period => {
      this.loading$.next(true);
      this.error$.next(false);
      this.api.stats
        .getMessages(period)
        .then(stats => this.data$.next(stats))
        .catch((err: Error & { status?: number }) => {
          if (err.status === 403) this.forbidden$.next(true);
          else this.error$.next(true);
        })
        .finally(() => this.loading$.next(false));
    });
  }

  setPeriod(period: StatsPeriod): void {
    this.period$.next(period);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
