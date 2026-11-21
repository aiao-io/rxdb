import { describe, expect, it, vi } from 'vitest';
import { bindScopedIdentity } from '../remote-backend.js';
import {
  IdentityMismatchError,
  canonicalize,
  filterFingerprint,
  identityFingerprint,
  scopedDatabaseName,
  type ScopedSyncIdentity
} from '../scoped-sync.js';
import { RxDBSyncIdentityBinding } from '../scoped-sync.entity.js';
import type { SyncManager } from '../SyncManager.js';

const makeBinding = (identity: ScopedSyncIdentity) =>
  Object.assign(Object.create(RxDBSyncIdentityBinding.prototype) as RxDBSyncIdentityBinding, {
    id: 'singleton',
    identityKind: identity.kind,
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
  const transaction = vi.fn(async (callback: (executor: { getRepository: () => typeof repository }) => Promise<unknown>) =>
    callback({ getRepository: () => repository })
  );
  const sm = {
    rxdb: {
      entityManager: {
        instantiate: (EntityType: typeof RxDBSyncIdentityBinding) =>
          Object.create(EntityType.prototype) as RxDBSyncIdentityBinding
      },
      syncState: { reportError }
    },
    getRemoteRepositories: vi.fn(async () => ({ adapter: remoteAdapter })),
    getLocalRepositories: vi.fn(async () => ({ adapter: { getRepository: () => repository, transaction } }))
  } as unknown as SyncManager;
  return { sm, repository, remoteAdapter, reportError, rows, transaction };
};

describe('scoped sync identity helpers', () => {
  it('canonicalizes nested values deterministically', () => {
    const left = canonicalize({ b: 2, a: [new Date('2026-01-01T00:00:00.000Z'), null] });
    const right = canonicalize({ a: ['2026-01-01T00:00:00.000Z', null], b: 2 });

    expect(left).toBe(right);
    expect(canonicalize({ b: 2, a: 1 })).toBe(canonicalize({ a: 1, b: 2 }));
  });

  it('为 anon、用户 A 和用户 B 生成稳定且不含原文的指纹', () => {
    const anon = identityFingerprint({ kind: 'anon' });
    const userA = identityFingerprint({ kind: 'user', userId: 'user-a' });
    const userB = identityFingerprint({ kind: 'user', userId: 'user-b' });

    expect(anon).toBe(identityFingerprint({ kind: 'anon' }));
    expect(new Set([anon, userA, userB]).size).toBe(3);
    expect(userA).not.toContain('user-a');
  });

  it('按身份隔离数据库名并拒绝空基础名', () => {
    const anonName = scopedDatabaseName('recipes', { kind: 'anon' });
    const userName = scopedDatabaseName('recipes', { kind: 'user', userId: 'user-a' });

    expect(anonName).not.toBe(userName);
    expect(scopedDatabaseName(' recipes ', { kind: 'user', userId: 'user-a' })).toBe(userName);
    expect(userName).not.toContain('user-a');
    expect(() => scopedDatabaseName('   ', { kind: 'anon' })).toThrow('non-empty base database name');
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
    const harness = createIdentityHarness({ kind: 'anon' });

    await expect(bindScopedIdentity(harness.sm)).resolves.toBeUndefined();

    expect(harness.remoteAdapter.syncIdentity).toHaveBeenCalledTimes(1);
    expect(harness.repository.create).toHaveBeenCalledTimes(1);
    expect(harness.rows[0]).toMatchObject({
      id: 'singleton',
      identityKind: 'anon',
      identityFingerprint: identityFingerprint({ kind: 'anon' })
    });
  });

  it('同一用户刷新令牌后继续使用原库', async () => {
    const identity = { kind: 'user' as const, userId: 'user-a' };
    const harness = createIdentityHarness(identity, makeBinding(identity));

    await expect(bindScopedIdentity(harness.sm)).resolves.toBeUndefined();

    expect(harness.repository.create).not.toHaveBeenCalled();
    expect(harness.reportError).not.toHaveBeenCalled();
  });

  it('身份变化时阻止同步并写入同步错误', async () => {
    const harness = createIdentityHarness(
      { kind: 'user', userId: 'user-b' },
      makeBinding({ kind: 'user', userId: 'user-a' })
    );

    const error = await bindScopedIdentity(harness.sm).catch((rejection: unknown) => rejection);

    expect(error).toBeInstanceOf(IdentityMismatchError);
    expect(error).toMatchObject({ boundIdentityKind: 'user', currentIdentityKind: 'user' });
    expect(harness.reportError).toHaveBeenCalledWith(error);
    expect(harness.repository.create).not.toHaveBeenCalled();
  });

  it('并发首次绑定时以事务内已存在的绑定为准', async () => {
    const repository = {
      find: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([makeBinding({ kind: 'user', userId: 'user-a' })]),
      create: vi.fn()
    };
    const remoteAdapter = { syncIdentity: vi.fn(async () => ({ kind: 'user' as const, userId: 'user-a' })) };
    const sm = {
      rxdb: {
        entityManager: { instantiate: (EntityType: typeof RxDBSyncIdentityBinding) =>
          Object.create(EntityType.prototype) as RxDBSyncIdentityBinding },
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
  });
});
