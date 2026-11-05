// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  describe('a file request whose auth host or bucket fails', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    const fileRequest = (): Request =>
      new Request(`http://worker.test/api/files/${'b'.repeat(64)}`, {
        headers: { authorization: 'Bearer user-token' }
      });
    const UNAVAILABLE = { error: 'the authentication host or file storage is unavailable' };

    it('answers 502 when the auth host fails and keeps its error out of the response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('database is on fire', { status: 500 }))
      );
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const response = await handleRequest(fileRequest(), envWith());

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual(UNAVAILABLE);
      expect(logged).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ message: 'Supabase Auth responded 500' })
      );
    });

    it('answers 502 when reading the bucket fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json({ id: 'user-1', email: 'a@example.com' }))
      );
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const bucket = envWith().FILES;
      const env = envWith({
        FILES: {
          ...bucket,
          get: async () => {
            throw new Error('R2 is unavailable');
          }
        }
      });

      const response = await handleRequest(fileRequest(), env);

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual(UNAVAILABLE);
    });
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

  describe('a Worker without administrator secrets', () => {
    afterEach(() => vi.unstubAllGlobals());

    const signedIn = (path: string): Request =>
      new Request(`http://worker.test${path}`, { headers: { authorization: 'Bearer user-token' } });

    const signInAs = (): void => {
      const user = { id: '6f1c5d1e-4c7b-4f7e-9a51-2d0c3b8f9a10', email: 'a@example.com' };
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json(user))
      );
    };

    it('answers the administration routes with 503 and names what is missing, while the rest keeps serving', async () => {
      signInAs();
      const env = envWith();

      const response = await handleRequest(signedIn('/api/admin/accounts'), env);

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: 'admin console is not configured: SUPABASE_SERVICE_ROLE_KEY and ADMIN_USER_IDS are missing'
      });
      expect((await handleRequest(get('/app-config.js'), env)).status).toBe(200);
      expect((await handleRequest(get(`/api/files/${'b'.repeat(64)}`), env)).status).toBe(401);
    });

    it('tells every signed-in user that they are not an administrator', async () => {
      signInAs();

      const response = await handleRequest(signedIn('/api/admin/me'), envWith());

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ admin: false });
    });

    it('treats an administrator list that names this user as enough only together with the service key', async () => {
      signInAs();
      const env = envWith({ ADMIN_USER_IDS: '6f1c5d1e-4c7b-4f7e-9a51-2d0c3b8f9a10' });

      const response = await handleRequest(signedIn('/api/admin/accounts'), env);

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: 'admin console is not configured: SUPABASE_SERVICE_ROLE_KEY is missing'
      });
    });
  });
});
