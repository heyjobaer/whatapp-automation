import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { LucideAngularModule } from 'lucide-angular';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { PageHeaderComponent } from '../../shared/page-header.component';
import type { User, UserRole } from '../../core/api.types';

const ROLE_NAMES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'READONLY'];

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Full access, including user & role management.',
  ADMIN: 'Read and write access to all WhatsApp features.',
  READONLY: 'Read-only access — cannot make changes.',
};

@Component({
  selector: 'app-users',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, PageHeaderComponent],
  templateUrl: './users.component.html',
  styleUrl: './users.component.css',
})
export class UsersComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly titleService = inject(Title);

  readonly roleNames = ROLE_NAMES;
  readonly roleDescriptions = ROLE_DESCRIPTIONS;

  readonly users = signal<User[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly formError = signal('');

  readonly showModal = signal(false);
  newEmail = '';
  newName = '';
  newPassword = '';
  newRole: UserRole = 'READONLY';
  readonly creating = signal(false);

  readonly confirmDelete = signal<{ id: string; email: string } | null>(null);

  ngOnInit(): void {
    this.titleService.setTitle('Users · OpenWA');
    void this.reload();
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    try {
      this.users.set(await this.api.users.list());
      this.loadError.set(false);
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** The signed-in user's own id — used to prevent deleting your own account from the UI. */
  get currentUserId(): string | undefined {
    return this.auth.user()?.id;
  }

  openModal(): void {
    this.newEmail = '';
    this.newName = '';
    this.newPassword = '';
    this.newRole = 'READONLY';
    this.formError.set('');
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
  }

  async handleCreate(): Promise<void> {
    if (!this.newEmail.trim() || !this.newName.trim() || this.newPassword.length < 8) {
      this.formError.set('Email, name, and a password of at least 8 characters are required.');
      return;
    }
    this.creating.set(true);
    this.formError.set('');
    try {
      await this.api.users.create({
        email: this.newEmail.trim(),
        name: this.newName.trim(),
        password: this.newPassword,
        role: this.newRole,
      });
      this.showModal.set(false);
      void this.reload();
    } catch (err) {
      this.formError.set(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      this.creating.set(false);
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
    const target = this.confirmDelete();
    if (!target) return;
    this.confirmDelete.set(null);
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
