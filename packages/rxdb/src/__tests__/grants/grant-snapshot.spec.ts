/**
 * @fileoverview US-029 阶段 B — 授权快照的状态、规范化、应用设入与落库（AC#10、11 的核心一侧）。
 *
 * 1. 快照只有两种状态：未取到（判定 fail-closed）/ 已取到；已取到的授权按作用域规范化，内容相同即相等；
 * 2. 应用设入：形状不对当场报错；写进本地库的那一行，之后才发布；内容不变不发，变了只发一次（AC#11）；
 * 3. 从本地库读回：行在就是已取到，读不懂或没有就是未取到（AC#10 的关库重开由 PGlite / SQLite 集成层验证）。
 */

import { firstValueFrom, take, toArray } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SyncType } from '../../entity/metadata-options.interface.js';
import { RxDBGrantSnapshot, type RxDBGrant } from '../../grants/grant-snapshot.js';
import { RXDB_GRANT_STATE_ID, RxDBGrantState } from '../../grants/grant-state.js';
import { RxDB } from '../../RxDB.js';
import { RxDBError, RxDBReadOnlyError } from '../../RxDBError.js';
import { createTestDB, type MockLocalAdapter } from '../fixtures/test-db-setup.js';

const ADMIN_OF_A: RxDBGrant[] = [
  { scope: 'tenant:a', permissions: ['read', 'edit'] },
  { scope: 'tenant:b', permissions: ['read'] }
];

describe('RxDBGrantSnapshot', () => {
  it('未取到：状态 unknown，没有任何授权', () => {
    const snapshot = RxDBGrantSnapshot.UNKNOWN;

    expect(snapshot.status).toBe('unknown');
    expect(snapshot.grants).toEqual([]);
    expect(snapshot.has('tenant:a', 'read')).toBe(false);
  });

  it('已取到：按作用域、权限名排序去重，同一作用域合并，空权限的作用域丢掉', () => {
    const snapshot = RxDBGrantSnapshot.known(
      [
        { scope: 'tenant:b', permissions: ['read'] },
        { scope: 'tenant:a', permissions: ['edit', 'read', 'edit'] },
        { scope: 'tenant:b', permissions: ['manage'] },
        { scope: 'user:u1', permissions: [] }
      ],
      'app',
      new Date(0)
    );

    expect(snapshot.status).toBe('known');
    expect(snapshot.source).toBe('app');
    expect(snapshot.grants).toEqual([
      { scope: 'tenant:a', permissions: ['edit', 'read'] },
      { scope: 'tenant:b', permissions: ['manage', 'read'] }
    ]);
    expect(snapshot.has('tenant:b', 'manage')).toBe(true);
    expect(snapshot.has('tenant:b', 'edit')).toBe(false);
    expect(snapshot.has('user:u1', 'edit')).toBe(false);
  });

  it('作用域按码元排序，与区域设置无关', () => {
    const snapshot = RxDBGrantSnapshot.known(
      [
        { scope: 'tenant:b', permissions: ['read'] },
        { scope: 'tenant:B', permissions: ['read'] },
        { scope: 'tenant:a', permissions: ['read'] }
      ],
      'app',
      new Date(0)
    );

    expect(snapshot.grants.map(grant => grant.scope)).toEqual(['tenant:B', 'tenant:a', 'tenant:b']);
  });

  it('内容相同即相等：不比设入时间；来源或授权不同就不等', () => {
    const first = RxDBGrantSnapshot.known(ADMIN_OF_A, 'app', new Date(0));
    const reordered = RxDBGrantSnapshot.known([...ADMIN_OF_A].reverse(), 'app', new Date(1000));

    expect(first.equals(reordered)).toBe(true);
    expect(first.equals(RxDBGrantSnapshot.known(ADMIN_OF_A, 'remote', new Date(0)))).toBe(false);
    expect(first.equals(RxDBGrantSnapshot.known(ADMIN_OF_A.slice(1), 'app', new Date(0)))).toBe(false);
    expect(first.equals(RxDBGrantSnapshot.UNKNOWN)).toBe(false);
    expect(RxDBGrantSnapshot.known([], 'app', new Date(0)).equals(RxDBGrantSnapshot.UNKNOWN)).toBe(false);
  });

  it('授权数组不受调用方之后的改动影响', () => {
    const input: RxDBGrant[] = [{ scope: 'tenant:a', permissions: ['read'] }];
    const snapshot = RxDBGrantSnapshot.known(input, 'app', new Date(0));

    (input[0].permissions as string[]).push('edit');
    input.push({ scope: 'tenant:z', permissions: ['edit'] });

    expect(snapshot.has('tenant:a', 'edit')).toBe(false);
    expect(snapshot.grants).toHaveLength(1);
    expect(Object.isFrozen(snapshot.grants)).toBe(true);
  });

  it('来源不认识：当场报错', () => {
    expect(() => RxDBGrantSnapshot.known(ADMIN_OF_A, 'jwt' as never, new Date(0))).toThrow(
      /app[\s\S]*remote[\s\S]*jwt/
    );
  });

  it.each([
    ['不是数组', { scope: 'tenant:a', permissions: ['read'] }, /数组/],
    ['元素不是对象', ['tenant:a'], /\[0\]/],
    ['scope 为空串', [{ scope: '', permissions: ['read'] }], /\[0\]\.scope/],
    ['scope 不是字符串', [{ scope: 1, permissions: ['read'] }], /\[0\]\.scope/],
    ['permissions 不是数组', [{ scope: 'tenant:a', permissions: 'read' }], /\[0\]\.permissions/],
    ['权限名为空串', [{ scope: 'tenant:a', permissions: ['read', ''] }], /\[0\]\.permissions/],
    ['未知键', [{ scope: 'tenant:a', permissions: ['read'], role: 'admin' }], /role/]
  ])('授权形状不对：%s 当场报错', (_label, grants, reason) => {
    expect(() => RxDBGrantSnapshot.known(grants as unknown as RxDBGrant[], 'app', new Date(0))).toThrow(RxDBError);
    expect(() => RxDBGrantSnapshot.known(grants as unknown as RxDBGrant[], 'app', new Date(0))).toThrow(reason);
  });
});

