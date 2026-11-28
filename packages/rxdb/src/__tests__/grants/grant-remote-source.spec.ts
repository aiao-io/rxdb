/**
 * @fileoverview US-029 阶段 C — 授权快照的远端来源（核心一侧；Supabase 真栈见适配器包）。
 *
 * 1. 来源规则：有实体声明了作用域、且远端适配器报告授权（`callerGrants()`）时，快照来自远端，应用设入被拒；
 *    没有声明作用域的实体时远端一次都不问；
 * 2. `refresh()`：先核对身份再问远端；本地已连上就写进本地库，没连上只发布；
 * 3. 远端连接时刷新一次：连不上远端（离线）沿用上次的快照，远端缺函数等配置错误让连接失败；
 * 4. 本地读回不拿旧行盖掉更新的远端快照；
 * 5. 交错的刷新：后开始的那次胜出，内存与本地库里的那一行都不被先开始、晚到的那次盖掉（同一毫秒、内容相同也一样）。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { EntityType } from '../../entity/entity.interface.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import { RxDBGrantSnapshot, type RxDBGrant } from '../../grants/grant-snapshot.js';
import { RXDB_GRANT_STATE_ID, RxDBGrantState } from '../../grants/grant-state.js';
import { RxDB } from '../../RxDB.js';
import { NetworkOfflineError, RxDBError } from '../../RxDBError.js';
import { RxDBIdentityMismatchError, type RxDBIdentity } from '../../system/identity-binding.js';
import { createMockAdapter, type MockLocalAdapter } from '../fixtures/test-db-setup.js';

@Entity({
  name: 'RemoteScopedItem',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'tenantId', type: PropertyType.string }
  ],
  access: { scope: { property: 'tenantId', prefix: 'tenant:' } },
  permissions: { update: { requires: 'edit' } }
})
class RemoteScopedItem extends EntityBase {}

@Entity({ name: 'RemotePlainItem', properties: [{ name: 'title', type: PropertyType.string }] })
class RemotePlainItem extends EntityBase {}

const SCOPE = 'https://project-a.supabase.co';
const ME: RxDBIdentity = { scope: SCOPE, subject: '00000000-0000-4000-8000-0000000000a1' };
const SOMEONE_ELSE: RxDBIdentity = { scope: SCOPE, subject: '00000000-0000-4000-8000-0000000000b2' };

const REMOTE_GRANTS: RxDBGrant[] = [
  { scope: 'tenant:a', permissions: ['read', 'edit'] },
  { scope: 'tenant:b', permissions: ['read'] }
];

/** 降权之后：tenant:a 只剩 read */
const READ_ONLY: RxDBGrant[] = [{ scope: 'tenant:a', permissions: ['read'] }];

type RemoteMock = MockLocalAdapter & {
  callerGrants?: ReturnType<typeof vi.fn<() => Promise<readonly RxDBGrant[]>>>;
  callerIdentity: ReturnType<typeof vi.fn<() => Promise<RxDBIdentity>>>;
};

interface Setup {
  entities?: EntityType[];
  /** 远端是否报告授权；`false` 时远端没有 `callerGrants` */
  reportsGrants?: boolean;
  identity?: RxDBIdentity;
  session?: RxDBIdentity;
}

const opened: RxDB[] = [];

afterEach(async () => {
  await Promise.all(opened.splice(0).map(rxdb => rxdb.disconnectAll()));
});

const setup = ({ entities = [RemoteScopedItem], reportsGrants = true, identity, session = ME }: Setup = {}) => {
  const rxdb = new RxDB({
    dbName: `grants-remote-${Math.random().toString(36).slice(2)}`,
    entities,
    identity,
    sync: { type: SyncType.Full, local: { adapter: 'sqlite' }, remote: { adapter: 'remote' } }
  });
  opened.push(rxdb);
  const local = createMockAdapter(rxdb);
  const remote = createMockAdapter(rxdb) as RemoteMock;
  remote.name = 'remote';
  remote.callerIdentity = vi.fn(async () => session);
  if (reportsGrants) remote.callerGrants = vi.fn(async () => REMOTE_GRANTS);
  const state = local.stubEntityRepository(RxDBGrantState);
  rxdb.adapter('sqlite', () => local);
  rxdb.adapter('remote', () => remote);
  rxdb.init();
  return { rxdb, local, remote, state };
};

