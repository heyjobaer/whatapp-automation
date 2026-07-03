import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideAngularModule } from 'lucide-angular';

import { API_BASE_URL, ApiService } from '../../core/api.service';
import { LangService } from '../../core/lang.service';
import { ToastService } from '../../core/toast.service';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { copyToClipboard } from '../../shared/utils/clipboard';
import type { Engine, InfraStatus, SavedConfig } from '../../core/api.types';

interface DatabaseConfig {
  type: 'sqlite' | 'postgres';
  builtIn: boolean;
  host: string;
  port: string;
  username: string;
  password: string;
  database: string;
  poolSize: number;
  sslEnabled: boolean;
  sslRejectUnauthorized: boolean;
}

interface RedisConfig {
  builtIn: boolean;
  host: string;
  port: string;
  password: string;
  connected: boolean;
}

interface StorageConfig {
  type: 'local' | 's3';
  builtIn: boolean;
  localPath: string;
  s3Bucket: string;
  s3Region: string;
  s3AccessKey: string;
  s3SecretKey: string;
  s3Endpoint: string;
}

interface EngineConfig {
  type: string;
  headless: boolean;
  sessionDataPath: string;
  browserArgs: string;
}

type RestartStatus = 'idle' | 'restarting' | 'waiting' | 'success' | 'error';

