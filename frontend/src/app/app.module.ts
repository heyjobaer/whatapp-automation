import { APP_INITIALIZER, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { provideBrowserGlobalErrorListeners } from '@angular/core';
import { providePrimeNG } from 'primeng/config';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { provideTranslateService } from '@ngx-translate/core';
import { LucideAngularModule } from 'lucide-angular';
import Aura from '@primeuix/themes/aura';

import { APP_ICONS } from './core/icons';
import { AppRoutingModule } from './app-routing.module';
import { App } from './app';
import { LayoutComponent } from './layout/layout.component';
import { SharedModule } from './shared/shared.module';
import { LangService } from './core/lang.service';
import { AuthService } from './core/auth.service';
import { ThemeService } from './core/theme.service';

/**
 * App bootstrap: initialise language, instantiate the theme service so data-theme/data-palette are
 * applied pre-render, and re-validate any stored auth key in the background (mirrors React App.tsx).
 */
export function appInitializerFactory(lang: LangService, _theme: ThemeService, auth: AuthService): () => void {
  return () => {
    lang.init();
    // Injecting ThemeService above already ran its constructor side effects.
    void auth.revalidate();
  };
}

@NgModule({
  declarations: [App, LayoutComponent],
  imports: [
    BrowserModule,
    AppRoutingModule,
    SharedModule,
    ToastModule,
    LucideAngularModule.pick(APP_ICONS),
  ],
  providers: [
    provideBrowserGlobalErrorListeners(),
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          // ThemeService always resolves 'system' to an explicit attribute, so this selector is
          // the single dark-mode source of truth for PrimeNG and the custom CSS variables alike.
          darkModeSelector: '[data-theme="dark"]',
        },
      },
    }),
    MessageService,
    provideTranslateService(),
    {
      provide: APP_INITIALIZER,
      useFactory: appInitializerFactory,
      deps: [LangService, ThemeService, AuthService],
      multi: true,
    },
  ],
  bootstrap: [App],
})
export class AppModule {}