describe('来源规则', () => {
  it('声明了作用域、远端报告授权：快照来自远端，应用设入被拒，一行都不写', async () => {
    const { rxdb, local } = setup();

    await expect(rxdb.grants.set(REMOTE_GRANTS)).rejects.toThrow(/remote[\s\S]*refresh\(\)/);
    expect(local.transaction).not.toHaveBeenCalled();
    expect(rxdb.grants.snapshot).toBe(RxDBGrantSnapshot.UNKNOWN);
  });

  it('远端不报告授权：应用设入照常', async () => {
    const { rxdb } = setup({ reportsGrants: false });

    await rxdb.grants.set(REMOTE_GRANTS);

    expect(rxdb.grants.snapshot.source).toBe('app');
  });

  it('没有实体声明作用域：refresh() 不问远端，设入照常', async () => {
    const { rxdb, remote } = setup({ entities: [RemotePlainItem] });

    await rxdb.grants.refresh();
    await rxdb.grants.set(REMOTE_GRANTS);

    expect(remote.callerGrants).not.toHaveBeenCalled();
    expect(remote.callerIdentity).not.toHaveBeenCalled();
    expect(rxdb.grants.snapshot.source).toBe('app');
  });

  it('远端不报告授权时 refresh() 什么都不做', async () => {
    const { rxdb, remote } = setup({ reportsGrants: false });

    await rxdb.grants.refresh();

    expect(remote.callerIdentity).not.toHaveBeenCalled();
    expect(rxdb.grants.snapshot).toBe(RxDBGrantSnapshot.UNKNOWN);
  });
});

describe('refresh()', () => {
  it('本地已连上：先核对身份再问远端，写进本地库之后发布，来源是 remote', async () => {
    const { rxdb, remote, state } = setup({ identity: ME });
    await rxdb.connect('sqlite');

    await rxdb.grants.refresh();

    expect(remote.callerIdentity.mock.invocationCallOrder[0]).toBeLessThan(
      remote.callerGrants?.mock.invocationCallOrder[0] ?? 0
    );
    expect(rxdb.grants.snapshot.status).toBe('known');
    expect(rxdb.grants.snapshot.source).toBe('remote');
    expect(rxdb.grants.snapshot.has('tenant:a', 'edit')).toBe(true);
    expect(state.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: RXDB_GRANT_STATE_ID, source: 'remote', grants: rxdb.grants.snapshot.grants })
    );
  });

  it('会话是别的身份：拒绝，不问远端的授权，快照不变', async () => {
    const { rxdb, remote } = setup({ identity: ME, session: SOMEONE_ELSE });
    await rxdb.connect('sqlite');

    await expect(rxdb.grants.refresh()).rejects.toBeInstanceOf(RxDBIdentityMismatchError);

    expect(remote.callerGrants).not.toHaveBeenCalled();
    expect(rxdb.grants.snapshot).toBe(RxDBGrantSnapshot.UNKNOWN);
  });

  it('本地还没连上：只发布、不落库（下一次刷新再落库）', async () => {
    const { rxdb, local } = setup();

    await rxdb.grants.refresh();

    expect(rxdb.grants.snapshot.source).toBe('remote');
    expect(local.transaction).not.toHaveBeenCalled();
  });

  it('远端报错：原样抛出，快照不变', async () => {
    const { rxdb, remote } = setup();
    const failure = new RxDBError('rxdb_caller_grants() is missing');
    remote.callerGrants?.mockRejectedValueOnce(failure);

    await expect(rxdb.grants.refresh()).rejects.toBe(failure);
    expect(rxdb.grants.snapshot).toBe(RxDBGrantSnapshot.UNKNOWN);
  });

  it('两次刷新交错：先开始的那次晚到，不拿更早的结果盖掉后一次', async () => {
    const { rxdb, remote } = setup();
    let releaseFirst!: (grants: readonly RxDBGrant[]) => void;
    remote.callerGrants
      ?.mockImplementationOnce(() => new Promise(resolve => (releaseFirst = resolve)))
      .mockImplementationOnce(async () => [{ scope: 'tenant:a', permissions: ['read'] }]);

    const first = rxdb.grants.refresh();
    await vi.waitFor(() => expect(remote.callerGrants).toHaveBeenCalledTimes(1));
    await rxdb.grants.refresh();
    releaseFirst(REMOTE_GRANTS);
    await first;

    expect(rxdb.grants.snapshot.has('tenant:a', 'edit')).toBe(false);
  });

  it('远端交回的授权形状不对：报错，不当成空快照', async () => {
    const { rxdb, remote } = setup();
    remote.callerGrants?.mockResolvedValueOnce([{ scope: '', permissions: ['edit'] }]);

    await expect(rxdb.grants.refresh()).rejects.toThrow(RxDBError);
    expect(rxdb.grants.snapshot).toBe(RxDBGrantSnapshot.UNKNOWN);
  });
});

