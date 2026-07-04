import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { LangService, rtlLanguages, type SupportedLanguage } from '../core/lang.service';
import { ThemeService, type Theme, type ThemePalette } from '../core/theme.service';
import { APP_VERSION } from '../core/version';

const ALL_NAV_ITEMS = [
  { to: '/', icon: 'layout-dashboard', key: 'dashboard', adminOnly: false, superAdminOnly: false },
  { to: '/sessions', icon: 'smartphone', key: 'sessions', adminOnly: false, superAdminOnly: false },
  { to: '/chats', icon: 'message-square', key: 'chats', adminOnly: false, superAdminOnly: false },
  { to: '/properties', icon: 'building-2', key: 'properties', adminOnly: false, superAdminOnly: false },
  // Temporarily disabled (kept in code, removed from the nav):
  // { to: '/webhooks', icon: 'webhook', key: 'webhooks', adminOnly: false, superAdminOnly: false },
  // { to: '/templates', icon: 'clipboard-list', key: 'templates', adminOnly: false, superAdminOnly: false },
  // User & role management is SUPER_ADMIN-only.
  { to: '/users', icon: 'users', key: 'users', adminOnly: false, superAdminOnly: true },
  // Temporarily disabled (kept in code, removed from the nav):
  // { to: '/message-tester', icon: 'send', key: 'messageTester', adminOnly: false, superAdminOnly: false },
  // Backend /infra/* is ADMIN-only; hide the nav item from non-admins (UX + defense-in-depth).
  // Temporarily disabled (kept in code, removed from the nav):
  // { to: '/infrastructure', icon: 'server', key: 'infrastructure', adminOnly: true, superAdminOnly: false },
  // Plugins section disabled (kept out of the port; core plugin loader still runs the WA engines).
  { to: '/logs', icon: 'file-text', key: 'logs', adminOnly: false, superAdminOnly: false },
] as const;

const THEME_MODES: Theme[] = ['light', 'dark', 'system'];
const THEME_ICONS: Record<Theme, string> = { light: 'sun', dark: 'moon', system: 'monitor' };

@Component({
  selector: 'app-layout',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css',
})
export class LayoutComponent implements OnInit {
  readonly themeModes = THEME_MODES;
  readonly themeIcons = THEME_ICONS;

  readonly isCollapsed$ = new BehaviorSubject(false);
  readonly isMobile$ = new BehaviorSubject(window.innerWidth < 768);
  readonly isMobileOpen$ = new BehaviorSubject(false);
  readonly isLanguageMenuOpen$ = new BehaviorSubject(false);
  readonly isAppearanceMenuOpen$ = new BehaviorSubject(false);
  // Show the build-time version immediately, then replace it with the live running version from the
  // backend so a stale-built bundle can't display the wrong number. Falls back silently on error.
  readonly version$ = new BehaviorSubject(APP_VERSION);

  readonly vm$: Observable<{
    isMobile: boolean;
    isMobileOpen: boolean;
    isCollapsed: boolean;
    version: string;
    isLanguageMenuOpen: boolean;
    isAppearanceMenuOpen: boolean;
    navItems: ReadonlyArray<(typeof ALL_NAV_ITEMS)[number]>;
    activePalette: ThemeService['paletteOptions'][number];
    languageLabel: string;
    isRtl: boolean;
    theme: Theme;
    palette: ThemePalette;
    langCurrent: SupportedLanguage;
  }>;

  @ViewChild('languageMenu') private languageMenuRef?: ElementRef<HTMLElement>;
  @ViewChild('appearanceMenu') private appearanceMenuRef?: ElementRef<HTMLElement>;

  constructor(
    private readonly api: ApiService,
    private readonly router: Router,
    readonly auth: AuthService,
    readonly lang: LangService,
    readonly theme: ThemeService,
  ) {
    const navItems$ = combineLatest([this.auth.isAdmin$, this.auth.isSuperAdmin$]).pipe(
      map(([isAdmin, isSuperAdmin]) =>
        ALL_NAV_ITEMS.filter(item => (!item.adminOnly || isAdmin) && (!item.superAdminOnly || isSuperAdmin)),
      ),
    );
    const activePalette$ = this.theme.palette$.pipe(
      map(palette => this.theme.paletteOptions.find(option => option.value === palette) ?? this.theme.paletteOptions[0]),
    );
    const languageLabel$ = this.lang.current$.pipe(
      map(current => this.lang.languageOptions.find(option => option.value === current)?.compactLabel ?? 'EN'),
    );
    const isRtl$ = this.lang.current$.pipe(map(current => rtlLanguages.includes(current)));

    this.vm$ = combineLatest({
      isMobile: this.isMobile$,
      isMobileOpen: this.isMobileOpen$,
      isCollapsed: this.isCollapsed$,
      version: this.version$,
      isLanguageMenuOpen: this.isLanguageMenuOpen$,
      isAppearanceMenuOpen: this.isAppearanceMenuOpen$,
      navItems: navItems$,
      activePalette: activePalette$,
      languageLabel: languageLabel$,
      isRtl: isRtl$,
      theme: this.theme.theme$,
      palette: this.theme.palette$,
      langCurrent: this.lang.current$,
    });
  }

  ngOnInit(): void {
    this.api.health
      .check()
      .then(info => {
        if (info?.version) this.version$.next(info.version);
      })
      .catch(() => {
        /* keep the build-time fallback */
      });
  }

  @HostListener('window:resize')
  onResize(): void {
    const mobile = window.innerWidth < 768;
    this.isMobile$.next(mobile);
    if (!mobile) this.setMobileOpen(false);
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent): void {
    const target = event.target as Node;
    if (this.isLanguageMenuOpen$.value && !this.languageMenuRef?.nativeElement.contains(target)) {
      this.isLanguageMenuOpen$.next(false);
    }
    if (this.isAppearanceMenuOpen$.value && !this.appearanceMenuRef?.nativeElement.contains(target)) {
      this.isAppearanceMenuOpen$.next(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.isLanguageMenuOpen$.next(false);
    this.isAppearanceMenuOpen$.next(false);
  }

  toggleCollapse(): void {
    this.isCollapsed$.next(!this.isCollapsed$.value);
  }

  toggleMobile(): void {
    this.setMobileOpen(!this.isMobileOpen$.value);
  }

  setMobileOpen(open: boolean): void {
    this.isMobileOpen$.next(open);
    document.body.style.overflow = open ? 'hidden' : '';
  }

  toggleLanguageMenu(): void {
    this.isLanguageMenuOpen$.next(!this.isLanguageMenuOpen$.value);
  }

  toggleAppearanceMenu(): void {
    this.isAppearanceMenuOpen$.next(!this.isAppearanceMenuOpen$.value);
  }

  handleNavClick(): void {
    if (this.isMobile$.value) this.setMobileOpen(false);
  }

  changeLanguage(language: SupportedLanguage): void {
    this.isLanguageMenuOpen$.next(false);
    this.lang.changeLanguage(language);
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
