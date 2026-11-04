// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { findOwnDevice, verifyAccessToken, type SupabaseAuthConfig } from './identity';

const USER_ID = '6f1c5d1e-4c7b-4f7e-9a51-2d0c3b8f9a10';
const DEVICE_ID = '0b9d8c7a-6e5f-4a3b-8c2d-1e0f9a8b7c6d';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const configWith = (handler: (url: URL, init: RequestInit) => Response): SupabaseAuthConfig => ({
  url: 'http://supabase.test',
  anonKey: 'anon-key',
  fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(new URL(String(input)), init ?? {}))
});

const headersOf = (init: RequestInit): Headers => new Headers(init.headers);

describe('verifyAccessToken', () => {
  it('returns the user that Supabase Auth resolves the token to', async () => {
    const config = configWith((url, init) => {
      expect(url.pathname).toBe('/auth/v1/user');
      expect(headersOf(init).get('authorization')).toBe('Bearer token-1');
      expect(headersOf(init).get('apikey')).toBe('anon-key');
      return json(200, { id: USER_ID, email: 'a@example.com' });
    });

    await expect(verifyAccessToken(config, 'token-1')).resolves.toEqual({ id: USER_ID, email: 'a@example.com' });
  });

  it.each([401, 403])('treats status %i as an invalid token', async status => {
    const config = configWith(() => json(status, { message: 'invalid JWT' }));

    await expect(verifyAccessToken(config, 'bad')).resolves.toBeNull();
  });

  it('reports an unreachable auth host instead of rejecting the user', async () => {
    const config = configWith(() => json(503, { message: 'down' }));

    await expect(verifyAccessToken(config, 'token-1')).rejects.toThrow('Supabase Auth responded 503');
  });

  it('rejects a response without a user id', async () => {
    const config = configWith(() => json(200, { email: 'a@example.com' }));

    await expect(verifyAccessToken(config, 'token-1')).rejects.toThrow('Supabase Auth returned no user id');
  });
});

describe('findOwnDevice', () => {
  it('looks the device up as the user through PostgREST', async () => {
    const config = configWith((url, init) => {
      expect(url.pathname).toBe('/rest/v1/devices');
      expect(url.searchParams.get('id')).toBe(`eq.${DEVICE_ID}`);
      expect(headersOf(init).get('accept-profile')).toBe('p2p');
      expect(headersOf(init).get('authorization')).toBe('Bearer token-1');
      return json(200, [{ id: DEVICE_ID, name: 'Laptop' }]);
    });

    await expect(findOwnDevice(config, 'token-1', DEVICE_ID)).resolves.toEqual({ id: DEVICE_ID, name: 'Laptop' });
  });

  it('returns null when row-level security hides the device', async () => {
    const config = configWith(() => json(200, []));

    await expect(findOwnDevice(config, 'token-1', DEVICE_ID)).resolves.toBeNull();
  });

  it('rejects a device id that is not a uuid without asking the server', async () => {
    const config = configWith(() => json(200, []));

    await expect(findOwnDevice(config, 'token-1', 'x&id=neq.0')).resolves.toBeNull();
    expect(config.fetch).not.toHaveBeenCalled();
  });

  it('reports a failing PostgREST', async () => {
    const config = configWith(() => json(500, { message: 'boom' }));

    await expect(findOwnDevice(config, 'token-1', DEVICE_ID)).rejects.toThrow('PostgREST responded 500');
  });
});
