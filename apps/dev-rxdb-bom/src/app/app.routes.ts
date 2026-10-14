import { Routes } from '@angular/router';

export const appRoutes: Routes = [
  { path: '', loadComponent: () => import('./pages/explosion/explosion.page').then(m => m.ExplosionPage) },
  { path: '**', redirectTo: '' }
];
