import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminAccess } from './admin-access';
import { AdminApi } from './admin-api';

describe('AdminAccess', () => {
  const me = vi.fn<() => Promise<{ readonly admin: boolean }>>();
  let access: AdminAccess;

  beforeEach(() => {
    me.mockReset();
    TestBed.configureTestingModule({ providers: [{ provide: AdminApi, useValue: { me } }] });
    access = TestBed.inject(AdminAccess);
  });

  it('is not an administrator until the server says so', async () => {
    me.mockResolvedValue({ admin: true });

    expect(access.isAdmin()).toBe(false);
    await expect(access.check()).resolves.toBe(true);

    expect(access.isAdmin()).toBe(true);
  });

  it('keeps a regular user out', async () => {
    me.mockResolvedValue({ admin: false });

    await expect(access.check()).resolves.toBe(false);

    expect(access.isAdmin()).toBe(false);
  });

  it('asks the server once however many callers check', async () => {
    me.mockResolvedValue({ admin: true });

    await Promise.all([access.check(), access.check()]);
    await access.check();

    expect(me).toHaveBeenCalledOnce();
  });

  it('never claims administrator on a failed check and lets the next caller retry', async () => {
    me.mockRejectedValueOnce(new Error('管理接口返回 HTTP 502'));

    await expect(access.check()).rejects.toThrow('管理接口返回 HTTP 502');
    expect(access.isAdmin()).toBe(false);

    me.mockResolvedValueOnce({ admin: true });
    await expect(access.check()).resolves.toBe(true);
    expect(me).toHaveBeenCalledTimes(2);
  });
});
