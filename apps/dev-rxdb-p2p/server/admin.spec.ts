// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type {
  AdminAccountPage,
  AdminBanResult,
  AdminDeleteAccountResult,
  AdminKickResult,
  AdminOnlineDevice,
  AdminSelf,
  AdminServerFiles
} from '../shared/admin-protocol';
import type { SignalingPeer } from '../shared/signaling-protocol';
import { handleAdminRequest, type AdminRouteDeps } from './admin';
import { AdminConfigError } from './admin-config';
import type { AdminRoom } from './admin-room';
import { AccountNotFoundError, type AdminDirectory } from './admin-supabase';
import type { R2BucketLike } from './runtime';

const ROOT = '9a1d3c52-7b0e-4d0f-8f4a-5b2c1e0d9f01';
const SECOND_ADMIN = '3c5e7a90-1b2d-4e6f-9a8b-0c1d2e3f4a5b';
const ALICE = '6f1c5d1e-4c7b-4f7e-9a51-2d0c3b8f9a10';
const BOB = '0b9d8c7a-6e5f-4a3b-8c2d-1e0f9a8b7c6d';
const BOB_DEVICE = 'd4c3b2a1-0f9e-4d8c-b7a6-5f4e3d2c1b0a';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

const peer = (name: string, userId: string, deviceId: string): SignalingPeer => ({
  key: `instance-${name}`,
  principal: userId,
  userName: `${name}@example.com`,
  deviceId,
  deviceName: `${name}'s computer`
});

const harness = (overrides: { config?: () => ReturnType<AdminRouteDeps['config']> } = {}) => {
  const directory = {
    listAccounts: vi.fn(async () => ({
      total: 120,
      users: [
        {
          id: ALICE,
          email: 'alice@example.com',
          createdAt: '2026-11-01T00:00:00Z',
          lastSignInAt: '2026-11-04T00:00:00Z',
          bannedUntil: null
        },
        {
          id: BOB,
          email: 'bob@example.com',
          createdAt: '2026-11-02T00:00:00Z',
          lastSignInAt: null,
          bannedUntil: '2999-01-01T00:00:00Z'
        },
        {
          id: ROOT,
          email: 'root@example.com',
          createdAt: '2026-10-01T00:00:00Z',
          lastSignInAt: '2026-11-05T00:00:00Z',
          bannedUntil: null
        }
      ]
    })),
    accountStats: vi.fn(async () => [{ userId: ALICE, deviceCount: 2, claimCount: 5 }]),
    fileCatalog: vi.fn(async () => [{ contentHash: HASH_A, fileName: '报告.pdf', holderCount: 3 }]),
    setBanned: vi.fn(async () => undefined),
    purgeAccount: vi.fn(async () => 3),
    deleteAccount: vi.fn(async () => undefined)
  } satisfies AdminDirectory;
  const room = {
    roster: vi.fn(async () => [
      peer('bob', BOB, BOB_DEVICE),
      peer('alice', ALICE, 'device-alice-0000-0000-0000-000000000001')
    ]),
    evict: vi.fn(async () => 1)
  } satisfies AdminRoom;
  const bucket = {
    head: vi.fn(async (key: string) => (key === `files/${HASH_A}` ? { size: 10 } : null)),
    get: vi.fn(async () => null),
    put: vi.fn(async () => undefined),
    list: vi.fn(async () => ({
      truncated: true,
      objects: [
        { key: `files/${HASH_B}`, size: 200, uploaded: new Date('2026-11-03T00:00:00Z') },
        { key: `files/${HASH_A}`, size: 100, uploaded: new Date('2026-11-04T00:00:00Z') },
        { key: 'files/not-a-hash', size: 1, uploaded: new Date('2026-11-05T00:00:00Z') }
      ]
    })),
    delete: vi.fn(async () => undefined)
  } satisfies R2BucketLike;
  const identities: Record<string, { id: string; email: string }> = {
    'root-token': { id: ROOT, email: 'root@example.com' },
    'alice-token': { id: ALICE, email: 'alice@example.com' },
    'loud-root-token': { id: ROOT.toUpperCase(), email: 'root@example.com' }
  };
  const reports = {
    listOpen: vi.fn(async () => []),
    submit: vi.fn(async () => ({ created: true })),
    resolve: vi.fn(async () => true)
  } satisfies AdminRouteDeps['reports'];
  const invites = {
    activate: vi.fn(async () => true),
    isActivated: vi.fn(async () => false),
    issueCodes: vi.fn(async () => ['CODE123']),
    revoke: vi.fn(async () => true),
    listCodes: vi.fn(async () => [])
  } satisfies AdminRouteDeps['invites'];
  const deps: AdminRouteDeps = {
    verifyUser: vi.fn(async token => identities[token] ?? null),
    config: overrides.config ?? (() => ({ adminIds: new Set([ROOT, SECOND_ADMIN]), directory })),
    room,
    bucket,
    reports,
    invites
  };
  const call = (method: string, path: string, token: string | null = 'root-token'): Promise<Response> =>
    handleAdminRequest(
      new Request(`https://worker.test/api/admin${path}`, {
        method,
        headers: token ? { authorization: `Bearer ${token}` } : {}
      }),
      deps
    );
  return { call, deps, directory, room, bucket, reports, invites };
};

