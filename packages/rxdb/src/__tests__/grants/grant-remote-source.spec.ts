/**
 * @fileoverview US-029 阶段 C — 授权快照的远端来源（核心一侧；Supabase 真栈见适配器包）。
 *
 * 1. 来源规则：有实体声明了作用域、且远端适配器报告授权（`callerGrants()`）时，快照来自远端，应用设入被拒；
 *    没有声明作用域的实体时远端一次都不问；
 * 2. `refresh()`：先核对身份再问远端；本地已连上就写进本地库，没连上只发布；
 * 3. 远端连接时刷新一次：连不上远端（离线）沿用上次的快照，远端缺函数等配置错误让连接失败；
 * 4. 本地读回不拿旧行盖掉更新的远端快照。
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
