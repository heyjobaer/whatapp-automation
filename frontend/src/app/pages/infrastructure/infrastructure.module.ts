import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { InfrastructureComponent } from './infrastructure.component';

const routes: Routes = [{ path: '', component: InfrastructureComponent }];

@NgModule({
  declarations: [InfrastructureComponent],
  imports: [SharedModule, RouterModule.forChild(routes)],
})
export class InfrastructureModule {}
