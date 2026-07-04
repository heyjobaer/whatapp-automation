import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Shared page header for consistent styling across all pages (port of PageHeader.tsx).
 * Badge and actions are projected: <span badge>…</span> / <div actions>…</div>.
 */
@Component({
  selector: 'app-page-header',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <div class="page-header__title-group">
        <h1>{{ title }}</h1>
        <span class="page-header__badge"><ng-content select="[badge]" /></span>
      </div>
      <div class="page-header__actions"><ng-content select="[actions]" /></div>
      @if (subtitle) {
        <p class="page-header__subtitle">{{ subtitle }}</p>
      }
    </header>
  `,
  styleUrl: './page-header.component.css',
})
export class PageHeaderComponent {
  @Input() title!: string;
  @Input() subtitle?: string;
}
