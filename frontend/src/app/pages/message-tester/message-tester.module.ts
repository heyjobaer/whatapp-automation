import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { MessageTesterComponent } from './message-tester.component';

const routes: Routes = [{ path: '', component: MessageTesterComponent }];

@NgModule({
  declarations: [MessageTesterComponent],
  imports: [SharedModule, RouterModule.forChild(routes)],
})
export class MessageTesterModule {}
