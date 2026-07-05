import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  canActivate(): boolean | UrlTree {
    return this.auth.isAuthenticated() ? true : this.router.createUrlTree(['/login']);
  }
}

/**
 * Guards the /login route: if the user is already authenticated, bounce them to the dashboard
 * instead of showing the login form again.
 */
@Injectable({ providedIn: 'root' })
export class GuestGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  canActivate(): boolean | UrlTree {
    return this.auth.isAuthenticated() ? this.router.createUrlTree(['/']) : true;
  }
}

@Injectable({ providedIn: 'root' })
export class AdminGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  canActivate(): boolean | UrlTree {
    return this.auth.isAdmin() ? true : this.router.createUrlTree(['/']);
  }
}

@Injectable({ providedIn: 'root' })
export class SuperAdminGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  canActivate(): boolean | UrlTree {
    return this.auth.isSuperAdmin() ? true : this.router.createUrlTree(['/']);
  }
}
