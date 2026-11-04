import { inject } from '@angular/core';
import { Router, type CanActivateFn, type Routes } from '@angular/router';
import { AuthService } from './auth/auth.service';

const signedIn: CanActivateFn = () => inject(AuthService).session() !== null || inject(Router).parseUrl('/login');
const signedOut: CanActivateFn = () => inject(AuthService).session() === null || inject(Router).parseUrl('/');

export const appRoutes: Routes = [
  { path: 'login', canActivate: [signedOut], loadComponent: () => import('./pages/login.page') },
  { path: '', canActivate: [signedIn], loadComponent: () => import('./pages/workspace.page') },
  { path: '**', redirectTo: '' }
];
