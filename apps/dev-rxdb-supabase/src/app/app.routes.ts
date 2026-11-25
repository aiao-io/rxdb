import { Route } from '@angular/router';
import { supabaseSyncResolver } from './supabase-sync';

export const appRoutes: Route[] = [
  {
    path: 'home',
    loadComponent: () => import('./home/home.page')
  },
  {
    path: 'todo',
    resolve: { supabase: supabaseSyncResolver },
    loadComponent: () => import('./todo/todo.page')
  },
  {
    path: 'catalog',
    resolve: { supabase: supabaseSyncResolver },
    loadComponent: () => import('./catalog/catalog.page')
  },
  {
    path: '**',
    redirectTo: 'home',
    pathMatch: 'full'
  }
];