const bodyOf = async <T>(response: Response): Promise<T> => (await response.json()) as T;

describe('access control', () => {
  it.each([
    ['no token', null],
    ['an unknown token', 'forged-token']
  ])('answers %s with 401 and touches nothing', async (_label, token) => {
    const { call, directory, room, bucket } = harness();

    const response = await call('GET', '/accounts', token);

    expect(response.status).toBe(401);
    expect(directory.listAccounts).not.toHaveBeenCalled();
    expect(room.roster).not.toHaveBeenCalled();
    expect(bucket.list).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', '/accounts'],
    ['POST', `/accounts/${BOB}/ban`],
    ['POST', `/accounts/${BOB}/unban`],
    ['DELETE', `/accounts/${BOB}`],
    ['GET', '/online'],
    ['POST', `/devices/${BOB_DEVICE}/kick`],
    ['GET', '/files'],
    ['DELETE', `/files/${HASH_A}`],
    ['GET', '/unknown']
  ])('keeps a signed-in user who is not an administrator out of %s %s', async (method, path) => {
    const { call, directory, room, bucket } = harness();

    const response = await call(method, path, 'alice-token');

    expect(response.status).toBe(403);
    expect(directory.setBanned).not.toHaveBeenCalled();
    expect(directory.purgeAccount).not.toHaveBeenCalled();
    expect(directory.deleteAccount).not.toHaveBeenCalled();
    expect(room.evict).not.toHaveBeenCalled();
    expect(bucket.delete).not.toHaveBeenCalled();
  });

  it('matches the administrator list regardless of the case of the user id', async () => {
    const { call } = harness();

    expect((await call('GET', '/online', 'loud-root-token')).status).toBe(200);
  });

  it('reports a missing configuration as 503 with the reason, not as a refusal or a pass', async () => {
    const { call, directory } = harness({
      config: () => {
        throw new AdminConfigError('admin console is not configured: ADMIN_USER_IDS is missing');
      }
    });

    const response = await call('GET', '/accounts');

    expect(response.status).toBe(503);
    await expect(bodyOf<{ error: string }>(response)).resolves.toEqual({
      error: 'admin console is not configured: ADMIN_USER_IDS is missing'
    });
    expect(directory.listAccounts).not.toHaveBeenCalled();
  });

  it('reports an unreachable auth host as 502', async () => {
    const { call, deps } = harness();
    vi.mocked(deps.verifyUser).mockRejectedValueOnce(new Error('Supabase Auth responded 503'));

    const response = await call('GET', '/accounts');

    expect(response.status).toBe(502);
    await expect(bodyOf<{ error: string }>(response)).resolves.toEqual({ error: 'Supabase Auth responded 503' });
  });

  it('answers an unknown path with 404 and a wrong method with 405 for administrators', async () => {
    const { call } = harness();

    expect((await call('GET', '/unknown')).status).toBe(404);
    const wrongMethod = await call('PUT', '/accounts');
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get('allow')).toBe('GET');
  });
});

describe('GET /api/admin/me', () => {
  it.each([
    ['an administrator', 'root-token', true],
    ['a regular user', 'alice-token', false]
  ])('tells %s whether they are an administrator', async (_label, token, admin) => {
    const { call } = harness();

    const response = await call('GET', '/me', token);

    expect(response.status).toBe(200);
    await expect(bodyOf<AdminSelf>(response)).resolves.toEqual({ admin });
  });

  it('says no — not an error — when the console is not configured', async () => {
    const { call } = harness({
      config: () => {
        throw new AdminConfigError('admin console is not configured');
      }
    });

    const response = await call('GET', '/me');

    expect(response.status).toBe(200);
    await expect(bodyOf<AdminSelf>(response)).resolves.toEqual({ admin: false });
  });

  it('still requires a valid token and only answers GET', async () => {
    const { call } = harness();

    expect((await call('GET', '/me', null)).status).toBe(401);
    expect((await call('POST', '/me')).status).toBe(405);
  });
});