describe('RxDBGrants 应用设入（AC#11）', () => {
  let rxdb: RxDB;
  let adapter: MockLocalAdapter;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ rxdb, adapter, cleanup } = await createTestDB({ entities: [] }));
  });

  afterEach(async () => {
    await cleanup();
  });

  it('初始是未取到', () => {
    expect(rxdb.grants.snapshot).toBe(RxDBGrantSnapshot.UNKNOWN);
  });

  it('设入后快照已取到、来源是 app，并在事务里写下那一行', async () => {
    const stateRepository = adapter.stubEntityRepository(RxDBGrantState);

    await rxdb.grants.set(ADMIN_OF_A);

    expect(rxdb.grants.snapshot.status).toBe('known');
    expect(rxdb.grants.snapshot.source).toBe('app');
    expect(rxdb.grants.snapshot.has('tenant:a', 'edit')).toBe(true);
    expect(adapter.transaction).toHaveBeenCalledTimes(1);
    expect(stateRepository.create).toHaveBeenCalledTimes(1);
    expect(stateRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: RXDB_GRANT_STATE_ID, source: 'app', grants: rxdb.grants.snapshot.grants })
    );
  });

  it('那一行已经在：改写它，不再新建', async () => {
    const existing = Object.assign(rxdb.entityManager.instantiate(RxDBGrantState), {
      id: RXDB_GRANT_STATE_ID,
      source: 'app',
      grants: [],
      updatedAt: new Date(0)
    });
    const stateRepository = adapter.stubEntityRepository(RxDBGrantState, [existing]);

    await rxdb.grants.set(ADMIN_OF_A);

    expect(stateRepository.create).not.toHaveBeenCalled();
    expect(stateRepository.update).toHaveBeenCalledWith(
      existing,
      expect.objectContaining({ source: 'app', grants: rxdb.grants.snapshot.grants })
    );
  });

  it('快照事件：内容不变不发，变了只发一次', async () => {
    adapter.stubEntityRepository(RxDBGrantState);
    const events = firstValueFrom(rxdb.grants.snapshot$.pipe(take(3), toArray()));

    await rxdb.grants.set(ADMIN_OF_A);
    await rxdb.grants.set([...ADMIN_OF_A].reverse());
    await rxdb.grants.set([{ scope: 'tenant:a', permissions: ['read'] }]);

    const [initial, granted, revoked] = await events;
    expect(initial).toBe(RxDBGrantSnapshot.UNKNOWN);
    expect(granted.has('tenant:a', 'edit')).toBe(true);
    expect(revoked.has('tenant:a', 'edit')).toBe(false);
  });

  it('写库失败：快照不变，错误原样抛出', async () => {
    const failure = new Error('disk full');
    adapter.transaction.mockRejectedValueOnce(failure);

    await expect(rxdb.grants.set(ADMIN_OF_A)).rejects.toBe(failure);
    expect(rxdb.grants.snapshot).toBe(RxDBGrantSnapshot.UNKNOWN);
  });

  it('形状不对：不碰本地库', async () => {
    await expect(rxdb.grants.set([{ scope: '', permissions: [] }])).rejects.toThrow(RxDBError);
    expect(adapter.transaction).not.toHaveBeenCalled();
  });
});

