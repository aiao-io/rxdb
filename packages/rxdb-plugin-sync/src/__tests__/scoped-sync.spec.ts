import { RxDB, RxDBIdentityMismatchError, SyncType } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { bindScopedIdentity } from '../remote-backend.js';
import { RxDBSyncIdentityBinding } from '../scoped-sync.entity.js';
import {
  IdentityMismatchError,
  canonicalize,
  filterFingerprint,
  identityFingerprint,
  scopedDatabaseName,
  scopedIdentityKind,
  type ScopedSyncIdentity
} from '../scoped-sync.js';
import type { SyncManager } from '../SyncManager.js';

const SCOPE = 'https://project-a.supabase.co';
const anon = (): ScopedSyncIdentity => ({ scope: SCOPE, subject: 'anon' });
const user = (subject: string, scope = SCOPE): ScopedSyncIdentity => ({ scope, subject });

const makeBinding = (identity: ScopedSyncIdentity) =>
  Object.assign(Object.create(RxDBSyncIdentityBinding.prototype) as RxDBSyncIdentityBinding, {
    id: 'singleton',
    identityKind: scopedIdentityKind(identity),
    identityFingerprint: identityFingerprint(identity),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z')
  });

const createIdentityHarness = (identity: ScopedSyncIdentity, existing?: RxDBSyncIdentityBinding) => {
  const rows = existing ? [existing] : [];
  const repository = {
    find: vi.fn(async () => rows),
    create: vi.fn(async (row: RxDBSyncIdentityBinding) => {
      rows.push(row);
      return row;
    })
  };
  const remoteAdapter = {
    syncIdentity: vi.fn(async () => identity)
  };
  const reportError = vi.fn();
  // 每个事务的 executor：核心的身份水位必须写进插件绑定行所在的同一个事务
  const executors: { getRepository: () => typeof repository }[] = [];
  const transaction = vi.fn(
    async (callback: (executor: { getRepository: () => typeof repository }) => Promise<unknown>) => {
      const executor = { getRepository: () => repository };
      executors.push(executor);
      return callback(executor);
    }
  );
  // 核心按身份写 rxdb_migration 水位行的入口；行为本体在核心的 identity-binding.connect.spec.ts
  const bindIdentity = vi.fn<(executor: unknown, identity: ScopedSyncIdentity) => Promise<void>>(async () => undefined);
  const sm = {
    rxdb: {
      // 没有声明 RxDBOptions.identity：核心的会话核对什么都不做
      assertCallerIdentity: vi.fn(async () => undefined),
      bindIdentity,
      entityManager: {
        instantiate: (EntityType: typeof RxDBSyncIdentityBinding) =>
          Object.create(EntityType.prototype) as RxDBSyncIdentityBinding
      },
      syncState: { reportError }
    },
    getRemoteRepositories: vi.fn(async () => ({ adapter: remoteAdapter })),
    getLocalRepositories: vi.fn(async () => ({ adapter: { getRepository: () => repository, transaction } }))
  } as unknown as SyncManager;
  return { sm, repository, remoteAdapter, reportError, rows, transaction, executors, bindIdentity };
};

/** 声明了身份的宿主：会话核对用真实 RxDB 的 assertCallerIdentity，本地库是内存里的一张绑定表 */
const createDeclaredIdentityHarness = (declared: ScopedSyncIdentity) => {
  const rxdb = new RxDB({
    dbName: `scoped-identity-${crypto.randomUUID().slice(0, 8)}`,
    entities: [],
    sync: { type: SyncType.None },
    identity: declared
  });
  let session = declared;
  const rows: RxDBSyncIdentityBinding[] = [];
  const repository = {
    find: vi.fn(async () => rows),
    create: vi.fn(async (row: RxDBSyncIdentityBinding) => {
      rows.push(row);
      return row;
    })
  };
  const remoteAdapter = {
    syncIdentity: vi.fn(async () => session),
    callerIdentity: vi.fn(async () => session)
  };
  const sm = {
    rxdb: {
      assertCallerIdentity: (remote: never) => rxdb.assertCallerIdentity(remote),
      bindIdentity: vi.fn(async () => undefined),
      entityManager: {
        instantiate: (EntityType: typeof RxDBSyncIdentityBinding) =>
          Object.create(EntityType.prototype) as RxDBSyncIdentityBinding
      },
      syncState: rxdb.syncState
    },
    getRemoteRepositories: vi.fn(async () => ({ adapter: remoteAdapter })),
    getLocalRepositories: vi.fn(async () => ({
      adapter: {
        getRepository: () => repository,
        transaction: async (callback: (executor: { getRepository: () => typeof repository }) => Promise<unknown>) =>
          callback({ getRepository: () => repository })
      }
    }))
  } as unknown as SyncManager;
  return {
    sm,
    rows,
    remoteAdapter,
    syncState: rxdb.syncState,
    switchSession: (next: ScopedSyncIdentity) => {
      session = next;
    }
  };
};