describe('GET /api/admin/accounts', () => {
  it('joins Supabase users with their device and claim counts', async () => {
    const { call, directory } = harness();

    const response = await call('GET', '/accounts?page=2');

    expect(response.status).toBe(200);
    expect(directory.listAccounts).toHaveBeenCalledWith(2);
    await expect(bodyOf<AdminAccountPage>(response)).resolves.toEqual({
      total: 120,
      page: 2,
      accounts: [
        {
          id: ALICE,
          email: 'alice@example.com',
          createdAt: '2026-11-01T00:00:00Z',
          lastSignInAt: '2026-11-04T00:00:00Z',
          banned: false,
          admin: false,
          deviceCount: 2,
          claimCount: 5
        },
        {
          id: BOB,
          email: 'bob@example.com',
          createdAt: '2026-11-02T00:00:00Z',
          lastSignInAt: null,
          banned: true,
          admin: false,
          deviceCount: 0,
          claimCount: 0
        },
        {
          id: ROOT,
          email: 'root@example.com',
          createdAt: '2026-10-01T00:00:00Z',
          lastSignInAt: '2026-11-05T00:00:00Z',
          banned: false,
          admin: true,
          deviceCount: 0,
          claimCount: 0
        }
      ]
    });
  });

  it('starts at page 1 and rejects a page that is not a positive integer', async () => {
    const { call, directory } = harness();

    await call('GET', '/accounts');
    expect(directory.listAccounts).toHaveBeenLastCalledWith(1);
    for (const page of ['0', '-1', 'x', '1.5', '']) {
      expect((await call('GET', `/accounts?page=${page}`)).status).toBe(400);
    }
  });
});

describe('GET /api/admin/online', () => {
  it('lists the devices connected to signaling, grouped by account', async () => {
    const { call } = harness();

    const response = await call('GET', '/online');

    await expect(bodyOf<{ devices: AdminOnlineDevice[] }>(response)).resolves.toEqual({
      devices: [
        {
          deviceId: 'device-alice-0000-0000-0000-000000000001',
          deviceName: "alice's computer",
          userId: ALICE,
          userName: 'alice@example.com',
          instanceKey: 'instance-alice'
        },
        {
          deviceId: BOB_DEVICE,
          deviceName: "bob's computer",
          userId: BOB,
          userName: 'bob@example.com',
          instanceKey: 'instance-bob'
        }
      ]
    });
  });
});

describe('GET /api/admin/files', () => {
  it('lists server copies newest first, named from the manifest, and flags a truncated listing', async () => {
    const { call, bucket } = harness();

    const response = await call('GET', '/files');

    expect(bucket.list).toHaveBeenCalledWith({ prefix: 'files/', limit: 1000 });
    await expect(bodyOf<AdminServerFiles>(response)).resolves.toEqual({
      truncated: true,
      totalBytes: 300,
      files: [
        {
          contentHash: HASH_A,
          fileName: '报告.pdf',
          size: 100,
          uploadedAt: '2026-11-04T00:00:00.000Z',
          holderCount: 3
        },
        { contentHash: HASH_B, fileName: null, size: 200, uploadedAt: '2026-11-03T00:00:00.000Z', holderCount: 0 }
      ]
    });
  });
});

