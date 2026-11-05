// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { Env } from './env';
import { handleRequest, SIGNALING_ROOM } from './router';

const envWith = (overrides: Partial<Env> = {}): Env => ({
  SUPABASE_URL: 'http://supabase.test/',
  SUPABASE_ANON_KEY: 'anon-key',
  TICKET_PRIVATE_JWK: '',
  SIGNALING: {
    idFromName: vi.fn(name => `id:${name}`),
    get: vi.fn(() => ({ fetch: async () => new Response('room') }))
  },
  FILES: {
    head: async () => null,
    get: async () => null,
    put: async () => ({}),
    list: async () => ({ objects: [], truncated: false }),
    delete: async () => undefined
  },
  ...overrides
});

const get = (path: string): Request => new Request(`http://worker.test${path}`);

describe('handleRequest', () => {
  it('serves the public Supabase settings as a script', async () => {
    const response = await handleRequest(get('/app-config.js'), envWith());

    expect(response.headers.get('content-type')).toContain('text/javascript');
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.text()).resolves.toBe(
      'globalThis.__P2P_CONFIG__ = {"supabaseUrl":"http://supabase.test","supabaseAnonKey":"anon-key"};\n'
    );
  });

  it('fails loudly when Supabase is not configured', async () => {
    await expect(handleRequest(get('/app-config.js'), envWith({ SUPABASE_URL: '' }))).rejects.toThrow(
      'SUPABASE_URL and SUPABASE_ANON_KEY must be configured'
    );
  });

  it('hands the signaling socket to the single room object', async () => {
    const env = envWith();

    const response = await handleRequest(get('/api/signal'), env);

    expect(env.SIGNALING.idFromName).toHaveBeenCalledWith(SIGNALING_ROOM);
    await expect(response.text()).resolves.toBe('room');
  });

  it('routes file requests by content hash', async () => {
    const response = await handleRequest(get(`/api/files/${'b'.repeat(64)}`), envWith());

    expect(response.status).toBe(401);
  });

  it('answers unknown API paths with 404', async () => {
    const response = await handleRequest(get('/api/unknown'), envWith());

    expect(response.status).toBe(404);
  });

  it('hands /api/admin/* to the administration routes, which refuse an anonymous caller', async () => {
    const env = envWith();

    const response = await handleRequest(get('/api/admin/accounts'), env);

    expect(response.status).toBe(401);
    expect(env.SIGNALING.get).not.toHaveBeenCalled();
  });

  it('never lets an outside request reach the signaling room administration paths', async () => {
    const env = envWith();

    const response = await handleRequest(get('/api/signal/admin/online'), env);

    expect(response.status).toBe(404);
    expect(env.SIGNALING.get).not.toHaveBeenCalled();
  });
});
