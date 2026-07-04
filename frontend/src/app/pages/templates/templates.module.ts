import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { TemplatesComponent } from './templates.component';

const routes: Routes = [{ path: '', component: TemplatesComponent }];

@NgModule({
  declarations: [TemplatesComponent],
  imports: [SharedModule, RouterModule.forChild(routes)],
})
export class TemplatesModule {}
