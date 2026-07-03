import { Injectable, computed, signal } from '@angular/core';
import { API_BASE_URL, TOKEN_STORAGE_KEY } from './api.service';
import type { UserRole, LoginResponse, User } from './api.types';

const USER_STORAGE_KEY = 'openwa_user';

/**
 * Email + password (JWT) auth + role state.
 * The token lives in sessionStorage (per-tab); the authenticated user (incl. role) in localStorage.
 * Roles: SUPER_ADMIN > ADMIN > READONLY.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _user = signal<LoginResponse['user'] | null>(this.readStoredUser());
  private readonly _isAuthenticated = signal<boolean>(!!sessionStorage.getItem(TOKEN_STORAGE_KEY));

  readonly user = this._user.asReadonly();
  readonly role = computed<UserRole | null>(() => this._user()?.role ?? null);
  readonly isAuthenticated = this._isAuthenticated.asReadonly();
  readonly isSuperAdmin = computed(() => this._user()?.role === 'SUPER_ADMIN');
  readonly isAdmin = computed(() => this._user()?.role === 'SUPER_ADMIN' || this._user()?.role === 'ADMIN');
  // READONLY can only read; ADMIN and SUPER_ADMIN can write.
  readonly canWrite = this.isAdmin;

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
    sessionStorage.setItem(TOKEN_STORAGE_KEY, data.token);
    this.setUser(data.user);
    this._isAuthenticated.set(true);
    return { ok: true };
  }

  /** Refresh the stored user (role/name) from the backend on app start. Keeps state on failure. */
  async revalidate(): Promise<void> {
    const token = sessionStorage.getItem(TOKEN_STORAGE_KEY);
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
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    this.setUser(null);
    this._isAuthenticated.set(false);
  }

  private setUser(user: LoginResponse['user'] | null): void {
    this._user.set(user);
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
