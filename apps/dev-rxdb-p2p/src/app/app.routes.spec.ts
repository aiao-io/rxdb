import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, type Route, type UrlTree } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { appRoutes } from './app.routes';
import { AuthService } from './auth/auth.service';

describe('workspace access', () => {
  const session = signal<object | null>(null);
  const workspace = appRoutes.find(route => route.path === '')!;
  const login = appRoutes.find(route => route.path === 'login')!;
  const check = (route: Route, child = false): boolean | UrlTree =>
    TestBed.runInInjectionContext(() => {
      const guards = child ? route.canActivateChild : route.canActivate;
      return (guards?.[0] as () => boolean | UrlTree)();
    });
  beforeEach(() => {
    session.set(null);
    TestBed.configureTestingModule({
      providers: [provideRouter(appRoutes), { provide: AuthService, useValue: { session } }]
    });
  });

  it('requires a session both on direct entry and navigation into management', () => {
    const router = TestBed.inject(Router);
    expect(router.serializeUrl(check(workspace) as UrlTree)).toBe('/login');
    expect(router.serializeUrl(check(workspace, true) as UrlTree)).toBe('/login');
    session.set({ user: 'signed-in' });
    expect(check(workspace)).toBe(true);
    expect(check(workspace, true)).toBe(true);
  });

  it('keeps signed-in users out of the login form', () => {
    expect(check(login)).toBe(true);
    session.set({ user: 'signed-in' });
    expect(TestBed.inject(Router).serializeUrl(check(login) as UrlTree)).toBe('/');
  });
});
