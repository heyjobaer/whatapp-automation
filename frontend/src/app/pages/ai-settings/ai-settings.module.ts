import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { AiSettingsComponent } from './ai-settings.component';

const routes: Routes = [{ path: '', component: AiSettingsComponent }];

@NgModule({
  declarations: [AiSettingsComponent],
  imports: [SharedModule, RouterModule.forChild(routes)],
})
export class AiSettingsModule {}
