import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideAngularModule } from 'lucide-angular';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LangService } from '../../core/lang.service';
import { SocketService } from '../../core/socket.service';
import { ToastService } from '../../core/toast.service';
import { PageHeaderComponent } from '../../shared/page-header.component';
import type { Session } from '../../core/api.types';

interface QrData {
  sessionId: string;
  sessionName: string;
  qrCode: string;
}

@Component({
  selector: 'app-sessions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, TranslatePipe, LucideAngularModule, PageHeaderComponent],
  templateUrl: './sessions.component.html',
  styleUrl: './sessions.component.css',
})
export class SessionsComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly socket = inject(SocketService);
  private readonly toast = inject(ToastService);
  private readonly titleService = inject(Title);
  readonly auth = inject(AuthService);
  readonly lang = inject(LangService);

  readonly sessions = signal<Session[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly showCreateModal = signal(false);
  newSessionName = '';
  readonly creating = signal(false);

  readonly qrData = signal<QrData | null>(null);
  readonly pairingMode = signal(false);
  phoneNumber = '';
  readonly pairingCode = signal<string | null>(null);
  readonly requestingPairing = signal(false);
  readonly pairingError = signal<string | null>(null);

  searchQuery = '';
  statusFilter = 'all';
  // Plain fields drive filtering through this tick so OnPush templates recompute on input.
  private readonly filterTick = signal(0);

  readonly selectedSession = signal<Session | null>(null);
  readonly deleteConfirmId = signal<string | null>(null);
  readonly killConfirmId = signal<string | null>(null);

  private qrRefreshInterval: ReturnType<typeof setInterval> | null = null;
  private currentSessionName = '';
  private unregisterSocket: (() => void) | null = null;

  readonly filteredSessions = computed(() => {
    this.filterTick();
    const q = this.searchQuery.toLowerCase();
    return this.sessions().filter(s => {
      const matchesSearch = s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q);
      const matchesStatus =
        this.statusFilter === 'all' ||
        (this.statusFilter === 'active' && s.status === 'ready') ||
        (this.statusFilter === 'inactive' && ['created', 'idle', 'disconnected'].includes(s.status)) ||
        (this.statusFilter === 'connecting' && ['initializing', 'connecting', 'qr_ready'].includes(s.status));
      return matchesSearch && matchesStatus;
    });
  });

  readonly deleteConfirmName = computed(
    () => this.sessions().find(s => s.id === this.deleteConfirmId())?.name ?? '',
  );
  readonly killConfirmName = computed(() => this.sessions().find(s => s.id === this.killConfirmId())?.name ?? '');

  constructor() {
    // The gateway delivers events only to subscribed rooms; join the wildcard session.status room
    // so status changes for every session are received live.
    effect(() => {
      if (this.socket.isConnected()) {
        this.socket.subscribe('*', ['session.status', 'session.qr']);
      }
    });
  }

  ngOnInit(): void {
    this.titleService.setTitle(`${this.lang.t('sessions.title')} · OpenWA`);
    this.unregisterSocket = this.socket.register({
      onSessionStatus: event => {
        const prev = this.sessions().find(s => s.id === event.sessionId);
        // Some engines double-signal one transition; only react to an ACTUAL status change so the
        // toast and the failed-refresh don't fire on every redundant envelope.
        if (prev && prev.status === event.status) return;
        this.sessions.update(list =>
          list.map(s => (s.id === event.sessionId ? { ...s, status: event.status as Session['status'] } : s)),
        );
        if (event.status === 'ready') {
          this.toast.success(this.lang.t('sessions.toasts.readyTitle'), this.lang.t('sessions.toasts.readyDesc'));
        } else if (event.status === 'disconnected') {
          this.toast.warning(
            this.lang.t('sessions.toasts.disconnectedTitle'),
            this.lang.t('sessions.toasts.disconnectedDesc'),
          );
        } else if (event.status === 'failed') {
          // Refresh so the card picks up the lastError reason from the API.
          void this.fetchSessions();
          this.toast.error(this.lang.t('sessions.toasts.failedTitle'), this.lang.t('sessions.toasts.failedDesc'));
        }
      },
    });
    void this.fetchSessions();
  }

  ngOnDestroy(): void {
    this.stopQrPolling();
    this.unregisterSocket?.();
    this.unregisterSocket = null;
  }

  onFilterChange(): void {
    this.filterTick.update(v => v + 1);
  }

  async fetchSessions(): Promise<Session[]> {
    try {
      this.loading.set(true);
      const data = await this.api.sessions.list();
      this.sessions.set(data);
      return data;
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : this.lang.t('sessions.create.errorDefault'));
      return [];
    } finally {
      this.loading.set(false);
    }
  }

  // ── Create ──

  onNameInput(value: string): void {
    this.newSessionName = value.toLowerCase().replace(/\s+/g, '-');
  }

  nameInvalidChars(): boolean {
    return !!this.newSessionName && !/^[a-z0-9-]+$/.test(this.newSessionName);
  }

  nameTooLong(): boolean {
    return !!this.newSessionName && this.newSessionName.length > 50;
  }

  nameDuplicate(): boolean {
    return (
      !!this.newSessionName &&
      /^[a-z0-9-]+$/.test(this.newSessionName) &&
      this.newSessionName.length <= 50 &&
      this.sessions().some(s => s.name === this.newSessionName)
    );
  }

  createDisabled(): boolean {
    return (
      this.creating() ||
      !this.newSessionName.trim() ||
      !/^[a-z0-9-]+$/.test(this.newSessionName) ||
      this.newSessionName.length > 50 ||
      this.sessions().some(s => s.name === this.newSessionName)
    );
  }

  async handleCreate(): Promise<void> {
    if (!this.newSessionName.trim() || this.createDisabled()) return;
    try {
      this.creating.set(true);
      const newSession = await this.api.sessions.create(this.newSessionName);
      this.sessions.update(list => [...list, newSession]);
      this.newSessionName = '';
      this.showCreateModal.set(false);
      this.toast.success(
        this.lang.t('sessions.create.successTitle'),
        this.lang.t('sessions.create.successDesc', { name: newSession.name }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : this.lang.t('sessions.create.errorDefault');
      this.error.set(msg);
      this.toast.error(this.lang.t('sessions.create.errorTitle'), msg);
    } finally {
      this.creating.set(false);
    }
  }

  // ── Lifecycle actions ──

  async handleDelete(id: string): Promise<void> {
    const session = this.sessions().find(s => s.id === id);
    try {
      await this.api.sessions.delete(id);
      this.sessions.update(list => list.filter(s => s.id !== id));
      this.toast.success(
        this.lang.t('sessions.delete.successTitle'),
        session
          ? this.lang.t('sessions.delete.successDescNamed', { name: session.name })
          : this.lang.t('sessions.delete.successDescGeneric'),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : this.lang.t('sessions.delete.errorDefault');
      console.error('Failed to delete:', err);
      this.toast.error(this.lang.t('sessions.delete.errorTitle'), msg);
    } finally {
      this.deleteConfirmId.set(null);
    }
  }

  async handleStart(id: string): Promise<void> {
    const session = this.sessions().find(s => s.id === id);
    if (session && ['initializing', 'connecting', 'qr_ready'].includes(session.status)) {
      void this.handleShowQR(id);
      return;
    }

    try {
      await this.api.sessions.start(id);
      this.sessions.update(list => list.map(s => (s.id === id ? { ...s, status: 'connecting' as const } : s)));
      await this.fetchSessions();
      void this.handleShowQR(id);
    } catch (err) {
      console.error('Failed to start:', err);
      const fresh = await this.fetchSessions();
      const current = fresh.find(s => s.id === id);
      if (current?.status !== 'ready') void this.handleShowQR(id);
    }
  }

  async handleStop(id: string): Promise<void> {
    try {
      await this.api.sessions.stop(id);
      this.sessions.update(list => list.map(s => (s.id === id ? { ...s, status: 'disconnected' as const } : s)));
      if (this.qrData()?.sessionId === id) this.closeQrModal();
    } catch (err) {
      console.error('Failed to stop:', err);
      void this.fetchSessions();
    }
  }

  async handleForceKill(id: string): Promise<void> {
    try {
      await this.api.sessions.forceKill(id);
      this.sessions.update(list => list.map(s => (s.id === id ? { ...s, status: 'disconnected' as const } : s)));
      this.toast.success(this.lang.t('sessions.forceKill.successTitle'), this.lang.t('sessions.forceKill.success'));
    } catch (err) {
      console.error('Failed to force-kill:', err);
      this.toast.error(this.lang.t('sessions.forceKill.failedTitle'), this.lang.t('sessions.forceKill.failed'));
      void this.fetchSessions();
    } finally {
      this.killConfirmId.set(null);
    }
  }

  // ── QR modal + polling ──

  async handleShowQR(id: string): Promise<void> {
    const session = this.sessions().find(s => s.id === id);
    // Nothing to show for an already-connected session.
    if (session?.status === 'ready') return;
    const sessionName = session?.name || '';
    // Reset any pairing sub-state from a previous open so a freshly opened modal never shows a
    // stale code/phone belonging to a different session.
    this.pairingMode.set(false);
    this.phoneNumber = '';
    this.pairingCode.set(null);
    this.pairingError.set(null);
    // Show loading state immediately so the modal opens and polling starts even before the
    // engine has finished initializing.
    this.setQrData({ sessionId: id, sessionName, qrCode: '' });
    this.currentSessionName = sessionName;
    try {
      const qr = await this.api.sessions.getQR(id);
      this.setQrData({ sessionId: id, sessionName, qrCode: qr.qrCode });
    } catch (err) {
      console.error('Failed to get QR:', err);
      // Do not clear qrData here — keep the loading modal open so the polling interval
      // (every 5 s) retries until the QR becomes available.
    }
  }

  private setQrData(data: QrData | null): void {
    this.qrData.set(data);
    this.stopQrPolling();
    if (data) {
      this.currentSessionName = data.sessionName;
      this.qrRefreshInterval = setInterval(() => void this.refreshQR(data.sessionId), 5000);
    }
  }

  private stopQrPolling(): void {
    if (this.qrRefreshInterval) {
      clearInterval(this.qrRefreshInterval);
      this.qrRefreshInterval = null;
    }
  }

  private async refreshQR(sessionId: string): Promise<void> {
    // Guard: if session is already connected, stop polling immediately.
    const currentSession = this.sessions().find(s => s.id === sessionId);
    if (currentSession?.status === 'ready') {
      this.setQrData(null);
      this.currentSessionName = '';
      return;
    }
    try {
      const qr = await this.api.sessions.getQR(sessionId);
      this.qrData.set({ sessionId, sessionName: this.currentSessionName, qrCode: qr.qrCode });
      if (qr.status === 'ready') {
        this.setQrData(null);
        this.currentSessionName = '';
        void this.fetchSessions();
      }
    } catch {
      // Keep qrData alive so the polling interval keeps retrying until the QR is ready. Only stop
      // polling if the session itself has failed. 'authenticating' is included so the modal (and
      // the pairing-code panel mounted in it) survives the brief post-link handshake instead of
      // being torn down mid-pairing — it closes on the real 'ready'/'failed' transition.
      const updated = await this.api.sessions.get(sessionId).catch(() => null);
      const stillInitializing =
        updated && ['initializing', 'connecting', 'qr_ready', 'authenticating'].includes(updated.status);
      if (!stillInitializing) {
        this.setQrData(null);
        this.currentSessionName = '';
        void this.fetchSessions();
      }
    }
  }

  closeQrModal(): void {
    this.setQrData(null);
    this.pairingMode.set(false);
    this.phoneNumber = '';
    this.pairingCode.set(null);
    this.pairingError.set(null);
  }

  // ── Pairing code ──

  onPhoneInput(value: string): void {
    this.phoneNumber = value.replace(/\D/g, '');
  }

  phoneValid(): boolean {
    return /^[0-9]{6,15}$/.test(this.phoneNumber.trim());
  }

  async handleGeneratePairingCode(): Promise<void> {
    // Guard against a second concurrent request: the button is disabled while in flight, but the
    // input's Enter handler is not, so a rapid double-Enter would otherwise fire overlapping POSTs.
    if (this.requestingPairing()) return;
    const qr = this.qrData();
    if (!qr || !this.phoneNumber.trim()) return;
    if (!this.phoneValid()) {
      this.pairingError.set(this.lang.t('sessions.pairing.invalidPhone'));
      return;
    }
    try {
      this.requestingPairing.set(true);
      this.pairingError.set(null);
      const res = await this.api.sessions.requestPairingCode(qr.sessionId, this.phoneNumber.trim());
      this.pairingCode.set(res.pairingCode);
    } catch (err) {
      this.pairingError.set(err instanceof Error ? err.message : this.lang.t('common.errorGeneric'));
    } finally {
      this.requestingPairing.set(false);
    }
  }

  changePairingNumber(): void {
    this.pairingCode.set(null);
    this.phoneNumber = '';
  }

  formattedPairingCode(): string {
    const code = this.pairingCode() ?? '';
    return `${code.substring(0, 4)} - ${code.substring(4)}`;
  }

  // ── Formatting helpers ──

  formatLastActive(date?: string): string {
    if (!date) return this.lang.t('common.never');
    const diff = Date.now() - new Date(date).getTime();
    if (diff < 60000) return this.lang.t('common.justNow');
    if (diff < 3600000) return this.lang.t('common.minAgo', { count: Math.floor(diff / 60000) });
    return new Date(date).toLocaleDateString();
  }

  formatStatus(status: string): string {
    return this.lang.t(`sessionStatus.${status}`, { defaultValue: status });
  }

  isStartable(status: string): boolean {
    return status === 'created' || status === 'idle' || status === 'disconnected';
  }

  isStoppable(status: string): boolean {
    return ['ready', 'initializing', 'connecting', 'qr_ready'].includes(status);
  }

  isConnecting(status: string): boolean {
    return status === 'initializing' || status === 'connecting' || status === 'qr_ready';
  }
}
