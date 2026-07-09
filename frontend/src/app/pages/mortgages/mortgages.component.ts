import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { BehaviorSubject, Subject, combineLatest, defer } from 'rxjs';
import { debounceTime, distinctUntilChanged, skip, takeUntil } from 'rxjs/operators';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import type { MortgageProduct, MortgageProductPayload } from '../../core/api.types';

const PAGE_SIZE = 100;

const EMPTY_FORM: MortgageProductPayload = {
  lender: '',
  productName: '',
  category: 'residential',
  rateType: 'fixed',
  initialRate: 0,
  initialPeriodMonths: 24,
  followOnRate: null,
  maxLtvPercent: 90,
  maxTermYears: 40,
  productFee: 0,
  repaymentType: 'repayment',
  ercApplies: true,
  status: 'available',
  description: '',
};

@Component({
  selector: 'app-mortgages',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mortgages.component.html',
  styleUrl: './mortgages.component.css',
})
export class MortgagesComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  readonly categories = ['residential', 'first-time-buyer', 'home-mover', 'remortgage', 'buy-to-let'];
  readonly rateTypes = ['fixed', 'tracker', 'discount', 'variable'];
  readonly repaymentTypes = ['repayment', 'interest-only'];
  readonly statuses: Array<{ label: string; value: string }> = [
    { label: 'Available', value: 'available' },
    { label: 'Withdrawn', value: 'withdrawn' },
  ];

  readonly products$ = new BehaviorSubject<MortgageProduct[]>([]);
  readonly total$ = new BehaviorSubject(0);
  readonly loading$ = new BehaviorSubject(true);
  readonly loadError$ = new BehaviorSubject(false);
  readonly searchTerm$ = new BehaviorSubject('');
  readonly offset$ = new BehaviorSubject(0);

  readonly showDialog$ = new BehaviorSubject(false);
  readonly editingId$ = new BehaviorSubject<string | null>(null);
  readonly saving$ = new BehaviorSubject(false);
  readonly formError$ = new BehaviorSubject('');
  readonly deleteTarget$ = new BehaviorSubject<MortgageProduct | null>(null);

  // Two-way bound form for the add/edit dialog.
  form: MortgageProductPayload = { ...EMPTY_FORM };

  readonly pageSize = PAGE_SIZE;

  readonly vm$ = defer(() =>
    combineLatest({
      products: this.products$,
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
    this.titleService.setTitle('Mortgages');
    void this.reload();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async reload(): Promise<void> {
    this.loading$.next(true);
    try {
      const res = await this.api.mortgages.list({
        limit: PAGE_SIZE,
        offset: this.offset$.value,
        search: this.searchTerm$.value.trim() || undefined,
      });
      this.products$.next(res.data);
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
    return Math.min(this.offset$.value + this.products$.value.length, this.total$.value);
  }

  statusClass(status: string): string {
    return status === 'available' ? 'available' : 'sold';
  }

  /** "5yr" / "24mo" label for a product's initial period. */
  periodLabel(months: number): string {
    if (!months) return '—';
    return months % 12 === 0 ? `${months / 12}yr` : `${months}mo`;
  }

  openNew(): void {
    this.form = { ...EMPTY_FORM };
    this.editingId$.next(null);
    this.formError$.next('');
    this.showDialog$.next(true);
  }

  openEdit(p: MortgageProduct): void {
    this.form = {
      lender: p.lender,
      productName: p.productName,
      category: p.category,
      rateType: p.rateType,
      initialRate: p.initialRate,
      initialPeriodMonths: p.initialPeriodMonths,
      followOnRate: p.followOnRate ?? null,
      maxLtvPercent: p.maxLtvPercent,
      maxTermYears: p.maxTermYears,
      productFee: p.productFee,
      repaymentType: p.repaymentType,
      ercApplies: p.ercApplies,
      status: p.status,
      description: p.description ?? '',
    };
    this.editingId$.next(p.id);
    this.formError$.next('');
    this.showDialog$.next(true);
  }

  closeDialog(): void {
    this.showDialog$.next(false);
  }

  setDeleteTarget(p: MortgageProduct | null): void {
    this.deleteTarget$.next(p);
  }

  async save(): Promise<void> {
    if (!this.form.lender.trim() || !this.form.productName.trim() || this.form.initialRate == null) {
      this.formError$.next('Lender, product name and rate are required.');
      return;
    }
    this.saving$.next(true);
    this.formError$.next('');
    try {
      const editingId = this.editingId$.value;
      if (editingId) {
        await this.api.mortgages.update(editingId, this.form);
        this.toast.success('Saved', 'Mortgage product updated successfully.');
      } else {
        await this.api.mortgages.create(this.form);
        this.toast.success('Saved', 'Mortgage product added successfully.');
      }
      this.showDialog$.next(false);
      void this.reload();
    } catch (err) {
      this.formError$.next(err instanceof Error ? err.message : 'Could not save mortgage product.');
    } finally {
      this.saving$.next(false);
    }
  }

  async handleDelete(): Promise<void> {
    const target = this.deleteTarget$.value;
    if (!target) return;
    this.deleteTarget$.next(null);
    try {
      await this.api.mortgages.delete(target.id);
      this.toast.success('Deleted', 'Mortgage product removed.');
      // If the last row on the final page was removed, step back a page.
      if (this.products$.value.length === 1 && this.offset$.value > 0) {
        this.offset$.next(Math.max(0, this.offset$.value - PAGE_SIZE));
      }
      void this.reload();
    } catch (err) {
      this.toast.error('Error', err instanceof Error ? err.message : 'Could not delete mortgage product.');
    }
  }
}
