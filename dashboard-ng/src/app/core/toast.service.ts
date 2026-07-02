import { Injectable, inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import { LangService } from './lang.service';

/**
 * Toast facade over PrimeNG's MessageService (port of the React ToastProvider API):
 * success/error/warning/info(title, message?) with connection-lost de-duplication.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly messages = inject(MessageService);
  private readonly lang = inject(LangService);
  private connectionLostShown = false;

  success(title: string, message?: string): void {
    this.messages.add({ severity: 'success', summary: title, detail: message, life: 4000 });
  }

  error(title: string, message?: string): void {
    const isConnectionError =
      message?.toLowerCase().includes('failed to fetch') ||
      message?.toLowerCase().includes('networkerror') ||
      message?.toLowerCase().includes('http 502') ||
      message?.toLowerCase().includes('http 503') ||
      title.toLowerCase().includes('failed to fetch') ||
      title.toLowerCase().includes('networkerror');

    if (isConnectionError) {
      // De-dupe on a stable flag (not the translated title) so a downed backend shows one toast.
      if (this.connectionLostShown) return;
      this.connectionLostShown = true;
      this.messages.add({
        severity: 'error',
        summary: this.lang.t('toast.connectionLost.title'),
        detail: this.lang.t('toast.connectionLost.message'),
        life: 6000,
      });
      setTimeout(() => (this.connectionLostShown = false), 6000);
      return;
    }
    this.messages.add({ severity: 'error', summary: title, detail: message, life: 6000 });
  }

  warning(title: string, message?: string): void {
    this.messages.add({ severity: 'warn', summary: title, detail: message, life: 4000 });
  }

  info(title: string, message?: string): void {
    this.messages.add({ severity: 'info', summary: title, detail: message, life: 4000 });
  }
}