describe('POST /api/admin/accounts/:id/ban', () => {
  it('bans the account first and then disconnects its devices', async () => {
    const { call, directory, room } = harness();

    const response = await call('POST', `/accounts/${BOB}/ban`);

    expect(response.status).toBe(200);
    await expect(bodyOf<AdminBanResult>(response)).resolves.toEqual({ evictedDevices: 1 });
    expect(directory.setBanned).toHaveBeenCalledWith(BOB, true);
    expect(room.evict).toHaveBeenCalledWith({ userId: BOB });
    expect(vi.mocked(directory.setBanned).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(room.evict).mock.invocationCallOrder[0]!
    );
  });

  it.each([
    ['yourself', ROOT, 'administrators cannot ban or delete their own account'],
    ['another administrator', SECOND_ADMIN, 'administrator accounts are managed outside the console']
  ])('refuses to ban %s', async (_label, target, error) => {
    const { call, directory, room } = harness();

    const response = await call('POST', `/accounts/${target}/ban`);

    expect(response.status).toBe(409);
    await expect(bodyOf<{ error: string }>(response)).resolves.toEqual({ error });
    expect(directory.setBanned).not.toHaveBeenCalled();
    expect(room.evict).not.toHaveBeenCalled();
  });

  it('rejects an id that is not a user id and names an account that does not exist', async () => {
    const { call, directory } = harness();

    expect((await call('POST', '/accounts/not-a-uuid/ban')).status).toBe(400);
    expect(directory.setBanned).not.toHaveBeenCalled();
    vi.mocked(directory.setBanned).mockRejectedValueOnce(new AccountNotFoundError(BOB));
    expect((await call('POST', `/accounts/${BOB}/ban`)).status).toBe(404);
  });

  it('reports a disconnect failure after the ban took effect', async () => {
    const { call, directory, room } = harness();
    vi.mocked(room.evict).mockRejectedValueOnce(new Error('signaling room responded 500'));

    const response = await call('POST', `/accounts/${BOB}/ban`);

    expect(response.status).toBe(502);
    expect(directory.setBanned).toHaveBeenCalledWith(BOB, true);
  });
});

describe('POST /api/admin/accounts/:id/unban', () => {
  it('lifts the ban without touching connections', async () => {
    const { call, directory, room } = harness();

    const response = await call('POST', `/accounts/${BOB}/unban`);

    expect(response.status).toBe(204);
    expect(directory.setBanned).toHaveBeenCalledWith(BOB, false);
    expect(room.evict).not.toHaveBeenCalled();
  });

  it('rejects an id that is not a user id', async () => {
    const { call } = harness();

    expect((await call('POST', '/accounts/nope/unban')).status).toBe(400);
  });
});

