import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { LucideAngularModule } from 'lucide-angular';

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

@Component({
  selector: 'app-contact-chips-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, LucideAngularModule],
  styleUrl: './filter-builder.component.css',
  template: `
    <div class="chips-input">
      <div class="chips-row">
        @for (jid of value(); track jid) {
          <span class="chip" [title]="jid">
            {{ labelFor(jid) }}
            <button type="button" class="chip-remove" (click)="remove(jid)">
              <lucide-icon name="x" [size]="12" />
            </button>
          </span>
        }
        <input
          class="chips-text"
          [ngModel]="text()"
          (ngModelChange)="text.set($event)"
          [placeholder]="'webhooks.filters.contactPlaceholder' | translate"
          (focus)="open.set(true)"
          (blur)="closeSoon()"
          (keydown.enter)="$event.preventDefault(); addTyped()"
          (keydown.backspace)="onBackspace()"
        />
      </div>
      @if (open() && (suggestions().length > 0 || text().trim())) {
        <div class="chips-suggestions">
          @for (c of suggestions(); track c.id) {
            <button type="button" class="chips-suggestion" (mousedown)="$event.preventDefault()" (click)="add(c.id)">
              <span class="chips-suggestion-name">{{ c.name || c.id }}</span>
              <span class="chips-suggestion-id">{{ c.id }}</span>
            </button>
          }
          @if (text().trim() && typedJid()) {
            <button
              type="button"
              class="chips-suggestion chips-suggestion-add"
              (mousedown)="$event.preventDefault()"
              (click)="addTyped()"
            >
              {{ 'webhooks.filters.addValue' | translate: { value: typedJid() } }}
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class ContactChipsInputComponent {
  readonly value = input<string[]>([]);
  readonly chats = input<Chat[]>([]);
  readonly valueChange = output<string[]>();

  readonly text = signal('');
  readonly open = signal(false);

  readonly suggestions = computed(() => {
    const query = this.text().trim().toLowerCase();
    const chosen = new Set(this.value());
    return this.chats()
      .filter(c => !chosen.has(c.id))
      .filter(c => !query || c.name.toLowerCase().includes(query) || c.id.toLowerCase().includes(query))
      .slice(0, 8);
  });

  readonly typedJid = computed(() => normalizeToJid(this.text()));

  labelFor(jid: string): string {
    return this.chats().find(c => c.id === jid)?.name ?? jid;
  }

  add(jid: string): void {
    if (jid && !this.value().includes(jid)) this.valueChange.emit([...this.value(), jid]);
    this.text.set('');
  }

  addTyped(): void {
    const jid = normalizeToJid(this.text());
    if (jid) this.add(jid);
  }

  remove(jid: string): void {
    this.valueChange.emit(this.value().filter(v => v !== jid));
  }

  onBackspace(): void {
    if (!this.text() && this.value().length) this.valueChange.emit(this.value().slice(0, -1));
  }

  closeSoon(): void {
    setTimeout(() => this.open.set(false), 120);
  }
}

@Component({
  selector: 'app-filter-builder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe, LucideAngularModule, ContactChipsInputComponent],
  styleUrl: './filter-builder.component.css',
  template: `
    <div class="filter-builder">
      <div class="filter-builder-head">
        <span class="filter-builder-title">{{ 'webhooks.filters.title' | translate }}</span>
        <span class="filter-builder-hint">{{ 'webhooks.filters.hint' | translate }}</span>
      </div>

      @for (condition of conditions(); track $index; let index = $index) {
        <div class="filter-row">
          <select class="filter-field" [ngModel]="condition.field" (ngModelChange)="changeField(index, $event)">
            @for (f of messageFields; track f.field) {
              <option [value]="f.field">{{ 'webhooks.filters.fields.' + f.field | translate }}</option>
            }
          </select>

          <select class="filter-operator" [ngModel]="condition.operator" (ngModelChange)="updateAt(index, { operator: $event })">
            @for (op of descriptorFor(condition.field).operators; track op) {
              <option [value]="op">{{ 'webhooks.filters.operators.' + op | translate }}</option>
            }
          </select>

          <div class="filter-value">
            @switch (descriptorFor(condition.field).kind) {
              @case ('id') {
                <app-contact-chips-input
                  [value]="asArray(condition.value)"
                  [chats]="chats()"
                  (valueChange)="updateAt(index, { value: $event })"
                />
              }
              @case ('idArray') {
                <app-contact-chips-input
                  [value]="asArray(condition.value)"
                  [chats]="chats()"
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
  `,
})
export class FilterBuilderComponent {
  readonly lang = inject(LangService);

  readonly filters = input<WebhookFilters | null | undefined>(null);
  readonly chats = input<Chat[]>([]);
  readonly filtersChange = output<WebhookFilters | null>();

  readonly messageFields = MESSAGE_FIELDS;
  readonly descriptorFor = descriptorFor;

  readonly conditions = computed(() => this.filters()?.conditions ?? []);

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
