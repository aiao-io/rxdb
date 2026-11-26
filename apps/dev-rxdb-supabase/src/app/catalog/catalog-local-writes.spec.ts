import { RxDB } from '@aiao/rxdb';
import { CatalogItem } from '@aiao/rxdb-test/entities';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { DemoSession } from '../demo-session';
import { Toasts } from '../toasts';
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

function setup(options: { signedIn?: boolean; tenants?: string[] } = {}) {
  const created = { save: vi.fn(() => Promise.resolve()) };
  const rxdb = { entityManager: { instantiate: vi.fn(() => created) } };
  TestBed.configureTestingModule({
    providers: [
      CatalogLocalWrites,
      { provide: RxDB, useValue: rxdb },
      { provide: DemoSession, useValue: { signedIn: options.signedIn ?? true } },
      { provide: CatalogRemoteState, useValue: { $myTenantIds: signal(options.tenants ?? ['xinghe']) } }
    ]
  });
  return { writes: TestBed.inject(CatalogLocalWrites), rxdb, created, toasts: TestBed.inject(Toasts) };
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

  // 顶栏的撤销、重做据此给原因（epic-016）
  it('写入口关着的原因：访客只读、不在租户里；能写时没有原因', () => {
    expect(setup({ signedIn: false }).writes.$blockedReason()).toBe('访客只读：登录成员才能在本机改商品');
    TestBed.resetTestingModule();
    expect(setup({ tenants: [] }).writes.$blockedReason()).toBe('还不在任何租户里：加入租户之后才能改这个租户的商品');
    TestBed.resetTestingModule();
    expect(setup().writes.$blockedReason()).toBeNull();
  });
});

describe('CatalogLocalWrites：本机写入', () => {
  it('新建：在本机存一件商品，结果弹成一条成功消息', async () => {
    const { writes, rxdb, created, toasts } = setup();

    await writes.create(draft);

    expect(rxdb.entityManager.instantiate).toHaveBeenCalledWith(CatalogItem, draft);
    expect(created.save).toHaveBeenCalled();
    expect(toasts.list()).toEqual([
      expect.objectContaining({ kind: 'success', message: '「星河 X3 耳机」已在本机新建' })
    ]);
    expect(writes.$error()).toBeNull();
  });

  it('修改失败：把没存进去的改动还原，失败原因报出来', async () => {
    const { writes, toasts } = setup();
    const item = listedItem('xinghe', new Error('磁盘满了'));

    await writes.update(item, { name: '改名', category: '数码', price: 1, cost: 1 });

    // 失败原因留在原处（编辑框里），不弹消息：模态的编辑框盖在消息之上
    expect(item.reset).toHaveBeenCalled();
    expect(writes.$error()).toBe('磁盘满了');
    expect(toasts.list()).toEqual([]);
    expect(writes.$busy()).toBe(false);
  });

  it('改可见范围：在本机改，成功后报出改成了什么', async () => {
    const { writes, toasts } = setup();
    const item = listedItem('xinghe');

    await writes.setVisibility(item, 'tenant');

    expect(item.visibility).toBe('tenant');
    expect(item.save).toHaveBeenCalled();
    expect(toasts.list().map(toast => toast.message)).toEqual(['「xinghe 的商品」已在本机收回为租户内部']);
  });
});
