import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';

import { AuthService } from '../../core/auth.service';
import { LangService, type SupportedLanguage } from '../../core/lang.service';
import { APP_VERSION } from '../../core/version';

@Component({
  selector: 'app-login',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  readonly appVersion = APP_VERSION;
  readonly buildDate = new Date().toLocaleDateString();

  email = '';
  password = '';
  readonly showPassword$ = new BehaviorSubject(false);
  readonly isLoading$ = new BehaviorSubject(false);
  readonly error$ = new BehaviorSubject('');

  readonly vm$: Observable<{ showPassword: boolean; isLoading: boolean; error: string; langCurrent: SupportedLanguage }>;

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    readonly lang: LangService,
  ) {
    this.vm$ = combineLatest({
      showPassword: this.showPassword$,
      isLoading: this.isLoading$,
      error: this.error$,
      langCurrent: this.lang.current$,
    });
  }

  toggleShowPassword(): void {
    this.showPassword$.next(!this.showPassword$.value);
  }

  changeLanguage(value: string): void {
    this.lang.changeLanguage(value as SupportedLanguage);
  }

  async handleSubmit(): Promise<void> {
    if (!this.email.trim() || !this.password) {
      this.error$.next(this.lang.t('login.credentialsRequired'));
      return;
    }
    this.isLoading$.next(true);
    this.error$.next('');

    try {
      const result = await this.auth.login(this.email.trim(), this.password);
      if (result.ok) {
        void this.router.navigate(['/']);
      } else if (result.message === 'connection') {
        this.error$.next(this.lang.t('login.connectionError'));
      } else {
        this.error$.next(result.message || this.lang.t('login.invalidCredentials'));
      }
    } catch {
      this.error$.next(this.lang.t('login.connectionError'));
    } finally {
      this.isLoading$.next(false);
    }
  }
}
