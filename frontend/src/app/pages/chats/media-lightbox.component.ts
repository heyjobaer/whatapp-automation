import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

export interface LightboxItem {
  id: string;
  url: string;
  alt?: string;
  senderName?: string;
  timestamp?: string;
}

interface LightboxViewModel {
  items: LightboxItem[];
  index: number | null;
  current: LightboxItem | null;
}

/**
 * Minimal image lightbox (replaces the React-only yet-another-react-lightbox):
 * backdrop close, prev/next, counter, caption, download, Escape/arrow keys.
 */
@Component({
  selector: 'app-media-lightbox',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (vm$ | async; as vm) {
      @if (vm.index !== null && vm.items.length > 0) {
        <div class="lightbox-backdrop" (click)="close.emit()">
          <div class="lightbox-counter">{{ vm.index! + 1 }} / {{ vm.items.length }}</div>
          <button class="lightbox-btn lightbox-close" (click)="close.emit()" aria-label="Close">
            <lucide-icon name="x" [size]="22" />
          </button>
          <a
            class="lightbox-btn lightbox-download"
            [href]="vm.current?.url"
            [download]="vm.current?.alt || 'image-' + vm.current?.id + '.jpg'"
            (click)="$event.stopPropagation()"
            aria-label="Download"
          >
            <lucide-icon name="download" [size]="20" />
          </a>
          @if (vm.index! > 0) {
            <button class="lightbox-btn lightbox-prev" (click)="go(-1); $event.stopPropagation()" aria-label="Previous">
              <lucide-icon name="chevron-left" [size]="28" />
            </button>
          }
          @if (vm.index! < vm.items.length - 1) {
            <button class="lightbox-btn lightbox-next" (click)="go(1); $event.stopPropagation()" aria-label="Next">
              <lucide-icon name="chevron-right" [size]="28" />
            </button>
          }
          <img class="lightbox-image" [src]="vm.current?.url" [alt]="vm.current?.alt || ''" (click)="$event.stopPropagation()" />
          @if (vm.current?.timestamp) {
            <div class="lightbox-caption">{{ vm.current?.timestamp }}</div>
          }
        </div>
      }
    }
  `,
  styles: `
    .lightbox-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.92);
      z-index: 2000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .lightbox-image {
      max-width: 92vw;
      max-height: 88vh;
      object-fit: contain;
      border-radius: 6px;
    }
    .lightbox-btn {
      position: absolute;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border: none;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.12);
      color: rgba(255, 255, 255, 0.9);
      cursor: pointer;
    }
    .lightbox-btn:hover {
      background: rgba(255, 255, 255, 0.25);
    }
    .lightbox-close { top: 16px; right: 16px; }
    .lightbox-download { top: 16px; right: 72px; }
    .lightbox-prev { left: 16px; top: 50%; transform: translateY(-50%); }
    .lightbox-next { right: 16px; top: 50%; transform: translateY(-50%); }
    .lightbox-counter {
      position: absolute;
      top: 24px;
      left: 24px;
      color: rgba(255, 255, 255, 0.85);
      font-size: 0.9rem;
    }
    .lightbox-caption {
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      color: rgba(255, 255, 255, 0.85);
      font-size: 0.85rem;
    }
  `,
})
export class MediaLightboxComponent {
  private readonly items$ = new BehaviorSubject<LightboxItem[]>([]);
  private readonly index$ = new BehaviorSubject<number | null>(null);

  @Input() set items(items: LightboxItem[] | null | undefined) {
    this.items$.next(items ?? []);
  }
  @Input() set index(index: number | null | undefined) {
    this.index$.next(index ?? null);
  }
  @Output() readonly close = new EventEmitter<void>();
  @Output() readonly navigate = new EventEmitter<number>();

  readonly vm$: Observable<LightboxViewModel> = combineLatest({
    items: this.items$,
    index: this.index$,
    current: combineLatest([this.items$, this.index$]).pipe(
      map(([items, index]): LightboxItem | null => (index === null ? null : (items[index] ?? null))),
    ),
  });

  go(delta: number): void {
    const i = this.index$.value;
    if (i === null) return;
    const next = Math.min(Math.max(i + delta, 0), this.items$.value.length - 1);
    if (next !== i) this.navigate.emit(next);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (this.index$.value === null) return;
    if (event.key === 'Escape') this.close.emit();
    else if (event.key === 'ArrowLeft') this.go(-1);
    else if (event.key === 'ArrowRight') this.go(1);
  }
}
