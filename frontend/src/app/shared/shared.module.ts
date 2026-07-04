import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateDirective } from '@ngx-translate/core';
import { LucideAngularModule } from 'lucide-angular';

import { PageHeaderComponent } from './page-header.component';
import { GithubIconComponent } from './github-icon.component';
import { FilterBuilderComponent, ContactChipsInputComponent } from './filter-builder.component';

/**
 * Shared building blocks + the modules every feature template needs (CommonModule for control
 * flow, FormsModule for ngModel, TranslateModule for the translate pipe, Lucide for icons).
 * Feature modules import SharedModule to get all of these in one shot.
 */
@NgModule({
  declarations: [PageHeaderComponent, GithubIconComponent, FilterBuilderComponent, ContactChipsInputComponent],
  imports: [CommonModule, FormsModule, TranslatePipe, TranslateDirective, LucideAngularModule],
  exports: [
    CommonModule,
    FormsModule,
    TranslatePipe,
    TranslateDirective,
    LucideAngularModule,
    PageHeaderComponent,
    GithubIconComponent,
    FilterBuilderComponent,
    ContactChipsInputComponent,
  ],
})
export class SharedModule {}
