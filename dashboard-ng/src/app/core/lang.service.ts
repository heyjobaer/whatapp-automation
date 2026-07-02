import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import en from '../../i18n/locales/en.json';
import es from '../../i18n/locales/es.json';
import he from '../../i18n/locales/he.json';
import zhCN from '../../i18n/locales/zh-CN.json';
import zhHK from '../../i18n/locales/zh-HK.json';
import ar from '../../i18n/locales/ar.json';
import te from '../../i18n/locales/te.json';
import fr from '../../i18n/locales/fr.json';
import it from '../../i18n/locales/it.json';
import ptBR from '../../i18n/locales/pt-BR.json';

export const supportedLanguages = ['en', 'es', 'he', 'zh-CN', 'zh-HK', 'ar', 'te', 'fr', 'it', 'pt-BR'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export const rtlLanguages: SupportedLanguage[] = ['he', 'ar'];

export const languageOptions: Array<{ value: SupportedLanguage; label: string; compactLabel: string }> = [
  { value: 'en', label: 'English', compactLabel: 'EN' },
  { value: 'es', label: 'Español', compactLabel: 'ES' },
  { value: 'he', label: 'עברית', compactLabel: 'עברית' },
  { value: 'zh-CN', label: '简体中文', compactLabel: '简中' },
  { value: 'zh-HK', label: '繁體中文', compactLabel: '繁中' },
  { value: 'ar', label: 'العربية', compactLabel: 'AR' },
  { value: 'te', label: 'తెలుగు', compactLabel: 'TE' },
  { value: 'fr', label: 'Français', compactLabel: 'FR' },
  { value: 'it', label: 'Italiano', compactLabel: 'IT' },
  { value: 'pt-BR', label: 'Português (Brasil)', compactLabel: 'PT' },
];

const LANGUAGE_STORAGE_KEY = 'openwa_language';

export function resolveSupportedLanguage(lang?: string): SupportedLanguage {
  const value = lang || 'en';
  const exact = supportedLanguages.find(supported => supported.toLowerCase() === value.toLowerCase());
  if (exact) return exact;

  const parts = value.toLowerCase().split('-');
  const base = parts[0];
  if (base === 'zh') {
    const subtags = new Set(parts.slice(1));
    if (subtags.has('hant') || subtags.has('hk') || subtags.has('mo') || subtags.has('tw')) return 'zh-HK';
    return 'zh-CN';
  }

  return supportedLanguages.find(supported => supported === base) ?? 'en';
}

/**
 * Language state on top of ngx-translate (port of the i18next setup): statically bundled locale
 * JSONs, localStorage → navigator detection, and RTL/dir handling on <html>.
 */
@Injectable({ providedIn: 'root' })
export class LangService {
  private readonly translate = inject(TranslateService);

  readonly languageOptions = languageOptions;
  readonly rtlLanguages = rtlLanguages;

  private readonly _current = signal<SupportedLanguage>('en');
  readonly current = this._current.asReadonly();

  init(): void {
    this.translate.setTranslation('en', en);
    this.translate.setTranslation('es', es);
    this.translate.setTranslation('he', he);
    this.translate.setTranslation('zh-CN', zhCN);
    this.translate.setTranslation('zh-HK', zhHK);
    this.translate.setTranslation('ar', ar);
    this.translate.setTranslation('te', te);
    this.translate.setTranslation('fr', fr);
    this.translate.setTranslation('it', it);
    this.translate.setTranslation('pt-BR', ptBR);
    this.translate.setFallbackLang('en');

    // Detection order: localStorage, then browser languages (mirrors i18next-browser-languagedetector).
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const detected = stored || navigator.languages?.[0] || navigator.language;
    this.changeLanguage(resolveSupportedLanguage(detected));
  }

  changeLanguage(language: SupportedLanguage): void {
    this.translate.use(language);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    this._current.set(language);
    const dir = rtlLanguages.includes(language) ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
  }

  isRtl(): boolean {
    return rtlLanguages.includes(this._current());
  }

  /**
   * Synchronous translation for TS code (templates use the `translate` pipe). `defaultValue`
   * mirrors i18next's t(key, { defaultValue }) for lookups like dynamic status keys.
   */
  t(key: string, params?: Record<string, unknown> & { defaultValue?: string }): string {
    const { defaultValue, ...interpolate } = params ?? {};
    const result = this.translate.instant(key, interpolate) as string;
    if (result === key && defaultValue !== undefined) return defaultValue;
    return result;
  }
}
