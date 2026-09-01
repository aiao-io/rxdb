import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'events',
    pathMatch: 'full'
  },
  {
    path: 'events',
    loadComponent: () => import('./pages/events.page').then(m => m.EventsPage)
  },
  {
    path: 'database',
    loadComponent: () => import('./pages/database.page').then(m => m.DatabasePage)
  },
  {
    path: 'opfs',
    loadComponent: () => import('./pages/opfs.page').then(m => m.OpfsPage)
  },
  {
    path: 'storage',
    loadComponent: () => import('./pages/storage.page').then(m => m.StoragePage)
  },
  {
    path: 'settings',
    loadComponent: () => import('./pages/settings.page').then(m => m.SettingsPage)
  }
];
