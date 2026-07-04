import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { BehaviorSubject, combineLatest } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import type { AiSettingsUpdate, AiSettingsView } from '../../core/api.types';

@Component({
  selector: 'app-ai-settings',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ai-settings.component.html',
  styleUrl: './ai-settings.component.css',
})
export class AiSettingsComponent implements OnInit {
  private readonly loading$ = new BehaviorSubject(true);
  private readonly saving$ = new BehaviorSubject(false);
  private readonly loadError$ = new BehaviorSubject(false);
  private readonly settings$ = new BehaviorSubject<AiSettingsView | null>(null);

  readonly vm$ = combineLatest({
    loading: this.loading$,
    saving: this.saving$,
    loadError: this.loadError$,
    settings: this.settings$,
  });

  // Two-way bound form fields.
  autoReplyEnabled = true;
  provider = 'groq';
  model = '';
  apiKey = ''; // blank = keep existing
  replyDelayMinMs = 20000;
  replyDelayMaxMs = 30000;
  agencyName = '';
  systemPrompt = '';

  constructor(
    private readonly api: ApiService,
    private readonly toast: ToastService,
    private readonly titleService: Title,
  ) {}

  ngOnInit(): void {
    this.titleService.setTitle('AI Settings · OpenWA');
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading$.next(true);
    try {
      const s = await this.api.aiSettings.get();
      this.applyToForm(s);
      this.settings$.next(s);
      this.loadError$.next(false);
    } catch {
      this.loadError$.next(true);
    } finally {
      this.loading$.next(false);
    }
  }

  private applyToForm(s: AiSettingsView): void {
    this.autoReplyEnabled = s.autoReplyEnabled;
    this.provider = s.provider;
    this.model = s.model;
    this.replyDelayMinMs = s.replyDelayMinMs;
    this.replyDelayMaxMs = s.replyDelayMaxMs;
    this.agencyName = s.agencyName ?? '';
    this.systemPrompt = s.systemPrompt ?? '';
    this.apiKey = ''; // never prefill the key; the preview is shown as a placeholder
  }

  async save(): Promise<void> {
    if (this.replyDelayMaxMs < this.replyDelayMinMs) {
      this.toast.warning('Check delays', 'Max delay must be greater than or equal to min delay.');
      return;
    }
    this.saving$.next(true);
    const payload: AiSettingsUpdate = {
      autoReplyEnabled: this.autoReplyEnabled,
      provider: this.provider.trim() || 'groq',
      model: this.model.trim(),
      replyDelayMinMs: Number(this.replyDelayMinMs) || 0,
      replyDelayMaxMs: Number(this.replyDelayMaxMs) || 0,
      agencyName: this.agencyName.trim() || null,
      systemPrompt: this.systemPrompt.trim() || null,
    };
    // Only send the API key when the admin typed a new one.
    if (this.apiKey.trim()) payload.apiKey = this.apiKey.trim();

    try {
      const s = await this.api.aiSettings.update(payload);
      this.applyToForm(s);
      this.settings$.next(s);
      this.toast.success('Saved', 'AI settings updated.');
    } catch (err) {
      this.toast.error('Error', err instanceof Error ? err.message : 'Could not save AI settings.');
    } finally {
      this.saving$.next(false);
    }
  }
}