describe('scoped sync identity helpers', () => {
  it('canonicalizes nested values deterministically', () => {
    const left = canonicalize({ b: 2, a: [new Date('2026-01-01T00:00:00.000Z'), null] });
    const right = canonicalize({ a: ['2026-01-01T00:00:00.000Z', null], b: 2 });

    expect(left).toBe(right);
    expect(canonicalize({ b: 2, a: 1 })).toBe(canonicalize({ a: 1, b: 2 }));
  });

  it('为 anon、用户 A 和用户 B 生成稳定且不含原文的指纹', () => {
    const anonFingerprint = identityFingerprint(anon());
    const userA = identityFingerprint(user('user-a'));
    const userB = identityFingerprint(user('user-b'));

    expect(anonFingerprint).toBe(identityFingerprint(anon()));
    expect(new Set([anonFingerprint, userA, userB]).size).toBe(3);
    expect(userA).not.toContain('user-a');
  });

  it('按身份隔离数据库名并拒绝空基础名', () => {
    const anonName = scopedDatabaseName('recipes', anon());
    const userName = scopedDatabaseName('recipes', user('user-a'));

    expect(anonName).not.toBe(userName);
    expect(scopedDatabaseName(' recipes ', user('user-a'))).toBe(userName);
    expect(userName).not.toContain('user-a');
    expect(() => scopedDatabaseName('   ', anon())).toThrow('non-empty base database name');
  });

  it('插件的身份指纹与核心的身份键同一编码：核心报身份不匹配时给出的键，就是插件算出的指纹', async () => {
    const rxdb = new RxDB({
      dbName: `fingerprint-${crypto.randomUUID().slice(0, 8)}`,
      entities: [],
      sync: { type: SyncType.None },
      identity: user('user-a')
    });

    const error = await rxdb
      .assertCallerIdentity({ callerIdentity: async () => user('user-b') })
      .catch((rejection: unknown) => rejection);

    expect(error).toBeInstanceOf(RxDBIdentityMismatchError);
    expect(error).toMatchObject({
      clientKey: identityFingerprint(user('user-a')),
      foundKeys: [identityFingerprint(user('user-b'))]
    });
    expect(scopedDatabaseName('notes', user('user-a'))).toBe(
      `notes-${identityFingerprint(user('user-a')).slice(0, 16)}`
    );
  });

  it('为条件范围生成顺序稳定且可区分的指纹', () => {
    const first = { combinator: 'and' as const, rules: [{ field: 'tenantId', operator: '=', value: 'tenant-1' }] };
    const same = { combinator: 'and' as const, rules: [{ value: 'tenant-1', operator: '=', field: 'tenantId' }] };
    const different = { combinator: 'and' as const, rules: [{ field: 'tenantId', operator: '=', value: 'tenant-2' }] };

    expect(filterFingerprint(first)).toBe(filterFingerprint(same));
    expect(filterFingerprint(first)).not.toBe(filterFingerprint(different));
    expect(filterFingerprint(undefined)).toBe('all');
  });
});

