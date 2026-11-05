import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, type Route, type UrlTree } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminAccess } from './admin/admin-access';
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

describe('administration access', () => {
  const session = signal<object | null>(null);
  const confirm = vi.fn<() => Promise<boolean>>();
  const admin = appRoutes.find(route => route.path === 'admin')!;
  const enter = (): Promise<boolean | UrlTree> =>
    TestBed.runInInjectionContext(() => (admin.canActivate?.[0] as () => Promise<boolean | UrlTree>)());
  const target = async (): Promise<string> => TestBed.inject(Router).serializeUrl((await enter()) as UrlTree);

  beforeEach(() => {
    session.set(null);
    confirm.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(appRoutes),
        { provide: AuthService, useValue: { session } },
        { provide: AdminAccess, useValue: { check: confirm } }
      ]
    });
  });

  it('sends a signed-out visitor to the login form without asking the server', async () => {
    await expect(target()).resolves.toBe('/login');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('lets a confirmed administrator in', async () => {
    session.set({ user: 'signed-in' });
    confirm.mockResolvedValue(true);

    await expect(enter()).resolves.toBe(true);
  });

  it('sends a regular user home', async () => {
    session.set({ user: 'signed-in' });
    confirm.mockResolvedValue(false);

    await expect(target()).resolves.toBe('/');
  });

  it('sends the user home when the administrator check itself fails', async () => {
    session.set({ user: 'signed-in' });
    confirm.mockRejectedValue(new Error('管理接口返回 HTTP 502'));

    await expect(target()).resolves.toBe('/');
  });

  it('is its own route, outside the workspace shell that waits for the local database', () => {
    expect(admin.canActivate).toHaveLength(1);
    expect(admin.children).toBeUndefined();
  });
});
