import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { WebhooksComponent } from './webhooks.component';

const routes: Routes = [{ path: '', component: WebhooksComponent }];

@NgModule({
  declarations: [WebhooksComponent],
  imports: [SharedModule, RouterModule.forChild(routes)],
})
export class WebhooksModule {}