describe('远端连接时刷新一次', () => {
  it('connect(远端)：问一次远端，快照来自远端', async () => {
    const { rxdb, remote } = setup();
    await rxdb.connect('sqlite');

    await rxdb.connect('remote');

    expect(remote.callerGrants).toHaveBeenCalledTimes(1);
    expect(rxdb.grants.snapshot.source).toBe('remote');
  });

  it('连不上远端（离线）：连接照常完成，沿用上次的快照', async () => {
    const { rxdb, remote } = setup();
    await rxdb.connect('sqlite');
    await rxdb.grants.refresh();
    const before = rxdb.grants.snapshot;
    remote.callerGrants?.mockRejectedValueOnce(new NetworkOfflineError(new TypeError('Failed to fetch')));

    await rxdb.connect('remote');

    expect(rxdb.grants.snapshot).toBe(before);
  });

  it('远端缺函数等配置错误：连接失败，错误原样抛出', async () => {
    const { rxdb, remote } = setup();
    await rxdb.connect('sqlite');
    const failure = new RxDBError('The server has no public.rxdb_caller_grants()');
    remote.callerGrants?.mockRejectedValueOnce(failure);

    await expect(rxdb.connect('remote')).rejects.toBe(failure);
    expect(rxdb.grants.snapshot).toBe(RxDBGrantSnapshot.UNKNOWN);
  });

  it('没有实体声明作用域：连接时不问远端', async () => {
    const { rxdb, remote } = setup({ entities: [RemotePlainItem] });

    await rxdb.connect('remote');

    expect(remote.callerGrants).not.toHaveBeenCalled();
  });
});

describe('本地读回不盖掉更新的远端快照', () => {
  it('内存里已有远端快照：库里那一行更旧，不发布', async () => {
    const { rxdb, local } = setup();
    await rxdb.grants.refresh();
    const fresh = rxdb.grants.snapshot;
    local.stubEntityRepository(RxDBGrantState, [
      Object.assign(rxdb.entityManager.instantiate(RxDBGrantState), {
        id: RXDB_GRANT_STATE_ID,
        source: 'remote',
        grants: [{ scope: 'tenant:a', permissions: ['read'] }],
        updatedAt: new Date(0)
      })
    ]);

    await rxdb.grants.load(local);

    expect(rxdb.grants.snapshot).toBe(fresh);
  });

  it('库里那一行更新：发布它', async () => {
    const { rxdb, local } = setup();
    await rxdb.grants.refresh();
    local.stubEntityRepository(RxDBGrantState, [
      Object.assign(rxdb.entityManager.instantiate(RxDBGrantState), {
        id: RXDB_GRANT_STATE_ID,
        source: 'remote',
        grants: [{ scope: 'tenant:a', permissions: ['read'] }],
        updatedAt: new Date(Date.now() + 60_000)
      })
    ]);

    await rxdb.grants.load(local);

    expect(rxdb.grants.snapshot.has('tenant:a', 'edit')).toBe(false);
  });

  it('库里没有那一行：内存里的快照不变', async () => {
    const { rxdb, local } = setup();
    await rxdb.grants.refresh();
    const fresh = rxdb.grants.snapshot;
    local.stubEntityRepository(RxDBGrantState);

    await rxdb.grants.load(local);

    expect(rxdb.grants.snapshot).toBe(fresh);
  });
});

/** 让替身仓库记住写下的那一行：读回与改写都落在返回的数组上，像真的本地库一样 */
const persistent = (local: MockLocalAdapter, rows: RxDBGrantState[] = []): RxDBGrantState[] => {
  const state = local.stubEntityRepository(RxDBGrantState, rows);
  vi.mocked(state.create).mockImplementation(async row => {
    rows.push(row as RxDBGrantState);
    return row;
  });
  vi.mocked(state.update).mockImplementation(async (row, fields) => Object.assign(row, fields));
  return rows;
};

