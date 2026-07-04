import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import { LangService } from '../core/lang.service';
import type { Chat, WebhookFilterCondition, WebhookFilterOperator, WebhookFilters } from '../core/api.types';

type FieldKind = 'id' | 'idArray' | 'text' | 'enum' | 'boolean';

interface FieldDescriptor {
  field: string;
  kind: FieldKind;
  operators: WebhookFilterOperator[];
  enumValues?: string[];
}

const MESSAGE_TYPES = [
  'text',
  'image',
  'video',
  'audio',
  'voice',
  'document',
  'sticker',
  'location',
  'contact',
  'call',
  'revoked',
  'unknown',
];

// Mirrors the backend message-family field registry (src/modules/webhook/filters/filter-types.ts).
const MESSAGE_FIELDS: FieldDescriptor[] = [
  { field: 'sender', kind: 'id', operators: ['is', 'isNot'] },
  { field: 'recipient', kind: 'id', operators: ['is', 'isNot'] },
  { field: 'body', kind: 'text', operators: ['contains', 'equals'] },
  { field: 'type', kind: 'enum', operators: ['is', 'isNot'], enumValues: MESSAGE_TYPES },
  { field: 'isGroup', kind: 'boolean', operators: ['is'] },
  { field: 'fromMe', kind: 'boolean', operators: ['is'] },
  { field: 'hasMedia', kind: 'boolean', operators: ['is'] },
  { field: 'mentions', kind: 'idArray', operators: ['is', 'isNot'] },
];

const descriptorFor = (field: string): FieldDescriptor => MESSAGE_FIELDS.find(f => f.field === field) ?? MESSAGE_FIELDS[0];

function defaultValueFor(kind: FieldKind): WebhookFilterCondition['value'] {
  if (kind === 'boolean') return true;
  if (kind === 'text') return '';
  return [];
}

/** Accepts a full JID or a phone number; normalizes bare numbers to `<digits>@c.us`. */
export function normalizeToJid(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.includes('@')) return value.toLowerCase();
  const digits = value.replace(/[^0-9]/g, '');
  return digits ? `${digits}@c.us` : null;
}

interface ChipsViewModel {
  value: string[];
  text: string;
  open: boolean;
  suggestions: Chat[];
  typedJid: string | null;
}

@Component({
  selector: 'app-contact-chips-input',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './filter-builder.component.css',
  template: `
    @if (vm$ | async; as vm) {
      <div class="chips-input">
        <div class="chips-row">
          @for (jid of vm.value; track jid) {
            <span class="chip" [title]="jid">
              {{ labelFor(jid) }}
              <button type="button" class="chip-remove" (click)="remove(jid)">
                <lucide-icon name="x" [size]="12" />
              </button>
            </span>
          }
          <input
            class="chips-text"
            [ngModel]="vm.text"
            (ngModelChange)="text$.next($event)"
            [placeholder]="'webhooks.filters.contactPlaceholder' | translate"
            (focus)="open$.next(true)"
            (blur)="closeSoon()"
            (keydown.enter)="$event.preventDefault(); addTyped()"
            (keydown.backspace)="onBackspace()"
          />
        </div>
        @if (vm.open && (vm.suggestions.length > 0 || vm.text.trim())) {
          <div class="chips-suggestions">
            @for (c of vm.suggestions; track c.id) {
              <button type="button" class="chips-suggestion" (mousedown)="$event.preventDefault()" (click)="add(c.id)">
                <span class="chips-suggestion-name">{{ c.name || c.id }}</span>
                <span class="chips-suggestion-id">{{ c.id }}</span>
              </button>
            }
            @if (vm.text.trim() && vm.typedJid) {
              <button
                type="button"
                class="chips-suggestion chips-suggestion-add"
                (mousedown)="$event.preventDefault()"
                (click)="addTyped()"
              >
                {{ 'webhooks.filters.addValue' | translate: { value: vm.typedJid } }}
              </button>
            }
          </div>
        }
      </div>
    }
  `,
})
export class ContactChipsInputComponent {
  private readonly value$ = new BehaviorSubject<string[]>([]);
  private readonly chats$ = new BehaviorSubject<Chat[]>([]);

