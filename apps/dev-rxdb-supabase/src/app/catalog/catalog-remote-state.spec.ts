import { RxDB, RxDBGrantSnapshot, type RxDBGrant } from '@aiao/rxdb';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoSession } from '../demo-session';
import { SyncCommands } from '../sync-commands';
import { CatalogRemoteState } from './catalog-remote-state';

const remote = vi.hoisted(() => ({
  fetchTenants: vi.fn(),
  fetchCallerBuckets: vi.fn()
}));

vi.mock('./catalog-remote', () => remote);

const client = {};

const known = (grants: RxDBGrant[]) => RxDBGrantSnapshot.known(grants, 'remote', new Date(0));

const ALICE = known([
  { scope: 'tenant:jiguang', permissions: ['read'] },
  { scope: 'tenant:xinghe', permissions: ['read', 'edit', 'manage'] },
  { scope: 'user:u-alice', permissions: ['read', 'edit'] }
]);

function setup(snapshot: RxDBGrantSnapshot = ALICE) {
  const round = signal(0);
  const snapshot$ = new BehaviorSubject(snapshot);
  const grants = { snapshot$, refresh: vi.fn(async () => undefined) };
  TestBed.configureTestingModule({
    providers: [
      CatalogRemoteState,
      { provide: RxDB, useValue: { grants } },
      { provide: DemoSession, useValue: { signedIn: true, prepared: { client } } },
      { provide: SyncCommands, useValue: { round } }
    ]
  });
  const state = TestBed.inject(CatalogRemoteState);
  TestBed.tick();
  return { state, round, grants, snapshot$ };
}

describe('CatalogRemoteState：成员权限出自引擎的授权快照（US-234 阶段 B）', () => {
  beforeEach(() => {
    for (const fn of Object.values(remote)) fn.mockReset();
    remote.fetchTenants.mockResolvedValue([
      { id: 'jiguang', name: '极光百货' },
      { id: 'xinghe', name: '星河零售' }
    ]);
    remote.fetchCallerBuckets.mockResolvedValue(['public', 'tenant:jiguang', 'tenant:xinghe']);
  });

  it('所在的租户、能改的租户与能管理成员的租户都出自 rxdb.grants 的快照，不再自己读 rxdb_caller_grants()', () => {
    const { state } = setup();

    expect(state.$grantSnapshot()).toBe(ALICE);
    expect(state.$myTenantIds()).toEqual(['jiguang', 'xinghe']);
    expect(state.$editableTenantIds()).toEqual(['xinghe']);
    expect(state.$managedTenantIds()).toEqual(['xinghe']);
  });

  it('快照还没取到（访客也一样没有租户作用域）：没有所在的租户', () => {
    const { state } = setup(RxDBGrantSnapshot.UNKNOWN);

    expect(state.$grants()).toEqual([]);
    expect(state.$myTenantIds()).toEqual([]);
  });

  it('引擎发出新快照，界面跟着变，不用重读', () => {
    const { state, snapshot$ } = setup();

    snapshot$.next(known([{ scope: 'tenant:xinghe', permissions: ['read'] }]));

    expect(state.$editableTenantIds()).toEqual([]);
    expect(state.$myTenantIds()).toEqual(['xinghe']);
  });

  it('页面打开、本页改了成员关系之后：连同授权快照一起刷新（rxdb.grants.refresh()）', async () => {
    const { state, grants } = setup();

    await state.refresh();

    expect(grants.refresh).toHaveBeenCalledTimes(1);
    expect(state.$tenants()).toEqual([
      { id: 'jiguang', name: '极光百货' },
      { id: 'xinghe', name: '星河零售' }
    ]);
    expect(state.$callerBuckets()).toEqual(['public', 'tenant:jiguang', 'tenant:xinghe']);
  });

  // 拉到的可能是别人调整过的成员关系、能读的区跟着变（US-033 AC#3、#4）；授权快照已在每轮同步进门时由引擎刷新
  it('每轮推拉结束之后只重读租户与能读的区；页面打开之前的轮次不算', async () => {
    const { state, round, grants } = setup();
    await state.refresh();
    expect(remote.fetchCallerBuckets).toHaveBeenCalledTimes(1);

    round.set(1);
    TestBed.tick();
    await vi.waitFor(() => expect(remote.fetchCallerBuckets).toHaveBeenCalledTimes(2));

    expect(grants.refresh).toHaveBeenCalledTimes(1);
  });

  it('两次读交错时只留后发起的那一次', async () => {
    const { state } = setup();
    let releaseFirst: (value: unknown) => void = () => undefined;
    remote.fetchCallerBuckets
      .mockReturnValueOnce(new Promise(resolve => (releaseFirst = resolve)))
      .mockResolvedValueOnce(['public']);

    const first = state.refresh();
    await state.refresh();
    releaseFirst(['public', 'tenant:xinghe']);
    await first;

    expect(state.$callerBuckets()).toEqual(['public']);
  });

  it('刷新授权失败（如会话身份对不上）：原因留在 $error', async () => {
    const { state, grants } = setup();
    grants.refresh.mockRejectedValueOnce(new Error('会话身份与本地库不符'));

    await state.refresh();

    expect(state.$error()).toBe('会话身份与本地库不符');
  });
});
