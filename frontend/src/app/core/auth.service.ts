import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { API_BASE_URL, TOKEN_STORAGE_KEY } from './api.service';
import type { UserRole, LoginResponse, User } from './api.types';

const USER_STORAGE_KEY = 'openwa_user';

/**
 * Email + password (JWT) auth + role state.
 * The token and the authenticated user (incl. role) both live in localStorage so the session
 * persists across tabs and reloads (a new tab stays logged in).
 * Roles: SUPER_ADMIN > ADMIN > READONLY.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _user$ = new BehaviorSubject<LoginResponse['user'] | null>(this.readStoredUser());
  private readonly _isAuthenticated$ = new BehaviorSubject<boolean>(!!localStorage.getItem(TOKEN_STORAGE_KEY));

  readonly user$: Observable<LoginResponse['user'] | null> = this._user$.asObservable();
  readonly role$: Observable<UserRole | null> = this._user$.pipe(map(user => user?.role ?? null));
  readonly isAuthenticated$: Observable<boolean> = this._isAuthenticated$.asObservable();
  readonly isSuperAdmin$: Observable<boolean> = this._user$.pipe(map(user => user?.role === 'SUPER_ADMIN'));
  readonly isAdmin$: Observable<boolean> = this._user$.pipe(
    map(user => user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'),
  );
  // READONLY can only read; ADMIN and SUPER_ADMIN can write.
  readonly canWrite$: Observable<boolean> = this.isAdmin$;

  /** Synchronous snapshots — used by route guards and imperative checks. */
  get user(): LoginResponse['user'] | null {
    return this._user$.value;
  }
  get role(): UserRole | null {
    return this._user$.value?.role ?? null;
  }
  isAuthenticated(): boolean {
    return this._isAuthenticated$.value;
  }
  isSuperAdmin(): boolean {
    return this._user$.value?.role === 'SUPER_ADMIN';
  }
  isAdmin(): boolean {
    return this._user$.value?.role === 'SUPER_ADMIN' || this._user$.value?.role === 'ADMIN';
  }
  canWrite(): boolean {
    return this.isAdmin();
  }

  /** Authenticate with email + password; on success store the JWT + user and resolve the role. */
  async login(email: string, password: string): Promise<{ ok: boolean; message?: string }> {
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      return { ok: false, message: 'connection' };
    }
    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { message?: string };
      return { ok: false, message: errorData.message };
    }
    const data = (await response.json()) as LoginResponse;
    localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
    this.setUser(data.user);
    this._isAuthenticated$.next(true);
    return { ok: true };
  }

  /** Refresh the stored user (role/name) from the backend on app start. Keeps state on failure. */
  async revalidate(): Promise<void> {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return;
      const me = (await response.json()) as User;
      this.setUser({ id: me.id, email: me.email, name: me.name, role: me.role });
    } catch {
      // Keep the existing stored user if the refresh fails.
    }
  }

  logout(): void {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    this.setUser(null);
    this._isAuthenticated$.next(false);
  }

  private setUser(user: LoginResponse['user'] | null): void {
    this._user$.next(user);
    if (user) {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_STORAGE_KEY);
    }
  }

  private readStoredUser(): LoginResponse['user'] | null {
    try {
      const raw = localStorage.getItem(USER_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as LoginResponse['user']) : null;
    } catch {
      return null;
    }
  }
}