  @Input() set value(value: string[] | null | undefined) {
    this.value$.next(value ?? []);
  }
  @Input() set chats(chats: Chat[] | null | undefined) {
    this.chats$.next(chats ?? []);
  }
  @Output() readonly valueChange = new EventEmitter<string[]>();

  readonly text$ = new BehaviorSubject('');
  readonly open$ = new BehaviorSubject(false);

  private readonly suggestions$: Observable<Chat[]> = combineLatest([this.text$, this.value$, this.chats$]).pipe(
    map(([text, value, chats]) => {
      const query = text.trim().toLowerCase();
      const chosen = new Set(value);
      return chats
        .filter(c => !chosen.has(c.id))
        .filter(c => !query || c.name.toLowerCase().includes(query) || c.id.toLowerCase().includes(query))
        .slice(0, 8);
    }),
  );

  private readonly typedJid$: Observable<string | null> = this.text$.pipe(map(text => normalizeToJid(text)));

  readonly vm$: Observable<ChipsViewModel> = combineLatest({
    value: this.value$,
    text: this.text$,
    open: this.open$,
    suggestions: this.suggestions$,
    typedJid: this.typedJid$,
  });

  labelFor(jid: string): string {
    return this.chats$.value.find(c => c.id === jid)?.name ?? jid;
  }

  add(jid: string): void {
    if (jid && !this.value$.value.includes(jid)) this.valueChange.emit([...this.value$.value, jid]);
    this.text$.next('');
  }

  addTyped(): void {
    const jid = normalizeToJid(this.text$.value);
    if (jid) this.add(jid);
  }

  remove(jid: string): void {
    this.valueChange.emit(this.value$.value.filter(v => v !== jid));
  }

  onBackspace(): void {
    if (!this.text$.value && this.value$.value.length) this.valueChange.emit(this.value$.value.slice(0, -1));
  }

  closeSoon(): void {
    setTimeout(() => this.open$.next(false), 120);
  }
}

