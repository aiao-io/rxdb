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

/**
 * @param options.tenants - 所在的租户（每个成员关系都有 read）
 * @param options.editable - 其中有 edit 的租户；缺省与所在的租户相同（都是管理员）
 */
function setup(options: { signedIn?: boolean; tenants?: string[]; editable?: string[] } = {}) {
  const created = { save: vi.fn(() => Promise.resolve()) };
  const rxdb = { entityManager: { instantiate: vi.fn(() => created) } };
  const tenants = options.tenants ?? ['xinghe'];
  TestBed.configureTestingModule({
    providers: [
      CatalogLocalWrites,
      { provide: RxDB, useValue: rxdb },
      { provide: DemoSession, useValue: { signedIn: options.signedIn ?? true } },
      {
        provide: CatalogRemoteState,
        useValue: { $myTenantIds: signal(tenants), $editableTenantIds: signal(options.editable ?? tenants) }
      }
    ]
  });
  return { writes: TestBed.inject(CatalogLocalWrites), rxdb, created, toasts: TestBed.inject(Toasts) };
}

describe('CatalogLocalWrites：写入口', () => {
  it('访客不能写，任何商品都不能改', () => {
    const { writes } = setup({ signedIn: false, tenants: [] });

    expect(writes.$canCreate()).toBe(false);
    expect(writes.canEdit({ tenantId: 'xinghe' })).toBe(false);
  });

  it('登录了但不在任何租户里：没有能改的商品', () => {
    const { writes } = setup({ tenants: [] });

    expect(writes.$canCreate()).toBe(false);
  });

  it('管理员只能改有 edit 的租户的商品，别的租户的商品不能改，也不报「员工只读」', () => {
    const { writes } = setup({ tenants: ['xinghe'] });

    expect(writes.$canCreate()).toBe(true);
    expect(writes.canEdit({ tenantId: 'xinghe' })).toBe(true);
    expect(writes.canEdit({ tenantId: 'jiguang' })).toBe(false);
    expect(writes.readonlyReason({ tenantId: 'xinghe' })).toBeNull();
    expect(writes.readonlyReason({ tenantId: 'jiguang' })).toBeNull();
  });

  // US-234 AC#12：Alice 是星河零售的管理员、极光百货的员工
  it('员工所在租户的商品改不了，原因是「员工只读」；管理员所在的租户照常能改、能新建', () => {
    const { writes } = setup({ tenants: ['jiguang', 'xinghe'], editable: ['xinghe'] });

    expect(writes.canEdit({ tenantId: 'jiguang' })).toBe(false);
    expect(writes.readonlyReason({ tenantId: 'jiguang' })).toBe('员工只读');
    expect(writes.canEdit({ tenantId: 'xinghe' })).toBe(true);
    expect(writes.$canCreate()).toBe(true);
  });

  it('只当员工：一件商品都改不了，也不能新建', () => {
    const { writes } = setup({ tenants: ['jiguang'], editable: [] });

    expect(writes.$canCreate()).toBe(false);
    expect(writes.readonlyReason({ tenantId: 'jiguang' })).toBe('员工只读');
  });

  // 顶栏的撤销、重做据此给原因（epic-016）
  it('写入口关着的原因：访客只读、不在租户里；能写时没有原因', () => {
    expect(setup({ signedIn: false }).writes.$blockedReason()).toBe('访客只读：登录成员才能在本机改商品');
    TestBed.resetTestingModule();
    expect(setup({ tenants: [] }).writes.$blockedReason()).toBe('还不在任何租户里：加入租户之后才能改这个租户的商品');
    TestBed.resetTestingModule();
    expect(setup().writes.$blockedReason()).toBeNull();
  });

  // US-234 AC#13：降权之前留下的未推送修改，降权之后仍能撤销、重做
  it('撤销、重做不按角色禁用：只当员工也没有原因', () => {
    expect(setup({ tenants: ['jiguang'], editable: [] }).writes.$blockedReason()).toBeNull();
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

  // 编辑框开着时同步把商品移走了：没有可写的行，原因留在 $error，编辑框据此保持打开并显示它
  it('商品已不在本机：把原因留在 $error，不写本机也不弹消息', () => {
    const { writes, rxdb, toasts } = setup();

    writes.reportItemGone();

    expect(writes.$error()).toBe('这件商品已经不在本机了（可能被同步删除，或移出了你能读的范围），这次修改没有保存。');
    expect(writes.$busy()).toBe(false);
    expect(rxdb.entityManager.instantiate).not.toHaveBeenCalled();
    expect(toasts.list()).toEqual([]);
  });

  it('商品已不在本机的原因是上一次操作的结果：下一次写入开始时清掉', async () => {
    const { writes } = setup();
    writes.reportItemGone();

    await writes.update(listedItem('xinghe'), { name: '改名', category: '数码', price: 1, cost: 1 });

    expect(writes.$error()).toBeNull();
  });
});
