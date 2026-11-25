import { RxDB, type PushResult } from '@aiao/rxdb';
import { CatalogItem } from '@aiao/rxdb-test/entities';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { DemoSession } from '../demo-session';
import { CatalogLocalWrites } from './catalog-local-writes';
import type { CatalogItemDraft } from './catalog-remote';
import { CatalogRemoteState } from './catalog-remote-state';

const draft: CatalogItemDraft = {
  name: '星河 X3 耳机',
  category: '数码',
  price: 99,
  cost: 40,
  visibility: 'public',
  tenantId: 'xinghe'
};

function pushResult(overrides: Partial<PushResult> = {}): PushResult {
  return { pushed: 0, rejected: 0, failed: 0, compacted: 0, originalCount: 0, failures: [], ...overrides };
}

/** 列表里的一件商品：只有服务用得到的字段与三个方法 */
function listedItem(tenantId: string, fails?: Error) {
  const persist = fails ? vi.fn(() => Promise.reject(fails)) : vi.fn(() => Promise.resolve());
  return {
    id: `item-${tenantId}`,
    name: `${tenantId} 的商品`,
    visibility: 'public',
    tenantId,
    save: persist,
    remove: persist,
    reset: vi.fn()
  } as unknown as CatalogItem & { save: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn> };
}

function setup(options: { signedIn?: boolean; tenants?: string[]; push?: () => Promise<PushResult> } = {}) {
  const history = {
    undoCount$: new BehaviorSubject(0),
    redoCount$: new BehaviorSubject(0),
    undo: vi.fn(() => Promise.resolve()),
    redo: vi.fn(() => Promise.resolve())
  };
  const created = { save: vi.fn(() => Promise.resolve()) };
  const rxdb = {
    entityManager: { instantiate: vi.fn(() => created) },
    syncManager: { push: vi.fn(options.push ?? (() => Promise.resolve(pushResult()))) },
    versionManager: { history: vi.fn(() => history), pushableCount$: new BehaviorSubject(0) }
  };
  TestBed.configureTestingModule({
    providers: [
      CatalogLocalWrites,
      { provide: RxDB, useValue: rxdb },
      { provide: DemoSession, useValue: { signedIn: options.signedIn ?? true } },
      { provide: CatalogRemoteState, useValue: { $myTenantIds: signal(options.tenants ?? ['xinghe']) } }
    ]
  });
  return { writes: TestBed.inject(CatalogLocalWrites), rxdb, history, created };
}

describe('CatalogLocalWrites：写入口', () => {
  it('访客不能写，任何商品都不能改', () => {
    const { writes } = setup({ signedIn: false, tenants: [] });

    expect(writes.$canWrite()).toBe(false);
    expect(writes.canEdit({ tenantId: 'xinghe' })).toBe(false);
  });

  it('登录了但不在任何租户里：没有能改的商品', () => {
    const { writes } = setup({ tenants: [] });

    expect(writes.$canWrite()).toBe(false);
  });

  it('租户成员只能改所在租户的商品', () => {
    const { writes } = setup({ tenants: ['xinghe'] });

    expect(writes.$canWrite()).toBe(true);
    expect(writes.canEdit({ tenantId: 'xinghe' })).toBe(true);
    expect(writes.canEdit({ tenantId: 'jiguang' })).toBe(false);
  });

  it('撤销/重做只作用于商品：用 CatalogItem 的历史作用域', () => {
    const { rxdb } = setup();

    expect(rxdb.versionManager.history).toHaveBeenCalledWith(CatalogItem);
  });
});

describe('CatalogLocalWrites：本机写入', () => {
  it('新建：在本机存一件商品，报出结果', async () => {
    const { writes, rxdb, created } = setup();

    await writes.create(draft);

    expect(rxdb.entityManager.instantiate).toHaveBeenCalledWith(CatalogItem, draft);
    expect(created.save).toHaveBeenCalled();
    expect(writes.$notice()).toBe('「星河 X3 耳机」已在本机新建');
    expect(writes.$error()).toBeNull();
  });

  it('修改失败：把没存进去的改动还原，失败原因报出来', async () => {
    const { writes } = setup();
    const item = listedItem('xinghe', new Error('磁盘满了'));

    await writes.update(item, { name: '改名', category: '数码', price: 1, cost: 1 });

    expect(item.reset).toHaveBeenCalled();
    expect(writes.$error()).toBe('磁盘满了');
    expect(writes.$notice()).toBeNull();
    expect(writes.$busy()).toBe(false);
  });

  it('改可见范围：在本机改，成功后报出改成了什么', async () => {
    const { writes } = setup();
    const item = listedItem('xinghe');

    await writes.setVisibility(item, 'tenant');

    expect(item.visibility).toBe('tenant');
    expect(item.save).toHaveBeenCalled();
    expect(writes.$notice()).toBe('「xinghe 的商品」已在本机收回为租户内部');
  });

  it('撤销、重做交给商品的历史作用域', async () => {
    const { writes, history } = setup();

    await writes.undo();
    await writes.redo();

    expect(history.undo).toHaveBeenCalledTimes(1);
    expect(history.redo).toHaveBeenCalledTimes(1);
  });

  it('撤销/重做与待推数跟着历史与本机待推流走', () => {
    const { writes, history, rxdb } = setup();

    history.undoCount$.next(2);
    history.redoCount$.next(1);
    rxdb.versionManager.pushableCount$.next(3);

    expect([writes.$undoCount(), writes.$redoCount(), writes.$pending()]).toEqual([2, 1, 3]);
  });
});

describe('CatalogLocalWrites：推送', () => {
  it('报出远端接受与被拒的条数，提示推送之后不能再撤销', async () => {
    const { writes, rxdb } = setup({ push: () => Promise.resolve(pushResult({ pushed: 2, rejected: 1 })) });

    await writes.push();

    expect(rxdb.syncManager.push).toHaveBeenCalledTimes(1);
    expect(writes.$notice()).toBe('推送完成：远端接受 2 条，1 条被拒（见「被拒的推送」）。已推送的修改不能再撤销。');
  });

  it('有仓库推送失败：报出失败原因，不报完成', async () => {
    const failure = new Error('网络断了');
    const { writes } = setup({
      push: () =>
        Promise.resolve(
          pushResult({ failures: [{ repository: { namespace: 'public', entity: 'CatalogItem' }, error: failure }] })
        )
    });

    await writes.push();

    expect(writes.$error()).toBe('网络断了');
    expect(writes.$notice()).toBeNull();
  });
});