@Component({
  selector: 'app-filter-builder',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './filter-builder.component.css',
  template: `
    @if (vm$ | async; as vm) {
      <div class="filter-builder">
        <div class="filter-builder-head">
          <span class="filter-builder-title">{{ 'webhooks.filters.title' | translate }}</span>
          <span class="filter-builder-hint">{{ 'webhooks.filters.hint' | translate }}</span>
        </div>

        @for (condition of vm.conditions; track $index; let index = $index) {
          <div class="filter-row">
            <select class="filter-field" [ngModel]="condition.field" (ngModelChange)="changeField(index, $event)">
              @for (f of messageFields; track f.field) {
                <option [value]="f.field">{{ 'webhooks.filters.fields.' + f.field | translate }}</option>
              }
            </select>

            <select
              class="filter-operator"
              [ngModel]="condition.operator"
              (ngModelChange)="updateAt(index, { operator: $event })"
            >
              @for (op of descriptorFor(condition.field).operators; track op) {
                <option [value]="op">{{ 'webhooks.filters.operators.' + op | translate }}</option>
              }
            </select>

            <div class="filter-value">
              @switch (descriptorFor(condition.field).kind) {
                @case ('id') {
                  <app-contact-chips-input
                    [value]="asArray(condition.value)"
                    [chats]="vm.chats"
                    (valueChange)="updateAt(index, { value: $event })"
                  />
                }
                @case ('idArray') {
                  <app-contact-chips-input
                    [value]="asArray(condition.value)"
                    [chats]="vm.chats"
                    (valueChange)="updateAt(index, { value: $event })"
                  />
                }
                @case ('enum') {
                  <div class="filter-enum">
                    @for (option of descriptorFor(condition.field).enumValues; track option) {
                      <button
                        type="button"
                        class="enum-tag"
                        [class.selected]="asArray(condition.value).includes(option)"
                        (click)="toggleEnum(index, condition, option)"
                      >
                        {{ option }}
                      </button>
                    }
                  </div>
                }
                @case ('text') {
                  <div class="filter-text">
                    <input
                      type="text"
                      [ngModel]="asString(condition.value)"
                      [placeholder]="'webhooks.filters.textPlaceholder' | translate"
                      (ngModelChange)="updateAt(index, { value: $event })"
                    />
                    <label class="filter-case">
                      <input
                        type="checkbox"
                        [ngModel]="condition.caseSensitive ?? false"
                        (ngModelChange)="updateAt(index, { caseSensitive: $event || undefined })"
                      />
                      {{ 'webhooks.filters.caseSensitive' | translate }}
                    </label>
                  </div>
                }
                @case ('boolean') {
                  <select
                    class="filter-bool"
                    [ngModel]="condition.value === true ? 'true' : 'false'"
                    (ngModelChange)="updateAt(index, { value: $event === 'true' })"
                  >
                    <option value="true">{{ 'webhooks.filters.yes' | translate }}</option>
                    <option value="false">{{ 'webhooks.filters.no' | translate }}</option>
                  </select>
                }
              }
            </div>

            <button
              type="button"
              class="filter-remove"
              [title]="'webhooks.filters.removeCondition' | translate"
              (click)="removeAt(index)"
            >
              <lucide-icon name="x" [size]="16" />
            </button>
          </div>
        }

        <button type="button" class="filter-add" (click)="addCondition()">
          <lucide-icon name="plus" [size]="14" />
          {{ 'webhooks.filters.addCondition' | translate }}
        </button>
      </div>
    }
  `,
})
export class FilterBuilderComponent {
  private readonly filters$ = new BehaviorSubject<WebhookFilters | null | undefined>(null);
  private readonly chats$ = new BehaviorSubject<Chat[]>([]);

  @Input() set filters(filters: WebhookFilters | null | undefined) {
    this.filters$.next(filters ?? null);
  }
  @Input() set chats(chats: Chat[] | null | undefined) {
    this.chats$.next(chats ?? []);
  }
  @Output() readonly filtersChange = new EventEmitter<WebhookFilters | null>();

  readonly messageFields = MESSAGE_FIELDS;
  readonly descriptorFor = descriptorFor;

  constructor(readonly lang: LangService) {}

  readonly vm$ = combineLatest({
    conditions: this.filters$.pipe(map(filters => filters?.conditions ?? [])),
    chats: this.chats$,
  });

  private conditions(): WebhookFilterCondition[] {
    return this.filters$.value?.conditions ?? [];
  }

  asArray(value: WebhookFilterCondition['value']): string[] {
    return Array.isArray(value) ? value : [];
  }

  asString(value: WebhookFilterCondition['value']): string {
    return typeof value === 'string' ? value : '';
  }

  private emit(next: WebhookFilterCondition[]): void {
    this.filtersChange.emit(next.length ? { conditions: next } : null);
  }

  updateAt(index: number, patch: Partial<WebhookFilterCondition>): void {
    this.emit(this.conditions().map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  removeAt(index: number): void {
    this.emit(this.conditions().filter((_, i) => i !== index));
  }

  addCondition(): void {
    const def = MESSAGE_FIELDS[0];
    this.emit([...this.conditions(), { field: def.field, operator: def.operators[0], value: defaultValueFor(def.kind) }]);
  }

  changeField(index: number, field: string): void {
    const def = descriptorFor(field);
    this.updateAt(index, {
      field,
      operator: def.operators[0],
      value: defaultValueFor(def.kind),
      caseSensitive: undefined,
    });
  }

  toggleEnum(index: number, condition: WebhookFilterCondition, option: string): void {
    const current = this.asArray(condition.value);
    const selected = current.includes(option);
    this.updateAt(index, { value: selected ? current.filter(v => v !== option) : [...current, option] });
  }
}