@Component({
  selector: 'app-infrastructure',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, LucideAngularModule, PageHeaderComponent],
  templateUrl: './infrastructure.component.html',
  styleUrl: './infrastructure.component.css',
})
export class InfrastructureComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly titleService = inject(Title);
  private readonly toast = inject(ToastService);
  readonly lang = inject(LangService);

  readonly loading = signal(true);
  readonly statusError = signal(false);
  readonly infraStatus = signal<InfraStatus | null>(null);
  readonly savedConfig = signal<SavedConfig | null>(null);
  readonly engines = signal<Engine[]>([]);
  readonly currentEngine = signal('');

  readonly saving = signal(false);
  readonly showRestartModal = signal(false);
  readonly restartCountdown = signal(0);
  readonly restartStatus = signal<RestartStatus>('idle');
  readonly migrating = signal(false);
  // Set when the just-saved config changes the DB or storage backend vs what's running, so the
  // restart modal can warn that the new backend starts empty and offer a data backup (#488).
  readonly dbSwitch = signal(false);
  readonly storageSwitch = signal(false);
  // After a successful save (before the restart reloads the page), /config holds the new value but
  // /status still holds the old one — suppress the "pinned by environment" note in that window.
  readonly savePending = signal(false);

  // Editable form state (ngModel two-way binding; change events trigger OnPush CD).
  dbConfig: DatabaseConfig = {
    type: 'sqlite',
    builtIn: false,
    host: 'localhost',
    port: '5432',
    username: 'postgres',
    password: '',
    database: 'openwa',
    poolSize: 10,
    sslEnabled: false,
    sslRejectUnauthorized: true,
  };
  redisConfig: RedisConfig = { builtIn: false, host: 'localhost', port: '6379', password: '', connected: false };
  storageConfig: StorageConfig = {
    type: 'local',
    builtIn: false,
    localPath: './data/media',
    s3Bucket: '',
    s3Region: 'ap-southeast-1',
    s3AccessKey: '',
    s3SecretKey: '',
    s3Endpoint: '',
  };
  engineConfig: EngineConfig = {
    type: 'whatsapp-web.js',
    headless: true,
    sessionDataPath: './data/sessions',
    browserArgs: '--no-sandbox --disable-gpu',
  };
  redisEnabled = false;
  queueEnabled = false;
  readonly queueStats = signal({ webhooks: { pending: 0, completed: 0, failed: 0 } });

  private pendingProfiles: string[] = [];
  private previousProfiles: string[] = [];

  ngOnInit(): void {
    this.titleService.setTitle(`${this.lang.t('infrastructure.title')} · OpenWA`);

    // Seed the editable form ONCE from live /status (the running selection) + saved /config (detail
    // fields /status does not expose). Secrets are never returned, so their inputs stay empty; an
    // empty submit preserves the stored secret on the backend (#226).
    Promise.allSettled([this.api.infra.getStatus(), this.api.infra.getConfig()])
      .then(([statusRes, configRes]) => {
        if (statusRes.status === 'rejected') {
          this.statusError.set(true);
          return;
        }
        const status = statusRes.value;
        this.infraStatus.set(status);
        this.queueStats.set({ webhooks: status.queue.webhooks });

        this.dbConfig = {
          ...this.dbConfig,
          type: (status.database.type as 'sqlite' | 'postgres') || 'sqlite',
          host: status.database.host || 'localhost',
          // builtIn reflects whether OpenWA's bundled container is actually running (live).
          builtIn: status.database.builtIn,
        };
        this.redisConfig = {
          ...this.redisConfig,
          host: status.redis.host,
          port: String(status.redis.port),
          builtIn: status.redis.builtIn,
          connected: status.redis.connected,
        };
        this.redisEnabled = status.redis.enabled;
        this.storageConfig = {
          ...this.storageConfig,
          type: status.storage.type,
          localPath: status.storage.path || './uploads',
          builtIn: status.storage.builtIn,
        };
        this.queueEnabled = status.queue.enabled;

        if (configRes.status === 'fulfilled') {
          const saved = configRes.value;
          this.savedConfig.set(saved);
          this.dbConfig = {
            ...this.dbConfig,
            host: saved.database.host || this.dbConfig.host,
            port: saved.database.port || this.dbConfig.port,
            username: saved.database.username || this.dbConfig.username,
            database: saved.database.database || this.dbConfig.database,
            poolSize: saved.database.poolSize,
            sslEnabled: saved.database.sslEnabled,
            sslRejectUnauthorized: saved.database.sslRejectUnauthorized,
          };
          this.redisConfig = {
            ...this.redisConfig,
            host: saved.redis.host || this.redisConfig.host,
            port: saved.redis.port || this.redisConfig.port,
          };
          this.storageConfig = {
            ...this.storageConfig,
            localPath: saved.storage.localPath || this.storageConfig.localPath,
            s3Bucket: saved.storage.s3Bucket || this.storageConfig.s3Bucket,
            s3Region: saved.storage.s3Region || this.storageConfig.s3Region,
            s3Endpoint: saved.storage.s3Endpoint || this.storageConfig.s3Endpoint,
          };
          this.engineConfig = {
            ...this.engineConfig,
            headless: saved.engine.headless,
            sessionDataPath: saved.engine.sessionDataPath || this.engineConfig.sessionDataPath,
            browserArgs: saved.engine.browserArgs || this.engineConfig.browserArgs,
          };
        }
      })
      .finally(() => this.loading.set(false));

    this.api.infra.getEngines().then(e => this.engines.set(e)).catch(() => {});
    // The active engine reflects what's actually running (honours a real-env ENGINE_TYPE override).
    this.api.infra
      .getCurrentEngine()
      .then(res => {
        this.currentEngine.set(res.engineType);
        if (res.engineType) this.engineConfig = { ...this.engineConfig, type: res.engineType };
      })
      .catch(() => {});
  }

  onRedisEnabledChange(enabled: boolean): void {
    this.redisEnabled = enabled;
    if (!enabled) this.queueEnabled = false;
  }

  // A setting whose RUNNING value (/status) differs from the SAVED file (/config) is being pinned
  // by a host/.env environment variable, which wins at runtime — surface that honestly.
  dbPinnedByEnv(): boolean {
    const status = this.infraStatus();
    const saved = this.savedConfig();
    return !this.savePending() && !!status && !!saved && status.database.type !== saved.database.type;
  }

  redisPinnedByEnv(): boolean {
    const status = this.infraStatus();
    const saved = this.savedConfig();
    return !this.savePending() && !!status && !!saved && status.redis.enabled !== saved.redis.enabled;
  }

  storagePinnedByEnv(): boolean {
    const status = this.infraStatus();
    const saved = this.savedConfig();
    return !this.savePending() && !!status && !!saved && status.storage.type !== saved.storage.type;
  }

  s3Unreachable(): boolean {
    return this.storageConfig.type === 's3' && this.infraStatus()?.storage.s3Available === false;
  }

  storageIndicatorClass(): string {
    return this.storageConfig.type !== 's3' ? 'sqlite' : this.s3Unreachable() ? 'disconnected' : 'connected';
  }

  storageIndicatorLabel(): string {
    if (this.storageConfig.type !== 's3') return 'Local';
    return this.s3Unreachable() ? this.lang.t('infrastructure.storage.s3Unreachable') : 'S3';
  }

  redisIndicatorLabel(): string {
    if (!this.redisEnabled) return this.lang.t('infrastructure.statusLabels.disabled');
    return this.redisConfig.connected
      ? this.lang.t('infrastructure.statusLabels.connected')
      : this.lang.t('infrastructure.statusLabels.disconnected');
  }

  engineLibraryLabel(engine: Engine): string {
    return engine.library ? `${engine.library.name} ${engine.library.version}` : this.lang.t('infrastructure.engine.builtIn');
  }

  restartProgressWidth(): string {
    const countdown = this.restartCountdown();
    return countdown > 0 ? `${((30 - countdown) / 30) * 100}%` : '100%';
  }

  async handleSaveConfig(): Promise<void> {
    this.saving.set(true);
    try {
      const payload = {
        database: { ...this.dbConfig },
        redis: { enabled: this.redisEnabled, ...this.redisConfig },
        queue: { enabled: this.queueEnabled },
        storage: { ...this.storageConfig },
        engine: { ...this.engineConfig },
      };

      const result = await this.api.infra.saveConfig(payload);
      if (result.saved) {
        this.savePending.set(true);
        this.previousProfiles = this.pendingProfiles;
        this.pendingProfiles = result.profiles || [];

        const status = this.infraStatus();
        const saved = this.savedConfig();
        // Flag a backend switch vs what's running: type change; built-in↔external flip; or an
        // external Postgres retargeted to a different host/port/database (also an empty DB).
        const dbExternalRetarget =
          this.dbConfig.type === 'postgres' &&
          !this.dbConfig.builtIn &&
          !!saved &&
          (this.dbConfig.host !== saved.database.host ||
            this.dbConfig.port !== saved.database.port ||
            this.dbConfig.database !== saved.database.database);
        this.dbSwitch.set(
          !!status &&
            (this.dbConfig.type !== status.database.type ||
              (this.dbConfig.type === 'postgres' && this.dbConfig.builtIn !== status.database.builtIn) ||
              dbExternalRetarget),
        );
        this.storageSwitch.set(
          !!status &&
            (this.storageConfig.type !== status.storage.type ||
              (this.storageConfig.type === 's3' && this.storageConfig.builtIn !== status.storage.builtIn)),
        );
        this.restartStatus.set('idle');
        this.showRestartModal.set(true);
      } else {
        this.toast.error(this.lang.t('infrastructure.toasts.saveFailed'), result.message);
      }
    } catch (err) {
      this.toast.error(
        this.lang.t('infrastructure.toasts.saveFailed'),
        err instanceof Error ? err.message : this.lang.t('common.unknownError'),
      );
    } finally {
      this.saving.set(false);
    }
  }

  // Download a JSON backup of all Data-DB tables (call BEFORE a DB switch, on the old database).
  async handleExportBackup(): Promise<void> {
    this.migrating.set(true);
    try {
      const dump = await this.api.infra.exportData();
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `openwa-backup-${dump.exportedAt?.slice(0, 10) || 'data'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      this.toast.error(
        this.lang.t('infrastructure.migration.exportFailed'),
        err instanceof Error ? err.message : this.lang.t('common.unknownError'),
      );
    } finally {
      this.migrating.set(false);
    }
  }

  onImportFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void this.handleImportBackup(file);
    input.value = '';
  }

  // Restore a previously-exported backup into the CURRENT database (use after switching + restart).
  // Import REPLACES all current data, so validate + confirm (showing the row count) first.
  private async handleImportBackup(file: File): Promise<void> {
    let parsed: { tables?: Record<string, unknown[]> };
    try {
      parsed = JSON.parse(await file.text()) as { tables?: Record<string, unknown[]> };
    } catch {
      this.toast.error(this.lang.t('infrastructure.migration.importFailed'), this.lang.t('infrastructure.migration.invalidFile'));
      return;
    }
    if (!parsed?.tables || typeof parsed.tables !== 'object') {
      this.toast.error(this.lang.t('infrastructure.migration.importFailed'), this.lang.t('infrastructure.migration.invalidFile'));
      return;
    }
    const rows = Object.values(parsed.tables).reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0);
    if (!window.confirm(this.lang.t('infrastructure.migration.importConfirm', { rows }))) return;
    this.migrating.set(true);
    try {
      const res = await this.api.infra.importData(parsed.tables);
      if (res.imported) this.toast.success(this.lang.t('infrastructure.migration.importOk'));
      else
        this.toast.error(
          this.lang.t('infrastructure.migration.importFailed'),
          (res.warnings || []).slice(0, 3).join('; ') || res.message,
        );
    } catch (err) {
      // A large backup can exceed the request body cap (default 25mb) — give an actionable message.
      const status = (err as { status?: number } | null)?.status;
      const detail =
        status === 413
          ? this.lang.t('infrastructure.migration.importTooLarge')
          : err instanceof Error
            ? err.message
            : this.lang.t('common.unknownError');
      this.toast.error(this.lang.t('infrastructure.migration.importFailed'), detail);
    } finally {
      this.migrating.set(false);
    }
  }

  async handleRestart(): Promise<void> {
    this.restartStatus.set('restarting');
    this.restartCountdown.set(30);

    const profilesToRemove = this.previousProfiles.filter(p => !this.pendingProfiles.includes(p));

    try {
      const response = await this.api.infra.restart(this.pendingProfiles, profilesToRemove);
      if (response.estimatedTime) this.restartCountdown.set(response.estimatedTime);
    } catch {
      // Expected — server shutting down.
    }

    this.restartStatus.set('waiting');
    let intervalRef: ReturnType<typeof setInterval> | null = setInterval(() => {
      this.restartCountdown.update(prev => {
        if (prev <= 1) {
          if (intervalRef) {
            clearInterval(intervalRef);
            intervalRef = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const stopCountdown = () => {
      if (intervalRef) {
        clearInterval(intervalRef);
        intervalRef = null;
      }
    };

    // Poll the health endpoint until the server is back, then reload.
    let attempts = 0;
    const maxAttempts = 60;
    const check = async () => {
      try {
        await this.api.infra.healthCheck();
        stopCountdown();
        this.restartCountdown.set(0);
        this.restartStatus.set('success');
        setTimeout(() => window.location.reload(), 2000);
      } catch {
        attempts++;
        if (attempts < maxAttempts) setTimeout(() => void check(), 1000);
        else this.restartStatus.set('error');
      }
    };
    setTimeout(() => void check(), 3000);
  }

  copyBullMqUrl(): void {
    // The BullBoard route requires an ADMIN JWT in the Authorization header — a plain browser tab
    // can't send one, so copy the URL for use with an authenticated client / reverse proxy.
    const base = API_BASE_URL.startsWith('http') ? API_BASE_URL : `${window.location.origin}${API_BASE_URL}`;
    void copyToClipboard(`${base}/admin/queues`).then(ok => {
      if (ok) {
        this.toast.success(
          this.lang.t('infrastructure.redis.bullMqUrlCopied'),
          this.lang.t('infrastructure.redis.bullMqUrlHint'),
        );
      }
    });
  }

  reloadPage(): void {
    window.location.reload();
  }
}
