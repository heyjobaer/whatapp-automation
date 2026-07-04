import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
// AdminGuard is still exported from ./core/guards — re-add it here when re-enabling the infrastructure route.
import { AuthGuard, SuperAdminGuard } from './core/guards';
import { LayoutComponent } from './layout/layout.component';

const routes: Routes = [
  {
    path: 'login',
    loadChildren: () => import('./pages/login/login.module').then(m => m.LoginModule),
  },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', loadChildren: () => import('./pages/dashboard/dashboard.module').then(m => m.DashboardModule) },
      { path: 'sessions', loadChildren: () => import('./pages/sessions/sessions.module').then(m => m.SessionsModule) },
      { path: 'chats', loadChildren: () => import('./pages/chats/chats.module').then(m => m.ChatsModule) },
      { path: 'properties', loadChildren: () => import('./pages/properties/properties.module').then(m => m.PropertiesModule) },
      // Temporarily disabled (kept in code, not routed):
      // { path: 'webhooks', loadChildren: () => import('./pages/webhooks/webhooks.module').then(m => m.WebhooksModule) },
      // { path: 'templates', loadChildren: () => import('./pages/templates/templates.module').then(m => m.TemplatesModule) },
      {
        path: 'users',
        canActivate: [SuperAdminGuard],
        loadChildren: () => import('./pages/users/users.module').then(m => m.UsersModule),
      },
      // Temporarily disabled (kept in code, not routed):
      // {
      //   path: 'message-tester',
      //   loadChildren: () => import('./pages/message-tester/message-tester.module').then(m => m.MessageTesterModule),
      // },
      // Temporarily disabled (kept in code, not routed):
      // {
      //   path: 'infrastructure',
      //   canActivate: [AdminGuard],
      //   loadChildren: () => import('./pages/infrastructure/infrastructure.module').then(m => m.InfrastructureModule),
      // },
      // Plugins section intentionally not ported (disabled in the backend as well).
      { path: '**', redirectTo: '' },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
