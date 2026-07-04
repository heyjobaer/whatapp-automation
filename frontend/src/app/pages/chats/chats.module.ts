import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { ChatsComponent } from './chats.component';
import { MessageBodyComponent } from './message-body.component';
import { MediaLightboxComponent } from './media-lightbox.component';

const routes: Routes = [{ path: '', component: ChatsComponent }];

@NgModule({
  declarations: [ChatsComponent, MessageBodyComponent, MediaLightboxComponent],
  imports: [SharedModule, RouterModule.forChild(routes)],
})
export class ChatsModule {}
