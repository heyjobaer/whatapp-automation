import { Injectable, computed, signal } from '@angular/core';
import { API_BASE_URL, API_KEY_STORAGE_KEY } from './api.service';

export type UserRole = 'admin' | 'operator' | 'viewer';

const ROLE_STORAGE_KEY = 'openwa_user_role';

/**
 * API-key auth + role state (port of the React App.tsx auth flow + useRole context).
 * The key lives in sessionStorage (per-tab), the role in localStorage — same as the original.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _role = signal<UserRole | null>((localStorage.getItem(ROLE_STORAGE_KEY) as UserRole) || null);
  private readonly _isAuthenticated = signal<boolean>(!!sessionStorage.getItem(API_KEY_STORAGE_KEY));

  readonly role = this._role.asReadonly();
  readonly isAuthenticated = this._isAuthenticated.asReadonly();
  readonly isAdmin = computed(() => this._role() === 'admin');
  readonly canWrite = computed(() => this._role() === 'admin' || this._role() === 'operator');

  /** Validate the key against the backend; on success store it and resolve the role. */
  async login(apiKey: string): Promise<{ ok: boolean; message?: string }> {
    const response = await fetch(`${API_BASE_URL}/auth/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    });
    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { message?: string };
      return { ok: false, message: errorData.message };
    }
    sessionStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
    const data = (await response.json().catch(() => ({}))) as { role?: UserRole };
    this.setRole(data.role ?? 'viewer');
    this._isAuthenticated.set(true);
    return { ok: true };
  }

  /** Re-validate a stored key on app start to refresh the role (keeps existing role on failure). */
  async revalidate(): Promise<void> {
    const apiKey = sessionStorage.getItem(API_KEY_STORAGE_KEY);
    if (!apiKey) return;
    try {
      const response = await fetch(`${API_BASE_URL}/auth/validate`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey },
      });
      const data = (await response.json()) as { valid?: boolean; role?: UserRole };
      if (data.valid && data.role) this.setRole(data.role);
    } catch {
      // Keep the existing role from localStorage if validation fails.
    }
  }

  logout(): void {
    sessionStorage.removeItem(API_KEY_STORAGE_KEY);
    this.setRole(null);
    this._isAuthenticated.set(false);
  }

  private setRole(role: UserRole | null): void {
    this._role.set(role);
    if (role) {
      localStorage.setItem(ROLE_STORAGE_KEY, role);
    } else {
      localStorage.removeItem(ROLE_STORAGE_KEY);
    }
  }
}
