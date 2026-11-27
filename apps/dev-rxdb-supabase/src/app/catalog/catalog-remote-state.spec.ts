import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoSession } from '../demo-session';
import { SyncCommands } from '../sync-commands';
import { CatalogRemoteState } from './catalog-remote-state';

const remote = vi.hoisted(() => ({
  fetchTenants: vi.fn(),
  fetchCallerBuckets: vi.fn(),
  fetchCallerGrants: vi.fn()
}));

vi.mock('./catalog-remote', () => remote);

const client = {};

function setup(signedIn = true) {
  const round = signal(0);
  TestBed.configureTestingModule({
    providers: [
      CatalogRemoteState,
      { provide: DemoSession, useValue: { signedIn, prepared: { client } } },
      { provide: SyncCommands, useValue: { round } }
    ]
  });
  const state = TestBed.inject(CatalogRemoteState);
  TestBed.tick();
  return { state, round };
}

describe('CatalogRemoteState：成员权限（US-234）', () => {
  beforeEach(() => {
    for (const fn of Object.values(remote)) fn.mockReset();
    remote.fetchTenants.mockResolvedValue([
      { id: 'jiguang', name: '极光百货' },
      { id: 'xinghe', name: '星河零售' }
    ]);
    remote.fetchCallerBuckets.mockResolvedValue(['public', 'tenant:jiguang', 'tenant:xinghe']);
    remote.fetchCallerGrants.mockResolvedValue([
      { scope: 'tenant:jiguang', permissions: ['read'] },
      { scope: 'tenant:xinghe', permissions: ['read', 'edit', 'manage'] },
      { scope: 'user:u-alice', permissions: ['read', 'edit'] }
    ]);
  });

  it('所在的租户、能改的租户与能管理成员的租户都出自 rxdb_caller_grants()', async () => {
    const { state } = setup();

    await state.refresh();

    expect(state.$myTenantIds()).toEqual(['jiguang', 'xinghe']);
    expect(state.$editableTenantIds()).toEqual(['xinghe']);
    expect(state.$managedTenantIds()).toEqual(['xinghe']);
  });

  it('访客不读授权：没有所在的租户', async () => {
    const { state } = setup(false);

    await state.refresh();

    expect(remote.fetchCallerGrants).not.toHaveBeenCalled();
    expect(state.$grants()).toEqual([]);
    expect(state.$myTenantIds()).toEqual([]);
  });

  // 授权刷新：拉到的可能是别人调整过的成员关系，推送被拒多半是权限变了（AC#14、#15）
  it('每轮推拉结束之后重读一次授权；页面打开之前的轮次不算', async () => {
    const { state, round } = setup();
    await state.refresh();
    expect(remote.fetchCallerGrants).toHaveBeenCalledTimes(1);

    round.set(1);
    TestBed.tick();
    await vi.waitFor(() => expect(remote.fetchCallerGrants).toHaveBeenCalledTimes(2));

    round.set(2);
    TestBed.tick();
    await vi.waitFor(() => expect(remote.fetchCallerGrants).toHaveBeenCalledTimes(3));
  });

  it('两次读交错时只留后发起的那一次', async () => {
    const { state } = setup();
    let releaseFirst: (value: unknown) => void = () => undefined;
    remote.fetchCallerGrants
      .mockReturnValueOnce(new Promise(resolve => (releaseFirst = resolve)))
      .mockResolvedValueOnce([{ scope: 'tenant:xinghe', permissions: ['read'] }]);

    const first = state.refresh();
    await state.refresh();
    releaseFirst([{ scope: 'tenant:xinghe', permissions: ['read', 'edit', 'manage'] }]);
    await first;

    expect(state.$editableTenantIds()).toEqual([]);
  });
});
