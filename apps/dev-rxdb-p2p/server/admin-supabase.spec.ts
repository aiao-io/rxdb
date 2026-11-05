// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AccountNotFoundError,
  createAdminDirectory,
  createInviteDirectory,
  createReportDirectory,
  type AdminSupabaseConfig
} from './admin-supabase';

const USER_ID = '6f1c5d1e-4c7b-4f7e-9a51-2d0c3b8f9a10';

afterEach(() => vi.restoreAllMocks());

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

describe('createReportDirectory', () => {
  it('submits a report through the p2p profile and maps duplicate reports to created false', async () => {
    const { fetch } = directoryWith((_url, init) => {
      expect(headersOf(init).get('content-profile')).toBe('p2p');
      expect(headersOf(init).get('authorization')).toBe('Bearer service-key');
      expect(init.method).toBe('POST');
      expect(JSON.parse(String(init.body))).toEqual({
        target_hash: 'a'.repeat(64),
        target_user: null,
        target_source: `/api/files/${'a'.repeat(64)}`,
        category: 'malware',
        reporter_user: USER_ID
      });
      return json(201, {});
    });
    const directory = createReportDirectory({
      url: 'http://supabase.test',
      serviceRoleKey: 'service-key',
      fetch
    });
    const input = {
      targetHash: 'a'.repeat(64),
      targetUser: null,
      sourceUrl: `/api/files/${'a'.repeat(64)}`,
      category: 'malware' as const,
      reporterUser: USER_ID
    };

    await expect(directory.submit(input)).resolves.toEqual({ created: true });
    fetch.mockImplementationOnce(async () => json(409, { code: '23505' }));
    await expect(directory.submit(input)).resolves.toEqual({ created: false });
  });

  it('rejects a conflict that does not identify the duplicate-report constraint', async () => {
    const { fetch } = directoryWith(() => json(409, { code: 'other' }));
    const directory = createReportDirectory({ url: 'http://supabase.test', serviceRoleKey: 'service-key', fetch });

    await expect(
      directory.submit({
        targetHash: null,
        targetUser: USER_ID,
        sourceUrl: null,
        category: 'other',
        reporterUser: USER_ID
      })
    ).rejects.toThrow('PostgREST responded 409');
    const invalidJson = directoryWith(() => new Response('<html>bad gateway</html>', { status: 502 }));
    const invalidDirectory = createReportDirectory({
      url: 'http://supabase.test',
      serviceRoleKey: 'service-key',
      fetch: invalidJson.fetch
    });
    await expect(
      invalidDirectory.submit({
        targetHash: null,
        targetUser: USER_ID,
        sourceUrl: null,
        category: 'other',
        reporterUser: USER_ID
      })
    ).rejects.toThrow('PostgREST responded 502');
  });

  it('lists open reports and maps nullable target and resolution fields', async () => {
    const { fetch } = directoryWith((url, init) => {
      expect(url.pathname).toBe('/rest/v1/reports');
      expect(url.searchParams.get('resolved_at')).toBe('is.null');
      expect(url.searchParams.get('order')).toBe('created_at.desc');
      expect(headersOf(init).get('accept-profile')).toBe('p2p');
      return json(200, [
        {
          id: 'report-1',
          target_hash: null,
          target_source: null,
          target_user: USER_ID,
          category: 'other',
          reporter_user: 'reporter-1',
          created_at: '2026-11-05T00:00:00Z',
          resolved_at: null,
          resolution: null
        }
      ]);
    });
    const directory = createReportDirectory({ url: 'http://supabase.test', serviceRoleKey: 'service-key', fetch });

    await expect(directory.listOpen()).resolves.toEqual([
      {
        id: 'report-1',
        targetHash: null,
        targetUser: USER_ID,
        sourceUrl: null,
        category: 'other',
        reporterUser: 'reporter-1',
        createdAt: '2026-11-05T00:00:00Z',
        resolvedAt: null,
        resolution: null
      }
    ]);
  });

  it('rejects a failed list request and resolves a report through a filtered patch', async () => {
    const { fetch } = directoryWith((url, init) => {
      if (url.pathname === '/rest/v1/reports' && !init.method) return json(503, {});
      expect(url.pathname).toBe('/rest/v1/reports');
      expect(url.searchParams.get('id')).toBe('eq.report-1');
      expect(init.method).toBe('PATCH');
      expect(headersOf(init).get('content-profile')).toBe('p2p');
      expect(JSON.parse(String(init.body))).toMatchObject({ resolved_by: USER_ID, resolution: 'ignore' });
      return json(200, {});
    });
    const directory = createReportDirectory({ url: 'http://supabase.test', serviceRoleKey: 'service-key', fetch });

    await expect(directory.listOpen()).rejects.toThrow('PostgREST responded 503');
    await expect(directory.resolve('report-1', 'ignore', USER_ID)).resolves.toBe(true);
  });
});

