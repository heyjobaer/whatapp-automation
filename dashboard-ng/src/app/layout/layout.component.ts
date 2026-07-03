import { ChangeDetectionStrategy, Component, ElementRef, HostListener, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideAngularModule } from 'lucide-angular';

import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { LangService, type SupportedLanguage } from '../core/lang.service';
import { ThemeService, type Theme } from '../core/theme.service';
import { APP_VERSION } from '../core/version';

const ALL_NAV_ITEMS = [
  { to: '/', icon: 'layout-dashboard', key: 'dashboard', adminOnly: false, superAdminOnly: false },
  { to: '/sessions', icon: 'smartphone', key: 'sessions', adminOnly: false, superAdminOnly: false },
  { to: '/chats', icon: 'message-square', key: 'chats', adminOnly: false, superAdminOnly: false },
  { to: '/webhooks', icon: 'webhook', key: 'webhooks', adminOnly: false, superAdminOnly: false },
  { to: '/templates', icon: 'clipboard-list', key: 'templates', adminOnly: false, superAdminOnly: false },
  // User & role management is SUPER_ADMIN-only.
  { to: '/users', icon: 'users', key: 'users', adminOnly: false, superAdminOnly: true },
  { to: '/message-tester', icon: 'send', key: 'messageTester', adminOnly: false, superAdminOnly: false },
  // Backend /infra/* is ADMIN-only; hide the nav item from non-admins (UX + defense-in-depth).
  { to: '/infrastructure', icon: 'server', key: 'infrastructure', adminOnly: true, superAdminOnly: false },
  // Plugins section disabled (kept out of the port; core plugin loader still runs the WA engines).
  { to: '/logs', icon: 'file-text', key: 'logs', adminOnly: false, superAdminOnly: false },
] as const;

const THEME_MODES: Theme[] = ['light', 'dark', 'system'];
const THEME_ICONS: Record<Theme, string> = { light: 'sun', dark: 'moon', system: 'monitor' };

@Component({
  selector: 'app-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, LucideAngularModule],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css',
})
export class LayoutComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);
  readonly lang = inject(LangService);
  readonly theme = inject(ThemeService);

  readonly themeModes = THEME_MODES;
  readonly themeIcons = THEME_ICONS;

  readonly isCollapsed = signal(false);
  readonly isMobile = signal(window.innerWidth < 768);
  readonly isMobileOpen = signal(false);
  readonly isLanguageMenuOpen = signal(false);
  readonly isAppearanceMenuOpen = signal(false);
  // Show the build-time version immediately, then replace it with the live running version from the
  // backend so a stale-built bundle can't display the wrong number. Falls back silently on error.
  readonly version = signal(APP_VERSION);

  readonly navItems = computed(() =>
    ALL_NAV_ITEMS.filter(
      item => (!item.adminOnly || this.auth.isAdmin()) && (!item.superAdminOnly || this.auth.isSuperAdmin()),
    ),
  );
  readonly activePalette = computed(
    () => this.theme.paletteOptions.find(option => option.value === this.theme.palette()) ?? this.theme.paletteOptions[0],
  );
  readonly languageLabel = computed(
    () => this.lang.languageOptions.find(option => option.value === this.lang.current())?.compactLabel ?? 'EN',
  );
  readonly isRtl = computed(() => this.lang.rtlLanguages.includes(this.lang.current()));

  private readonly languageMenuRef = viewChild<ElementRef<HTMLElement>>('languageMenu');
  private readonly appearanceMenuRef = viewChild<ElementRef<HTMLElement>>('appearanceMenu');

  ngOnInit(): void {
    this.api.health
      .check()
      .then(info => {
        if (info?.version) this.version.set(info.version);
      })
      .catch(() => {
        /* keep the build-time fallback */
      });
  }

  @HostListener('window:resize')
  onResize(): void {
    const mobile = window.innerWidth < 768;
    this.isMobile.set(mobile);
    if (!mobile) this.setMobileOpen(false);
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent): void {
    const target = event.target as Node;
    if (this.isLanguageMenuOpen() && !this.languageMenuRef()?.nativeElement.contains(target)) {
      this.isLanguageMenuOpen.set(false);
    }
    if (this.isAppearanceMenuOpen() && !this.appearanceMenuRef()?.nativeElement.contains(target)) {
      this.isAppearanceMenuOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.isLanguageMenuOpen.set(false);
    this.isAppearanceMenuOpen.set(false);
  }

  toggleCollapse(): void {
    this.isCollapsed.update(v => !v);
  }

  toggleMobile(): void {
    this.setMobileOpen(!this.isMobileOpen());
  }

  setMobileOpen(open: boolean): void {
    this.isMobileOpen.set(open);
    document.body.style.overflow = open ? 'hidden' : '';
  }

  handleNavClick(): void {
    if (this.isMobile()) this.setMobileOpen(false);
  }

  changeLanguage(language: SupportedLanguage): void {
    this.isLanguageMenuOpen.set(false);
    this.lang.changeLanguage(language);
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
