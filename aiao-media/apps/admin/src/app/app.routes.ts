import { Component } from '@angular/core';
import type { Routes } from '@angular/router';

@Component({ selector: 'aiao-media-admin-route', template: '' })
class AdminRoutePlaceholder {}

export const appRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'users' },
  { path: 'users', component: AdminRoutePlaceholder },
  { path: 'templates', component: AdminRoutePlaceholder },
  { path: 'policies', component: AdminRoutePlaceholder },
  { path: 'tasks', component: AdminRoutePlaceholder },
  { path: 'audit', component: AdminRoutePlaceholder },
  { path: '**', redirectTo: 'users' }
];