describe('createInviteDirectory', () => {
  it('activates a code and looks up both present and absent activation rows', async () => {
    const { fetch } = directoryWith(url => {
      if (url.pathname.endsWith('/rpc/activate_invite')) return json(200, true);
      if (url.searchParams.get('user_id') === `eq.${USER_ID}`) return json(200, [{ user_id: USER_ID }]);
      return json(200, []);
    });
    const directory = createInviteDirectory({ url: 'http://supabase.test', serviceRoleKey: 'service-key', fetch });

    await expect(directory.activate('invite-code', USER_ID)).resolves.toBe(true);
    await expect(directory.isActivated(USER_ID)).resolves.toBe(true);
    await expect(directory.isActivated('not-activated')).resolves.toBe(false);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('issues codes through the service-role table and returns generated codes', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const { fetch } = directoryWith((url, init) => {
      expect(url.pathname).toBe('/rest/v1/invite_codes');
      expect(init.method).toBe('POST');
      expect(headersOf(init).get('content-profile')).toBe('p2p');
      expect(JSON.parse(String(init.body))).toEqual([
        { code: 'A'.repeat(20), created_by: USER_ID },
        { code: 'A'.repeat(20), created_by: USER_ID }
      ]);
      return json(201, {});
    });
    const directory = createInviteDirectory({ url: 'http://supabase.test', serviceRoleKey: 'service-key', fetch });

    await expect(directory.issueCodes(2, USER_ID)).resolves.toEqual(['A'.repeat(20), 'A'.repeat(20)]);
    random.mockRestore();
  });

  it('rejects failed RPC, activation lookup and invite insert requests', async () => {
    const { fetch } = directoryWith(() => json(503, {}));
    const directory = createInviteDirectory({ url: 'http://supabase.test', serviceRoleKey: 'service-key', fetch });

    await expect(directory.activate('invite-code', USER_ID)).rejects.toThrow('PostgREST responded 503');
    await expect(directory.isActivated(USER_ID)).rejects.toThrow('PostgREST responded 503');
    await expect(directory.issueCodes(1, USER_ID)).rejects.toThrow('PostgREST responded 503');
  });

  it('lists invite state and returns false when a revoke request fails', async () => {
    const { fetch } = directoryWith(url => {
      if (url.searchParams.has('code')) return json(404, {});
      return json(200, [
        {
          code: 'CODE',
          created_at: '2026-11-05T00:00:00Z',
          used_by: USER_ID,
          used_at: '2026-11-06T00:00:00Z',
          revoked_at: null
        }
      ]);
    });
    const directory = createInviteDirectory({ url: 'http://supabase.test', serviceRoleKey: 'service-key', fetch });

    await expect(directory.listCodes()).resolves.toEqual([
      {
        code: 'CODE',
        createdAt: '2026-11-05T00:00:00Z',
        usedBy: USER_ID,
        usedAt: '2026-11-06T00:00:00Z',
        revokedAt: null
      }
    ]);
    await expect(directory.revoke('CODE')).resolves.toBe(false);
    fetch.mockImplementationOnce(async () => json(200, {}));
    await expect(directory.revoke('CODE')).resolves.toBe(true);
  });

  it('rejects a failed invite listing', async () => {
    const { fetch } = directoryWith(() => json(503, {}));
    const directory = createInviteDirectory({ url: 'http://supabase.test', serviceRoleKey: 'service-key', fetch });

    await expect(directory.listCodes()).rejects.toThrow('PostgREST responded 503');
  });
});
