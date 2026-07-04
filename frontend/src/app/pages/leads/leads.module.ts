import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { LeadsComponent } from './leads.component';

const routes: Routes = [{ path: '', component: LeadsComponent }];

@NgModule({
  declarations: [LeadsComponent],
  imports: [SharedModule, RouterModule.forChild(routes)],
})
export class LeadsModule {}
