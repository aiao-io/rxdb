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
    path: 'todo-cursor',
    resolve: { supabase: supabaseSyncResolver },
    loadComponent: () => import('./todo-cursor/todo-cursor.page')
  },
  {
    path: '**',
    redirectTo: 'home',
    pathMatch: 'full'
  }
];