describe('DELETE /api/admin/accounts/:id', () => {
  it('purges the account data, disconnects its devices and only then deletes the account', async () => {
    const { call, directory, room } = harness();

    const response = await call('DELETE', `/accounts/${BOB}`);

    expect(response.status).toBe(200);
    await expect(bodyOf<AdminDeleteAccountResult>(response)).resolves.toEqual({ purgedClaims: 3, evictedDevices: 1 });
    const order = [
      vi.mocked(directory.purgeAccount).mock.invocationCallOrder[0]!,
      vi.mocked(room.evict).mock.invocationCallOrder[0]!,
      vi.mocked(directory.deleteAccount).mock.invocationCallOrder[0]!
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(directory.purgeAccount).toHaveBeenCalledWith(BOB);
    expect(room.evict).toHaveBeenCalledWith({ userId: BOB });
    expect(directory.deleteAccount).toHaveBeenCalledWith(BOB);
  });

  it.each([
    ['yourself', ROOT],
    ['another administrator', SECOND_ADMIN]
  ])('refuses to delete %s', async (_label, target) => {
    const { call, directory, room } = harness();

    expect((await call('DELETE', `/accounts/${target}`)).status).toBe(409);
    expect(directory.purgeAccount).not.toHaveBeenCalled();
    expect(room.evict).not.toHaveBeenCalled();
    expect(directory.deleteAccount).not.toHaveBeenCalled();
  });

  it('stops at the first failing step so a retry starts from a safe state', async () => {
    const failing = harness();
    vi.mocked(failing.directory.purgeAccount).mockRejectedValueOnce(new Error('PostgREST responded 404: no function'));
    const purge = await failing.call('DELETE', `/accounts/${BOB}`);
    expect(purge.status).toBe(502);
    await expect(bodyOf<{ error: string }>(purge)).resolves.toEqual({ error: 'PostgREST responded 404: no function' });
    expect(failing.room.evict).not.toHaveBeenCalled();
    expect(failing.directory.deleteAccount).not.toHaveBeenCalled();

    const disconnect = harness();
    vi.mocked(disconnect.room.evict).mockRejectedValueOnce(new Error('signaling room responded 500'));
    expect((await disconnect.call('DELETE', `/accounts/${BOB}`)).status).toBe(502);
    expect(disconnect.directory.deleteAccount).not.toHaveBeenCalled();
  });

  it('rejects a malformed id and names an account that is already gone', async () => {
    const { call, directory } = harness();

    expect((await call('DELETE', '/accounts/not-a-uuid')).status).toBe(400);
    vi.mocked(directory.deleteAccount).mockRejectedValueOnce(new AccountNotFoundError(BOB));
    expect((await call('DELETE', `/accounts/${BOB}`)).status).toBe(404);
  });
});

describe('POST /api/admin/devices/:id/kick', () => {
  it('disconnects the device and reports how many connections closed', async () => {
    const { call, room } = harness();
    vi.mocked(room.evict).mockResolvedValueOnce(2);

    const response = await call('POST', `/devices/${BOB_DEVICE}/kick`);

    expect(response.status).toBe(200);
    await expect(bodyOf<AdminKickResult>(response)).resolves.toEqual({ evictedDevices: 2 });
    expect(room.evict).toHaveBeenCalledWith({ deviceId: BOB_DEVICE });
  });

  it('says so when the device is no longer online', async () => {
    const { call, room } = harness();
    vi.mocked(room.evict).mockResolvedValueOnce(0);

    const response = await call('POST', `/devices/${BOB_DEVICE}/kick`);

    expect(response.status).toBe(404);
    await expect(bodyOf<{ error: string }>(response)).resolves.toEqual({ error: 'device is not online' });
  });

  it('rejects an id that is not a device id', async () => {
    const { call, room } = harness();

    expect((await call('POST', '/devices/nope/kick')).status).toBe(400);
    expect(room.evict).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/files/:hash', () => {
  it('deletes the server copy and leaves the manifest alone', async () => {
    const { call, bucket, directory } = harness();

    const response = await call('DELETE', `/files/${HASH_A}`);

    expect(response.status).toBe(204);
    expect(bucket.delete).toHaveBeenCalledWith(`files/${HASH_A}`);
    expect(directory.purgeAccount).not.toHaveBeenCalled();
  });

  it('answers 404 for a copy that does not exist and 400 for a malformed hash', async () => {
    const { call, bucket } = harness();

    expect((await call('DELETE', `/files/${HASH_B}`)).status).toBe(404);
    expect((await call('DELETE', '/files/NOT-A-HASH')).status).toBe(400);
    expect(bucket.delete).not.toHaveBeenCalled();
  });
});

describe('治理路由（POOL-US-102）', () => {
  const REPORT = '11111111-1111-4111-8111-111111111111';

  it('按封禁处置举报：封禁账号、踢在线设备、关闭举报', async () => {
    const h = harness();
    vi.mocked(h.reports.listOpen).mockResolvedValue([
      {
        id: REPORT,
        targetHash: null,
        targetUser: ALICE,
        sourceUrl: null,
        category: 'harassment',
        reporterUser: BOB,
        createdAt: '2026-11-05T00:00:00Z',
        resolvedAt: null,
        resolution: null
      }
    ]);

    const response = await h.call('POST', `/reports/${REPORT}/resolve?resolution=ban`);

    expect(response.status).toBe(204);
    expect(h.directory.setBanned).toHaveBeenCalledWith(ALICE, true);
    expect(h.room.evict).toHaveBeenCalledWith({ userId: ALICE });
    expect(h.reports.resolve).toHaveBeenCalledWith(REPORT, 'ban', ROOT);
  });

  it('按删除副本处置举报：按 sourceUrl 删除密文副本并关闭举报', async () => {
    const h = harness();
    vi.mocked(h.reports.listOpen).mockResolvedValue([
      {
        id: REPORT,
        targetHash: HASH_A,
        targetUser: null,
        sourceUrl: `/api/files/enc/${HASH_B}`,
        category: 'malware',
        reporterUser: BOB,
        createdAt: '2026-11-05T00:00:00Z',
        resolvedAt: null,
        resolution: null
      }
    ]);

    const response = await h.call('POST', `/reports/${REPORT}/resolve?resolution=delete_copy`);

    expect(response.status).toBe(204);
    expect(h.bucket.delete).toHaveBeenCalledWith(`files/enc/${HASH_B}`);
    expect(h.reports.resolve).toHaveBeenCalledWith(REPORT, 'delete_copy', ROOT);
  });

  it('发码与作废', async () => {
    const h = harness();

    const issued = await h.call('POST', '/invites?count=3');
    expect(issued.status).toBe(201);
    expect(h.invites.issueCodes).toHaveBeenCalledWith(3, ROOT);

    const revoked = await h.call('DELETE', '/invites/CODE1234567890ABCDE');
    expect(revoked.status).toBe(204);
    expect(h.invites.revoke).toHaveBeenCalledWith('CODE1234567890ABCDE');
  });
});
