// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { AccountNotFoundError, createAdminDirectory, type AdminSupabaseConfig } from './admin-supabase';

const USER_ID = '6f1c5d1e-4c7b-4f7e-9a51-2d0c3b8f9a10';

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const directoryWith = (handler: (url: URL, init: RequestInit) => Response) => {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(new URL(String(input)), init ?? {})
  );
  const config: AdminSupabaseConfig = { url: 'http://supabase.test', serviceRoleKey: 'service-key', fetch };
  return { directory: createAdminDirectory(config), fetch };
};

const headersOf = (init: RequestInit): Headers => new Headers(init.headers);

describe('createAdminDirectory', () => {
  describe('listAccounts', () => {
    it('pages through the Auth admin API as the service role', async () => {
      const { directory, fetch } = directoryWith((url, init) => {
        expect(url.pathname).toBe('/auth/v1/admin/users');
        expect(url.searchParams.get('page')).toBe('2');
        expect(url.searchParams.get('per_page')).toBe('50');
        expect(headersOf(init).get('apikey')).toBe('service-key');
        expect(headersOf(init).get('authorization')).toBe('Bearer service-key');
        return json(
          200,
          {
            users: [
              {
                id: USER_ID,
                email: 'a@example.com',
                created_at: '2026-11-01T00:00:00Z',
                last_sign_in_at: '2026-11-04T00:00:00Z',
                banned_until: '2999-01-01T00:00:00Z'
              },
              { id: 'phone-user', created_at: '2026-11-02T00:00:00Z' }
            ],
            aud: 'authenticated'
          },
          { 'x-total-count': '61' }
        );
      });

      await expect(directory.listAccounts(2)).resolves.toEqual({
        total: 61,
        users: [
          {
            id: USER_ID,
            email: 'a@example.com',
            createdAt: '2026-11-01T00:00:00Z',
            lastSignInAt: '2026-11-04T00:00:00Z',
            bannedUntil: '2999-01-01T00:00:00Z'
          },
          {
            id: 'phone-user',
            email: 'phone-user',
            createdAt: '2026-11-02T00:00:00Z',
            lastSignInAt: null,
            bannedUntil: null
          }
        ]
      });
      expect(fetch).toHaveBeenCalledOnce();
    });

    it.each([
      ['no total count', {}],
      ['an unreadable total count', { 'x-total-count': 'many' }]
    ])('refuses a response with %s', async (_label, headers) => {
      const { directory } = directoryWith(() => json(200, { users: [] }, headers));

      await expect(directory.listAccounts(1)).rejects.toThrow('Supabase Auth returned no total count');
    });

    it('reports the upstream status and message when the admin API refuses', async () => {
      const { directory } = directoryWith(() => json(401, { code: 401, msg: 'invalid JWT' }));

      await expect(directory.listAccounts(1)).rejects.toThrow('Supabase Auth admin responded 401: invalid JWT');
    });
  });

  describe('database functions', () => {
    it('reads per-account device and claim counts through the p2p profile', async () => {
      const { directory } = directoryWith((url, init) => {
        expect(url.pathname).toBe('/rest/v1/rpc/admin_account_stats');
        expect(init.method).toBe('POST');
        expect(headersOf(init).get('content-profile')).toBe('p2p');
        expect(headersOf(init).get('authorization')).toBe('Bearer service-key');
        return json(200, [{ user_id: USER_ID, device_count: 2, claim_count: 5 }]);
      });

      await expect(directory.accountStats()).resolves.toEqual([{ userId: USER_ID, deviceCount: 2, claimCount: 5 }]);
    });

    it('reads the file catalog of the manifest', async () => {
      const { directory } = directoryWith(url => {
        expect(url.pathname).toBe('/rest/v1/rpc/admin_file_catalog');
        return json(200, [{ content_hash: 'a'.repeat(64), file_name: '报告.pdf', holder_count: 3 }]);
      });

      await expect(directory.fileCatalog()).resolves.toEqual([
        { contentHash: 'a'.repeat(64), fileName: '报告.pdf', holderCount: 3 }
      ]);
    });

    it('purges the claims and devices of one account and returns how many claims were removed', async () => {
      const { directory } = directoryWith((url, init) => {
        expect(url.pathname).toBe('/rest/v1/rpc/admin_purge_account');
        expect(headersOf(init).get('content-profile')).toBe('p2p');
        expect(JSON.parse(String(init.body))).toEqual({ target: USER_ID });
        return json(200, 4);
      });

      await expect(directory.purgeAccount(USER_ID)).resolves.toBe(4);
    });

    it('refuses a purge answer that is not a count', async () => {
      const { directory } = directoryWith(() => json(200, { purged: 4 }));

      await expect(directory.purgeAccount(USER_ID)).rejects.toThrow('admin_purge_account returned no count');
    });

    it('points at the schema when the function is not installed', async () => {
      const { directory } = directoryWith(() =>
        json(404, { code: 'PGRST202', message: 'Could not find the function p2p.admin_account_stats' })
      );

      await expect(directory.accountStats()).rejects.toThrow(
        'PostgREST responded 404: Could not find the function p2p.admin_account_stats'
      );
    });
  });

  describe('account changes', () => {
    it.each([
      [true, '876000h'],
      [false, 'none']
    ])('sets the ban to %s as ban_duration %s', async (banned, duration) => {
      const { directory } = directoryWith((url, init) => {
        expect(url.pathname).toBe(`/auth/v1/admin/users/${USER_ID}`);
        expect(init.method).toBe('PUT');
        expect(JSON.parse(String(init.body))).toEqual({ ban_duration: duration });
        return json(200, { id: USER_ID });
      });

      await expect(directory.setBanned(USER_ID, banned)).resolves.toBeUndefined();
    });

    it('deletes the account from Supabase Auth', async () => {
      const { directory, fetch } = directoryWith((url, init) => {
        expect(url.pathname).toBe(`/auth/v1/admin/users/${USER_ID}`);
        expect(init.method).toBe('DELETE');
        return json(200, {});
      });

      await expect(directory.deleteAccount(USER_ID)).resolves.toBeUndefined();
      expect(fetch).toHaveBeenCalledOnce();
    });

    it.each(['setBanned', 'deleteAccount'] as const)('%s names an account that does not exist', async method => {
      const { directory } = directoryWith(() =>
        json(404, { code: 404, error_code: 'user_not_found', msg: 'User not found' })
      );

      const call = method === 'setBanned' ? directory.setBanned(USER_ID, true) : directory.deleteAccount(USER_ID);

      await expect(call).rejects.toBeInstanceOf(AccountNotFoundError);
    });

    it('reports any other failure with the upstream message', async () => {
      const { directory } = directoryWith(() => json(500, { msg: 'database is down' }));

      await expect(directory.deleteAccount(USER_ID)).rejects.toThrow(
        'Supabase Auth admin responded 500: database is down'
      );
    });

    it('survives an upstream error body that is not json', async () => {
      const { directory } = directoryWith(() => new Response('<html>bad gateway</html>', { status: 502 }));

      await expect(directory.deleteAccount(USER_ID)).rejects.toThrow('Supabase Auth admin responded 502');
    });
  });
});
