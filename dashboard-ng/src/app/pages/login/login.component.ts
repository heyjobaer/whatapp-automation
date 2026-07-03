import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../../core/auth.service';
import { LangService, type SupportedLanguage } from '../../core/lang.service';
import { GithubIconComponent } from '../../shared/github-icon.component';
import { APP_VERSION } from '../../core/version';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, LucideAngularModule, GithubIconComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly lang = inject(LangService);

  readonly appVersion = APP_VERSION;
  readonly buildDate = new Date().toLocaleDateString();

  email = '';
  password = '';
  readonly showPassword = signal(false);
  readonly isLoading = signal(false);
  readonly error = signal('');

  changeLanguage(value: string): void {
    this.lang.changeLanguage(value as SupportedLanguage);
  }

  async handleSubmit(): Promise<void> {
    if (!this.email.trim() || !this.password) {
      this.error.set(this.lang.t('login.credentialsRequired'));
      return;
    }
    this.isLoading.set(true);
    this.error.set('');

    try {
      const result = await this.auth.login(this.email.trim(), this.password);
      if (result.ok) {
        void this.router.navigate(['/']);
      } else if (result.message === 'connection') {
        this.error.set(this.lang.t('login.connectionError'));
      } else {
        this.error.set(result.message || this.lang.t('login.invalidCredentials'));
      }
    } catch {
      this.error.set(this.lang.t('login.connectionError'));
    } finally {
      this.isLoading.set(false);
    }
  }
}