/** 第一次问远端挂起、第二次立即交回 `second`；返回放行第一次的函数 */
const interleave = (remote: RemoteMock, second: readonly RxDBGrant[]) => {
  let releaseFirst!: (grants: readonly RxDBGrant[]) => void;
  remote.callerGrants
    ?.mockImplementationOnce(() => new Promise(resolve => (releaseFirst = resolve)))
    .mockImplementationOnce(async () => second);
  return (grants: readonly RxDBGrant[]) => releaseFirst(grants);
};

describe('交错的刷新：后开始的那次胜出', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('先开始的那次晚到：本地库里那一行也不被它改写，离线重开读回的是后一次', async () => {
    const { rxdb, local, remote } = setup();
    const rows = persistent(local);
    await rxdb.connect('sqlite');
    const releaseFirst = interleave(remote, READ_ONLY);

    const first = rxdb.grants.refresh();
    await vi.waitFor(() => expect(remote.callerGrants).toHaveBeenCalledTimes(1));
    await rxdb.grants.refresh();
    releaseFirst(REMOTE_GRANTS);
    await first;

    expect(rxdb.grants.snapshot.has('tenant:a', 'edit')).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0].grants).toEqual(READ_ONLY);
    const reopened = setup();
    reopened.local.stubEntityRepository(RxDBGrantState, rows);
    await reopened.rxdb.grants.load(reopened.local);
    expect(reopened.rxdb.grants.snapshot.has('tenant:a', 'read')).toBe(true);
    expect(reopened.rxdb.grants.snapshot.has('tenant:a', 'edit')).toBe(false);
  });

  it('两次刷新开始于同一毫秒：照样按开始的先后，不拿墙上时钟打平', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-28T00:00:00.000Z'));
    const { rxdb, local, remote } = setup();
    const rows = persistent(local);
    await rxdb.connect('sqlite');
    const releaseFirst = interleave(remote, READ_ONLY);

    const first = rxdb.grants.refresh();
    await vi.waitFor(() => expect(remote.callerGrants).toHaveBeenCalledTimes(1));
    await rxdb.grants.refresh();
    releaseFirst(REMOTE_GRANTS);
    await first;

    expect(rxdb.grants.snapshot.has('tenant:a', 'edit')).toBe(false);
    expect(rows[0].grants).toEqual(READ_ONLY);
  });

  it('后一次的内容与当前相同：照样记下它更新，夹在中间、晚到的旧结果不被采用', async () => {
    const { rxdb, remote } = setup();
    remote.callerGrants?.mockResolvedValueOnce(READ_ONLY);
    await rxdb.grants.refresh();
    const releaseFirst = interleave(remote, READ_ONLY);

    const first = rxdb.grants.refresh();
    await vi.waitFor(() => expect(remote.callerGrants).toHaveBeenCalledTimes(2));
    await rxdb.grants.refresh();
    releaseFirst(REMOTE_GRANTS);
    await first;

    expect(rxdb.grants.snapshot.has('tenant:a', 'edit')).toBe(false);
  });

  it('内容不变的刷新推进取得时间，但不发快照事件', async () => {
    const { rxdb } = setup();
    await rxdb.grants.refresh();
    const before = rxdb.grants.snapshot;
    const events: RxDBGrantSnapshot[] = [];
    const subscription = rxdb.grants.snapshot$.subscribe(snapshot => events.push(snapshot));

    await rxdb.grants.refresh();
    subscription.unsubscribe();

    expect(rxdb.grants.snapshot.equals(before)).toBe(true);
    expect(Number(rxdb.grants.snapshot.updatedAt)).toBeGreaterThan(Number(before.updatedAt));
    expect(events).toEqual([before]);
  });

  it('共享本地库的另一个实例刚写下更新的一行：不改写它，内存采用库里那一份', async () => {
    const { rxdb, local } = setup();
    const newer = Object.assign(rxdb.entityManager.instantiate(RxDBGrantState), {
      id: RXDB_GRANT_STATE_ID,
      source: 'remote',
      grants: READ_ONLY,
      updatedAt: new Date(Date.now() + 60_000)
    });
    const rows = persistent(local, [newer]);
    await rxdb.connect('sqlite');

    await rxdb.grants.refresh();

    expect(rows).toEqual([newer]);
    expect(rows[0].grants).toEqual(READ_ONLY);
    expect(rxdb.grants.snapshot.has('tenant:a', 'read')).toBe(true);
    expect(rxdb.grants.snapshot.has('tenant:a', 'edit')).toBe(false);
  });
});