describe('bindScopedIdentity', () => {
  it('首次交换数据时绑定身份摘要', async () => {
    const harness = createIdentityHarness(anon());

    await expect(bindScopedIdentity(harness.sm)).resolves.toBeUndefined();

    expect(harness.remoteAdapter.syncIdentity).toHaveBeenCalledTimes(1);
    expect(harness.repository.create).toHaveBeenCalledTimes(1);
    expect(harness.rows[0]).toMatchObject({
      id: 'singleton',
      identityKind: 'anon',
      identityFingerprint: identityFingerprint(anon())
    });
  });

  it('同一用户刷新令牌后继续使用原库', async () => {
    const identity = user('user-a');
    const harness = createIdentityHarness(identity, makeBinding(identity));

    await expect(bindScopedIdentity(harness.sm)).resolves.toBeUndefined();

    expect(harness.repository.create).not.toHaveBeenCalled();
    expect(harness.reportError).not.toHaveBeenCalled();
    // 已有插件绑定只核对：本修复之前写下、缺核心水位的开发库不回填（未发布，见 RV-01a2118227d9715ab33e8ef2556bb4b6）
    expect(harness.bindIdentity).not.toHaveBeenCalled();
  });

  it('身份变化时阻止同步并写入同步错误', async () => {
    const harness = createIdentityHarness(user('user-b'), makeBinding(user('user-a')));

    const error = await bindScopedIdentity(harness.sm).catch((rejection: unknown) => rejection);

    expect(error).toBeInstanceOf(IdentityMismatchError);
    expect(error).toMatchObject({ boundIdentityKind: 'user', currentIdentityKind: 'user' });
    expect(harness.reportError).toHaveBeenCalledWith(error);
    expect(harness.repository.create).not.toHaveBeenCalled();
  });

  it('身份不匹配是核心 RxDBIdentityMismatchError 的子类：应用按核心的类 catch 就能接住', async () => {
    const harness = createIdentityHarness(anon(), makeBinding(user('user-a')));

    const error = await bindScopedIdentity(harness.sm).catch((rejection: unknown) => rejection);

    expect(error).toBeInstanceOf(RxDBIdentityMismatchError);
    expect(error).toMatchObject({
      source: 'database',
      clientKey: identityFingerprint(anon()),
      foundKeys: [identityFingerprint(user('user-a'))],
      boundIdentityKind: 'user',
      currentIdentityKind: 'anon'
    });
  });

  it('并发首次绑定时以事务内已存在的绑定为准', async () => {
    const repository = {
      find: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([makeBinding(user('user-a'))]),
      create: vi.fn()
    };
    const remoteAdapter = { syncIdentity: vi.fn(async () => user('user-a')) };
    const bindIdentity = vi.fn(async () => undefined);
    const sm = {
      rxdb: {
        assertCallerIdentity: vi.fn(async () => undefined),
        bindIdentity,
        entityManager: {
          instantiate: (EntityType: typeof RxDBSyncIdentityBinding) =>
            Object.create(EntityType.prototype) as RxDBSyncIdentityBinding
        },
        syncState: { reportError: vi.fn() }
      },
      getRemoteRepositories: vi.fn(async () => ({ adapter: remoteAdapter })),
      getLocalRepositories: vi.fn(async () => ({
        adapter: {
          getRepository: () => repository,
          transaction: async (callback: (executor: { getRepository: () => typeof repository }) => Promise<unknown>) =>
            callback({ getRepository: () => repository })
        }
      }))
    } as unknown as SyncManager;

    await expect(bindScopedIdentity(sm)).resolves.toBeUndefined();
    expect(repository.create).not.toHaveBeenCalled();
    expect(bindIdentity).not.toHaveBeenCalled();
  });

  // RV-01a2118227d9715ab33e8ef2556bb4b6：只写插件这一行，应用之后改为声明身份打开同一个库时核心看不到绑定，
  // 会把装着这个会话数据的库就地绑给打开它的那个身份
  it('第一次按会话绑定：核心的身份水位与插件绑定行写在同一个事务里，核心那一行先写', async () => {
    const harness = createIdentityHarness(user('user-a'));

    await expect(bindScopedIdentity(harness.sm)).resolves.toBeUndefined();

    expect(harness.bindIdentity).toHaveBeenCalledTimes(1);
    expect(harness.bindIdentity).toHaveBeenCalledWith(harness.executors[0], user('user-a'));
    expect(harness.bindIdentity.mock.invocationCallOrder[0]).toBeLessThan(
      harness.repository.create.mock.invocationCallOrder[0]
    );
  });

  it('库已绑定别的身份（曾以别的身份声明打开）：拒绝并写入同步错误，插件绑定一行不写', async () => {
    const harness = createIdentityHarness(user('user-b'));
    const mismatch = new RxDBIdentityMismatchError('database', identityFingerprint(user('user-b')), [
      identityFingerprint(user('user-a'))
    ]);
    harness.bindIdentity.mockRejectedValueOnce(mismatch);

    const error = await bindScopedIdentity(harness.sm).catch((rejection: unknown) => rejection);

    expect(error).toBe(mismatch);
    expect(harness.reportError).toHaveBeenCalledWith(mismatch);
    expect(harness.repository.create).not.toHaveBeenCalled();
  });

  it('核心写水位时的其他错误原样抛出，不写进同步面板', async () => {
    const harness = createIdentityHarness(user('user-a'));
    const failure = new Error('disk full');
    harness.bindIdentity.mockRejectedValueOnce(failure);

    await expect(bindScopedIdentity(harness.sm)).rejects.toBe(failure);
    expect(harness.reportError).not.toHaveBeenCalled();
    expect(harness.repository.create).not.toHaveBeenCalled();
  });

  it('并发首次绑定时别的身份抢先写下了绑定：拒绝并写入同步错误', async () => {
    const harness = createIdentityHarness(user('user-b'));
    harness.repository.find.mockResolvedValueOnce([]).mockResolvedValueOnce([makeBinding(user('user-a'))]);

    const error = await bindScopedIdentity(harness.sm).catch((rejection: unknown) => rejection);

    expect(error).toBeInstanceOf(IdentityMismatchError);
    expect(harness.reportError).toHaveBeenCalledWith(error);
    expect(harness.repository.create).not.toHaveBeenCalled();
  });
});

describe('bindScopedIdentity：声明了 RxDBOptions.identity', () => {
  it('会话不是声明的身份：先拒绝，一行绑定都不写；换回声明的身份之后照常绑定并同步', async () => {
    const harness = createDeclaredIdentityHarness(user('user-a'));
    harness.switchSession(user('user-b'));

    const error = await bindScopedIdentity(harness.sm).catch((rejection: unknown) => rejection);

    expect(error).toBeInstanceOf(RxDBIdentityMismatchError);
    expect(error).not.toBeInstanceOf(IdentityMismatchError);
    expect(harness.rows).toEqual([]);
    expect(harness.remoteAdapter.syncIdentity).not.toHaveBeenCalled();
    expect(harness.syncState.snapshot.lastError).toBe(error);

    harness.switchSession(user('user-a'));
    await expect(bindScopedIdentity(harness.sm)).resolves.toBeUndefined();
    expect(harness.rows).toEqual([
      expect.objectContaining({ identityFingerprint: identityFingerprint(user('user-a')) })
    ]);
  });
});
