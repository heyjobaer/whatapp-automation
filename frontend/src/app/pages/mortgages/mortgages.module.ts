import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { MortgagesComponent } from './mortgages.component';

const routes: Routes = [{ path: '', component: MortgagesComponent }];

@NgModule({
  declarations: [MortgagesComponent],
  imports: [SharedModule, RouterModule.forChild(routes)],
})
export class MortgagesModule {}
