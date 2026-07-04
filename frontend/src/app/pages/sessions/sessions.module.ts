import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { SessionsComponent } from './sessions.component';

const routes: Routes = [{ path: '', component: SessionsComponent }];

@NgModule({
  declarations: [SessionsComponent],
  imports: [SharedModule, RouterModule.forChild(routes)],
})
export class SessionsModule {}
