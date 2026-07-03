import { Routes } from '@angular/router';
import { adminGuard, authGuard, superAdminGuard } from './core/guards';
import { LayoutComponent } from './layout/layout.component';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'sessions', loadComponent: () => import('./pages/sessions/sessions.component').then(m => m.SessionsComponent) },
      { path: 'chats', loadComponent: () => import('./pages/chats/chats.component').then(m => m.ChatsComponent) },
      { path: 'webhooks', loadComponent: () => import('./pages/webhooks/webhooks.component').then(m => m.WebhooksComponent) },
      { path: 'templates', loadComponent: () => import('./pages/templates/templates.component').then(m => m.TemplatesComponent) },
      {
        path: 'users',
        canActivate: [superAdminGuard],
        loadComponent: () => import('./pages/users/users.component').then(m => m.UsersComponent),
      },
      { path: 'logs', loadComponent: () => import('./pages/logs/logs.component').then(m => m.LogsComponent) },
      {
        path: 'message-tester',
        loadComponent: () => import('./pages/message-tester/message-tester.component').then(m => m.MessageTesterComponent),
      },
      {
        path: 'infrastructure',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/infrastructure/infrastructure.component').then(m => m.InfrastructureComponent),
      },
      // Plugins section intentionally not ported (disabled in the backend as well).
      { path: '**', redirectTo: '' },
    ],
  },
];
