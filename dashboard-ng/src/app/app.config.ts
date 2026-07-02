import {
  ApplicationConfig,
  importProvidersFrom,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { APP_ICONS } from './core/icons';
import { provideRouter } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import { MessageService } from 'primeng/api';
import { provideTranslateService } from '@ngx-translate/core';
import Aura from '@primeuix/themes/aura';

import { routes } from './app.routes';
import { LangService } from './core/lang.service';
import { AuthService } from './core/auth.service';
import { ThemeService } from './core/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
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
    importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
    provideTranslateService(),
    provideAppInitializer(() => {
      inject(LangService).init();
      // Instantiate the theme service at boot so data-theme/data-palette are applied pre-render.
      inject(ThemeService);
      // Re-validate a stored key in the background to refresh the role (mirrors React App.tsx).
      void inject(AuthService).revalidate();
    }),
  ],
};
