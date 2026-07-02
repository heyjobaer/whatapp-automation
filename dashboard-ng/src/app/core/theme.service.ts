import { Injectable, effect, signal } from '@angular/core';
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

  private readonly _theme = signal<Theme>(isTheme(localStorage.getItem(THEME_KEY)) ? (localStorage.getItem(THEME_KEY) as Theme) : 'system');
  private readonly _palette = signal<ThemePalette>(
    isPalette(localStorage.getItem(PALETTE_KEY)) ? (localStorage.getItem(PALETTE_KEY) as ThemePalette) : 'openwa',
  );
  private readonly systemDark = signal(window.matchMedia('(prefers-color-scheme: dark)').matches);

  readonly theme = this._theme.asReadonly();
  readonly palette = this._palette.asReadonly();

  constructor() {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      this.systemDark.set(e.matches);
    });

    effect(() => {
      const theme = this._theme();
      localStorage.setItem(THEME_KEY, theme);
      const resolved = theme === 'system' ? (this.systemDark() ? 'dark' : 'light') : theme;
      document.documentElement.setAttribute('data-theme', resolved);
    });

    effect(() => {
      const palette = this._palette();
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
    });
  }

  resolvedTheme(): 'light' | 'dark' {
    return this._theme() === 'system' ? (this.systemDark() ? 'dark' : 'light') : (this._theme() as 'light' | 'dark');
  }

  setTheme(theme: Theme): void {
    this._theme.set(theme);
  }

  setPalette(palette: ThemePalette): void {
    this._palette.set(palette);
  }
}
