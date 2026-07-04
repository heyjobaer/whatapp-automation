import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { updatePrimaryPalette } from '@primeuix/themes';

export type Theme = 'light' | 'dark' | 'system';
export type ThemePalette = 'openwa' | 'blue' | 'graphite' | 'indigo' | 'amber' | 'rose' | 'teal';

const THEME_KEY = 'openwa_theme';
const PALETTE_KEY = 'openwa_palette';

export const paletteOptions: Array<{ value: ThemePalette; label: string; color: string }> = [
  { value: 'openwa', label: 'OpenWA', color: '#25d366' },
  { value: 'blue', label: 'Blue', color: '#2563eb' },
  { value: 'graphite', label: 'Graphite', color: '#64748b' },
  { value: 'indigo', label: 'Indigo', color: '#4f46e5' },
  { value: 'amber', label: 'Amber', color: '#d97706' },
  { value: 'rose', label: 'Rose', color: '#e11d48' },
  { value: 'teal', label: 'Teal', color: '#0d9488' },
];

// PrimeNG primary color per dashboard palette, referencing the preset's built-in color ramps so
// PrimeNG widgets follow the selected palette alongside the CSS-variable driven custom styles.
const PRIME_PALETTE: Record<ThemePalette, string> = {
  openwa: 'green',
  blue: 'blue',
  graphite: 'slate',
  indigo: 'indigo',
  amber: 'amber',
  rose: 'rose',
  teal: 'teal',
};

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

function isPalette(value: string | null): value is ThemePalette {
  return paletteOptions.some(option => option.value === value);
}

/**
 * Theme + palette state (port of useTheme). 'system' resolves to an explicit data-theme attribute
 * (tracked live via matchMedia) so both the custom CSS variables and PrimeNG's darkModeSelector
 * follow one source of truth.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly paletteOptions = paletteOptions;

  private readonly _theme$ = new BehaviorSubject<Theme>(
    isTheme(localStorage.getItem(THEME_KEY)) ? (localStorage.getItem(THEME_KEY) as Theme) : 'system',
  );
  private readonly _palette$ = new BehaviorSubject<ThemePalette>(
    isPalette(localStorage.getItem(PALETTE_KEY)) ? (localStorage.getItem(PALETTE_KEY) as ThemePalette) : 'openwa',
  );
  private readonly _systemDark$ = new BehaviorSubject<boolean>(
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  readonly theme$: Observable<Theme> = this._theme$.asObservable();
  readonly palette$: Observable<ThemePalette> = this._palette$.asObservable();

  constructor() {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      this._systemDark$.next(e.matches);
    });

    // Apply the theme attribute whenever the theme choice or the system preference changes.
    this._theme$.subscribe(theme => this.applyTheme(theme, this._systemDark$.value));
    this._systemDark$.subscribe(systemDark => this.applyTheme(this._theme$.value, systemDark));

    // Apply the palette (CSS variables + PrimeNG ramp) whenever it changes.
    this._palette$.subscribe(palette => this.applyPalette(palette));
  }

  private applyTheme(theme: Theme, systemDark: boolean): void {
    localStorage.setItem(THEME_KEY, theme);
    const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
    document.documentElement.setAttribute('data-theme', resolved);
  }

  private applyPalette(palette: ThemePalette): void {
    localStorage.setItem(PALETTE_KEY, palette);
    document.documentElement.setAttribute('data-palette', palette);
    const ramp = PRIME_PALETTE[palette];
    updatePrimaryPalette({
      50: `{${ramp}.50}`,
      100: `{${ramp}.100}`,
      200: `{${ramp}.200}`,
      300: `{${ramp}.300}`,
      400: `{${ramp}.400}`,
      500: `{${ramp}.500}`,
      600: `{${ramp}.600}`,
      700: `{${ramp}.700}`,
      800: `{${ramp}.800}`,
      900: `{${ramp}.900}`,
      950: `{${ramp}.950}`,
    });
  }

  /** Synchronous snapshots for template/imperative reads. */
  get theme(): Theme {
    return this._theme$.value;
  }
  get palette(): ThemePalette {
    return this._palette$.value;
  }

  resolvedTheme(): 'light' | 'dark' {
    return this._theme$.value === 'system'
      ? this._systemDark$.value
        ? 'dark'
        : 'light'
      : (this._theme$.value as 'light' | 'dark');
  }

  setTheme(theme: Theme): void {
    this._theme$.next(theme);
  }

  setPalette(palette: ThemePalette): void {
    this._palette$.next(palette);
  }
}