describe('RxDBGrants 应用设入的前置条件', () => {
  it('只读实例拒绝设入', async () => {
    const { rxdb, adapter, cleanup } = await createTestDB({ entities: [], readOnly: true });
    try {
      await expect(rxdb.grants.set(ADMIN_OF_A)).rejects.toBeInstanceOf(RxDBReadOnlyError);
      expect(adapter.transaction).not.toHaveBeenCalled();
    } finally {
      await cleanup();
    }
  });

  it('没有配置本地适配器：报错指出快照要存进本地库', async () => {
    const rxdb = new RxDB({
      dbName: 'grants-remote-only',
      entities: [],
      sync: { type: SyncType.None, remote: { adapter: 'remote' } }
    });

    await expect(rxdb.grants.set(ADMIN_OF_A)).rejects.toThrow(/本地/);
  });
});

describe('RxDBGrants 从本地库读回（AC#10 核心一侧）', () => {
  let rxdb: RxDB;
  let adapter: MockLocalAdapter;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ rxdb, adapter, cleanup } = await createTestDB({ entities: [] }));
  });

  afterEach(async () => {
    await cleanup();
  });

  const storedRow = (fields: Record<string, unknown>) =>
    Object.assign(rxdb.entityManager.instantiate(RxDBGrantState), {
      id: RXDB_GRANT_STATE_ID,
      updatedAt: new Date(0),
      ...fields
    });

  it('行在：沿用上次的快照', async () => {
    adapter.stubEntityRepository(RxDBGrantState, [storedRow({ source: 'app', grants: ADMIN_OF_A })]);

    await rxdb.grants.load(adapter);

    expect(rxdb.grants.snapshot.status).toBe('known');
    expect(rxdb.grants.snapshot.source).toBe('app');
    expect(rxdb.grants.snapshot.has('tenant:a', 'edit')).toBe(true);
    expect(rxdb.grants.snapshot.has('tenant:b', 'edit')).toBe(false);
  });

  it('没有那一行：未取到', async () => {
    adapter.stubEntityRepository(RxDBGrantState);

    await rxdb.grants.load(adapter);

    expect(rxdb.grants.snapshot).toBe(RxDBGrantSnapshot.UNKNOWN);
  });

  it.each([
    ['来源不认识', { source: 'jwt', grants: ADMIN_OF_A }],
    ['授权形状不对', { source: 'app', grants: [{ scope: '', permissions: ['edit'] }] }]
  ])('%s：按未取到处理（判定 fail-closed，下次设入覆盖它）', async (_label, fields) => {
    adapter.stubEntityRepository(RxDBGrantState, [storedRow(fields)]);

    await rxdb.grants.load(adapter);

    expect(rxdb.grants.snapshot).toBe(RxDBGrantSnapshot.UNKNOWN);
  });
});
