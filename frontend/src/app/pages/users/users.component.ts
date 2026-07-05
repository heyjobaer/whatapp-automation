import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { BehaviorSubject, combineLatest } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import type { User, UserRole } from '../../core/api.types';

const ROLE_NAMES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'READONLY'];

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Full access, including user & role management.',
  ADMIN: 'Read and write access to all WhatsApp features.',
  READONLY: 'Read-only access — cannot make changes.',
};

@Component({
  selector: 'app-users',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './users.component.html',
  styleUrl: './users.component.css',
})
export class UsersComponent implements OnInit {
  readonly roleNames = ROLE_NAMES;
  readonly roleDescriptions = ROLE_DESCRIPTIONS;

  readonly users$ = new BehaviorSubject<User[]>([]);
  readonly loading$ = new BehaviorSubject(true);
  readonly loadError$ = new BehaviorSubject(false);
  readonly formError$ = new BehaviorSubject('');

  readonly showModal$ = new BehaviorSubject(false);
  newEmail = '';
  newName = '';
  newPassword = '';
  newRole: UserRole = 'READONLY';
  readonly creating$ = new BehaviorSubject(false);

  readonly confirmDelete$ = new BehaviorSubject<{ id: string; email: string } | null>(null);

  readonly vm$ = combineLatest({
    users: this.users$,
    loading: this.loading$,
    loadError: this.loadError$,
    formError: this.formError$,
    showModal: this.showModal$,
    creating: this.creating$,
    confirmDelete: this.confirmDelete$,
  });

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
    private readonly titleService: Title,
  ) {}

  ngOnInit(): void {
    this.titleService.setTitle('Users');
    void this.reload();
  }

  private async reload(): Promise<void> {
    this.loading$.next(true);
    try {
      this.users$.next(await this.api.users.list());
      this.loadError$.next(false);
    } catch {
      this.loadError$.next(true);
    } finally {
      this.loading$.next(false);
    }
  }

  /** The signed-in user's own id — used to prevent deleting your own account from the UI. */
  get currentUserId(): string | undefined {
    return this.auth.user?.id;
  }

  setConfirmDelete(target: { id: string; email: string } | null): void {
    this.confirmDelete$.next(target);
  }

  openModal(): void {
    this.newEmail = '';
    this.newName = '';
    this.newPassword = '';
    this.newRole = 'READONLY';
    this.formError$.next('');
    this.showModal$.next(true);
  }

  closeModal(): void {
    this.showModal$.next(false);
  }

  async handleCreate(): Promise<void> {
    if (!this.newEmail.trim() || !this.newName.trim() || this.newPassword.length < 8) {
      this.formError$.next('Email, name, and a password of at least 8 characters are required.');
      return;
    }
    this.creating$.next(true);
    this.formError$.next('');
    try {
      await this.api.users.create({
        email: this.newEmail.trim(),
        name: this.newName.trim(),
        password: this.newPassword,
        role: this.newRole,
      });
      this.showModal$.next(false);
      void this.reload();
    } catch (err) {
      this.formError$.next(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      this.creating$.next(false);
    }
  }

  async toggleActive(user: User): Promise<void> {
    try {
      await this.api.users.update(user.id, { isActive: !user.isActive });
      void this.reload();
    } catch (err) {
      console.error('Failed to update user:', err);
    }
  }

  async confirmAndDelete(): Promise<void> {
    const target = this.confirmDelete$.value;
    if (!target) return;
    this.confirmDelete$.next(null);
    try {
      await this.api.users.delete(target.id);
      void this.reload();
    } catch (err) {
      console.error('Failed to delete user:', err);
    }
  }

  formatDate(date?: string | null): string {
    return date ? new Date(date).toLocaleDateString() : 'Never';
  }
}
