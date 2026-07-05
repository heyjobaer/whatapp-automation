import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { BehaviorSubject, Subject, combineLatest } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';

import { ApiService } from '../../core/api.service';
import type { ChatLead, Session } from '../../core/api.types';

@Component({
  selector: 'app-leads',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './leads.component.html',
  styleUrl: './leads.component.css',
})
export class LeadsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  readonly sessions$ = new BehaviorSubject<Session[]>([]);
  readonly loadingSessions$ = new BehaviorSubject(true);
  readonly selectedSessionId$ = new BehaviorSubject('');
  readonly leads$ = new BehaviorSubject<ChatLead[]>([]);
  readonly loading$ = new BehaviorSubject(false);
  readonly loadError$ = new BehaviorSubject(false);

  private readonly hotCount$ = this.leads$.pipe(map(ls => ls.filter(l => l.leadScore >= 70).length));
  private readonly warmCount$ = this.leads$.pipe(
    map(ls => ls.filter(l => l.leadScore >= 40 && l.leadScore < 70).length),
  );

  readonly vm$ = combineLatest({
    sessions: this.sessions$,
    loadingSessions: this.loadingSessions$,
    selectedSessionId: this.selectedSessionId$,
    leads: this.leads$,
    loading: this.loading$,
    loadError: this.loadError$,
    hotCount: this.hotCount$,
    warmCount: this.warmCount$,
  });

  constructor(
    private readonly api: ApiService,
    private readonly titleService: Title,
  ) {
    // Reload the table whenever the selected session changes.
    this.selectedSessionId$.pipe(takeUntil(this.destroy$)).subscribe(sessionId => {
      if (sessionId) void this.loadLeads(sessionId);
      else this.leads$.next([]);
    });
  }

  ngOnInit(): void {
    this.titleService.setTitle('Leads');
    this.api.sessions
      .list()
      .then(sessions => {
        this.sessions$.next(sessions);
        if (sessions.length > 0 && !this.selectedSessionId$.value) this.selectedSessionId$.next(sessions[0].id);
      })
      .catch(() => {})
      .finally(() => this.loadingSessions$.next(false));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async loadLeads(sessionId: string): Promise<void> {
    this.loading$.next(true);
    try {
      const leads = await this.api.sessions.getLeads(sessionId);
      // Best score first (the backend already sorts, but keep it deterministic client-side too).
      this.leads$.next([...leads].sort((a, b) => b.leadScore - a.leadScore));
      this.loadError$.next(false);
    } catch {
      this.loadError$.next(true);
      this.leads$.next([]);
    } finally {
      this.loading$.next(false);
    }
  }

  setSession(id: string): void {
    this.selectedSessionId$.next(id);
  }

  refresh(): void {
    const id = this.selectedSessionId$.value;
    if (id) void this.loadLeads(id);
  }

  /** Hot ≥ 70, Warm ≥ 40, otherwise Cold. */
  leadStatus(score: number): 'hot' | 'warm' | 'cold' {
    return score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold';
  }

  displayName(lead: ChatLead): string {
    return lead.name || this.phoneNumber(lead) || lead.chatId.split('@')[0] || lead.chatId;
  }

  /**
   * The customer's phone number pulled from the WhatsApp chat id (e.g. `8801712345678@c.us` →
   * `+8801712345678`). Returns '' for privacy ids (`@lid`) or group ids, where no real number exists.
   */
  phoneNumber(lead: ChatLead): string {
    // Prefer the number the backend resolved (works even for @lid privacy ids).
    if (lead.phone && /^\d{6,}$/.test(lead.phone)) return `+${lead.phone}`;
    // Fall back to the chat-id local part for plain @c.us chats.
    const [local, domain] = lead.chatId.split('@');
    if (domain === 'g.us' || domain === 'lid') return '';
    return /^\d{6,}$/.test(local) ? `+${local}` : '';
  }

  formatDate(date?: string | null): string {
    return date ? new Date(date).toLocaleString() : '—';
  }
}
