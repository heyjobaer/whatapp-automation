import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { BehaviorSubject, Subject, combineLatest, defer } from 'rxjs';
import { debounceTime, distinctUntilChanged, skip, takeUntil } from 'rxjs/operators';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import type { Property, PropertyPayload, PropertyStatus } from '../../core/api.types';

const PAGE_SIZE = 100;

const EMPTY_FORM: PropertyPayload = {
  name: '',
  area: '',
  type: 'Apartment',
  bedrooms: 1,
  priceUsd: 0,
  priceAed: 0,
  roiPercent: 0,
  status: 'available',
  isOffplan: false,
  developer: '',
  description: '',
  handoverDate: '',
  brochureUrl: '',
};

@Component({
  selector: 'app-properties',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './properties.component.html',
  styleUrl: './properties.component.css',
})
export class PropertiesComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  readonly types = ['Apartment', 'Villa', 'Penthouse', 'Townhouse'];
  readonly statuses: Array<{ label: string; value: PropertyStatus }> = [
    { label: 'Available', value: 'available' },
    { label: 'Reserved', value: 'reserved' },
    { label: 'Sold', value: 'sold' },
  ];

  readonly properties$ = new BehaviorSubject<Property[]>([]);
  readonly total$ = new BehaviorSubject(0);
  readonly loading$ = new BehaviorSubject(true);
  readonly loadError$ = new BehaviorSubject(false);
  readonly searchTerm$ = new BehaviorSubject('');
  readonly offset$ = new BehaviorSubject(0);

  readonly showDialog$ = new BehaviorSubject(false);
  readonly editingId$ = new BehaviorSubject<string | null>(null);
  readonly saving$ = new BehaviorSubject(false);
  readonly formError$ = new BehaviorSubject('');
  readonly deleteTarget$ = new BehaviorSubject<Property | null>(null);

  // Two-way bound form for the add/edit dialog.
  form: PropertyPayload = { ...EMPTY_FORM };

  readonly pageSize = PAGE_SIZE;

  readonly vm$ = defer(() =>
    combineLatest({
      properties: this.properties$,
      total: this.total$,
      loading: this.loading$,
      loadError: this.loadError$,
      searchTerm: this.searchTerm$,
      offset: this.offset$,
      showDialog: this.showDialog$,
      editingId: this.editingId$,
      saving: this.saving$,
      formError: this.formError$,
      deleteTarget: this.deleteTarget$,
      canWrite: this.auth.canWrite$,
    }),
  );

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
    private readonly toast: ToastService,
    private readonly titleService: Title,
  ) {
    // Reload from the first page whenever the (debounced) search term changes.
    this.searchTerm$
      .pipe(skip(1), debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.offset$.next(0);
        void this.reload();
      });
  }

  ngOnInit(): void {
    this.titleService.setTitle('Properties');
    void this.reload();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async reload(): Promise<void> {
    this.loading$.next(true);
    try {
      const res = await this.api.properties.list({
        limit: PAGE_SIZE,
        offset: this.offset$.value,
        search: this.searchTerm$.value.trim() || undefined,
      });
      this.properties$.next(res.data);
      this.total$.next(res.total);
      this.loadError$.next(false);
    } catch {
      this.loadError$.next(true);
    } finally {
      this.loading$.next(false);
    }
  }

  setSearch(value: string): void {
    this.searchTerm$.next(value);
  }

  nextPage(): void {
    if (this.offset$.value + PAGE_SIZE >= this.total$.value) return;
    this.offset$.next(this.offset$.value + PAGE_SIZE);
    void this.reload();
  }

  prevPage(): void {
    if (this.offset$.value === 0) return;
    this.offset$.next(Math.max(0, this.offset$.value - PAGE_SIZE));
    void this.reload();
  }

  rangeEnd(): number {
    return Math.min(this.offset$.value + this.properties$.value.length, this.total$.value);
  }

  statusClass(status: string): string {
    return status === 'available' ? 'available' : status === 'reserved' ? 'reserved' : 'sold';
  }

  openNew(): void {
    this.form = { ...EMPTY_FORM };
    this.editingId$.next(null);
    this.formError$.next('');
    this.showDialog$.next(true);
  }

  openEdit(p: Property): void {
    this.form = {
      name: p.name,
      area: p.area,
      type: p.type,
      bedrooms: p.bedrooms,
      priceUsd: p.priceUsd,
      priceAed: p.priceAed,
      roiPercent: p.roiPercent,
      status: p.status,
      isOffplan: p.isOffplan,
      developer: p.developer ?? '',
      description: p.description ?? '',
      handoverDate: p.handoverDate ?? '',
      brochureUrl: p.brochureUrl ?? '',
    };
    this.editingId$.next(p.id);
    this.formError$.next('');
    this.showDialog$.next(true);
  }

  closeDialog(): void {
    this.showDialog$.next(false);
  }

  setDeleteTarget(p: Property | null): void {
    this.deleteTarget$.next(p);
  }

  async save(): Promise<void> {
    if (!this.form.name.trim() || !this.form.area.trim() || !this.form.priceUsd) {
      this.formError$.next('Name, area and USD price are required.');
      return;
    }
    this.saving$.next(true);
    this.formError$.next('');
    try {
      const editingId = this.editingId$.value;
      if (editingId) {
        await this.api.properties.update(editingId, this.form);
        this.toast.success('Saved', 'Property updated successfully.');
      } else {
        await this.api.properties.create(this.form);
        this.toast.success('Saved', 'Property added successfully.');
      }
      this.showDialog$.next(false);
      void this.reload();
    } catch (err) {
      this.formError$.next(err instanceof Error ? err.message : 'Could not save property.');
    } finally {
      this.saving$.next(false);
    }
  }

  async handleDelete(): Promise<void> {
    const target = this.deleteTarget$.value;
    if (!target) return;
    this.deleteTarget$.next(null);
    try {
      await this.api.properties.delete(target.id);
      this.toast.success('Deleted', 'Property removed.');
      // If the last row on the final page was removed, step back a page.
      if (this.properties$.value.length === 1 && this.offset$.value > 0) {
        this.offset$.next(Math.max(0, this.offset$.value - PAGE_SIZE));
      }
      void this.reload();
    } catch (err) {
      this.toast.error('Error', err instanceof Error ? err.message : 'Could not delete property.');
    }
  }
}
