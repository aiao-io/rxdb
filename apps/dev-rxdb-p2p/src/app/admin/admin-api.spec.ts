import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { AdminApi } from './admin-api';

const USER = '6f1c5d1e-4c7b-4f7e-9a51-2d0c3b8f9a10';
const DEVICE = 'd4c3b2a1-0f9e-4d8c-b7a6-5f4e3d2c1b0a';
const HASH = 'a'.repeat(64);

describe('AdminApi', () => {
  const fetcher = vi.fn<typeof fetch>();
  const accessToken = vi.fn(async () => 'token-1');
  let api: AdminApi;

  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  const lastRequest = () => {
    const [url, init] = fetcher.mock.calls.at(-1) as [string, RequestInit];
    return { url, method: init.method, authorization: new Headers(init.headers).get('authorization') };
  };

  beforeEach(() => {
    fetcher.mockReset();
    accessToken.mockClear();
    vi.stubGlobal('fetch', fetcher);
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { accessToken } }] });
    api = TestBed.inject(AdminApi);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('asks who the signed-in user is with a fresh access token', async () => {
    fetcher.mockResolvedValueOnce(json({ admin: true }));

    await expect(api.me()).resolves.toEqual({ admin: true });

    expect(lastRequest()).toEqual({ url: '/api/admin/me', method: 'GET', authorization: 'Bearer token-1' });
  });

  it('reads one page of accounts, the online devices and the server copies', async () => {
    fetcher.mockResolvedValueOnce(json({ accounts: [], total: 0, page: 3 }));
    await expect(api.accounts(3)).resolves.toEqual({ accounts: [], total: 0, page: 3 });
    expect(lastRequest().url).toBe('/api/admin/accounts?page=3');

    fetcher.mockResolvedValueOnce(json({ devices: [{ deviceId: DEVICE }] }));
    await expect(api.online()).resolves.toEqual([{ deviceId: DEVICE }]);
    expect(lastRequest().url).toBe('/api/admin/online');

    fetcher.mockResolvedValueOnce(json({ files: [], totalBytes: 0, truncated: false }));
    await expect(api.files()).resolves.toEqual({ files: [], totalBytes: 0, truncated: false });
    expect(lastRequest().url).toBe('/api/admin/files');
  });

  it.each([
    ['ban', () => api.ban(USER), 'POST', `/api/admin/accounts/${USER}/ban`, { evictedDevices: 2 }],
    [
      'deleteAccount',
      () => api.deleteAccount(USER),
      'DELETE',
      `/api/admin/accounts/${USER}`,
      { purgedClaims: 4, evictedDevices: 1 }
    ],
    ['kick', () => api.kick(DEVICE), 'POST', `/api/admin/devices/${DEVICE}/kick`, { evictedDevices: 1 }]
  ])('%s sends the right request and returns the result', async (_name, call, method, url, result) => {
    fetcher.mockResolvedValueOnce(json(result));

    await expect(call()).resolves.toEqual(result);

    expect(lastRequest()).toEqual({ url, method, authorization: 'Bearer token-1' });
  });

  it.each([
    ['unban', () => api.unban(USER), 'POST', `/api/admin/accounts/${USER}/unban`],
    ['deleteFile', () => api.deleteFile(HASH), 'DELETE', `/api/admin/files/${HASH}`]
  ])('%s resolves without a body when the server answers 204', async (_name, call, method, url) => {
    fetcher.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(call()).resolves.toBeUndefined();

    expect(lastRequest()).toMatchObject({ url, method });
  });

  it('turns an error answer into an Error carrying the server explanation', async () => {
    fetcher.mockResolvedValueOnce(json({ error: 'administrator access required' }, 403));

    await expect(api.accounts(1)).rejects.toThrow('administrator access required');
  });

  it('names the status when the answer is not the usual error json', async () => {
    fetcher.mockResolvedValueOnce(new Response('<html>bad gateway</html>', { status: 502 }));

    await expect(api.online()).rejects.toThrow('管理接口返回 HTTP 502');
  });

  it('does not send a request without a signed-in session', async () => {
    accessToken.mockRejectedValueOnce(new Error('not signed in'));

    await expect(api.me()).rejects.toThrow('not signed in');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
