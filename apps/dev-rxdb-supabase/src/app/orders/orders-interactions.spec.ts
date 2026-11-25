import type { PullResult, PushResult, SyncRejection } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import {
  describeDependencyRejections,
  describePullOutcome,
  describePushOutcome,
  itemsByOrder,
  orderTotal,
  parseOrderItemDraft
} from './orders-interactions';

function rejection(overrides: Partial<SyncRejection>): SyncRejection {
  return {
    namespace: 'public',
    entity: 'DemoOrder',
    entityId: 'order-1',
    op: 'INSERT',
    code: '23503',
    reason: 'dependency',
    message: 'insert or update on table "demo_orders" violates foreign key constraint "demo_orders_customerId_fkey"',
    dependsOn: { namespace: 'public', entity: 'DemoCustomer', entityId: 'customer-1' },
    at: new Date('2026-11-26T08:00:00Z'),
    changeIds: [3],
    ...overrides
  };
}

describe('orderTotal', () => {
  it('订单金额是各订单项的数量乘单价之和；没有订单项是 0', () => {
    expect(
      orderTotal([
        { quantity: 2, price: 10.5 },
        { quantity: 1, price: 5 }
      ])
    ).toBe(26);
    expect(orderTotal([])).toBe(0);
  });
});

describe('itemsByOrder', () => {
  it('订单项按所属订单分组，组内保持原顺序', () => {
    const items = [
      { id: 'a', orderId: 'o1' },
      { id: 'b', orderId: 'o2' },
      { id: 'c', orderId: 'o1' }
    ];

    const grouped = itemsByOrder(items);

    expect(grouped.get('o1')?.map(item => item.id)).toEqual(['a', 'c']);
    expect(grouped.get('o2')?.map(item => item.id)).toEqual(['b']);
    expect(grouped.get('o3')).toBeUndefined();
  });
});

describe('parseOrderItemDraft', () => {
  it('商品名去掉首尾空白，数量与单价转成数字', () => {
    expect(parseOrderItemDraft({ productName: '  蓝牙耳机 ', quantity: '2', price: '99.5' })).toEqual({
      ok: true,
      draft: { productName: '蓝牙耳机', quantity: 2, price: 99.5 }
    });
  });

  it('商品名为空、数量不是正整数、单价不是非负数时给出原因，不交出订单项', () => {
    expect(parseOrderItemDraft({ productName: ' ', quantity: '1', price: '1' })).toEqual({
      ok: false,
      error: '先填商品名称'
    });
    for (const quantity of ['0', '-1', '1.5', 'abc', '']) {
      expect(parseOrderItemDraft({ productName: '耳机', quantity, price: '1' })).toEqual({
        ok: false,
        error: '数量要是正整数'
      });
    }
    for (const price of ['-0.01', 'abc', '']) {
      expect(parseOrderItemDraft({ productName: '耳机', quantity: '1', price })).toEqual({
        ok: false,
        error: '单价要是不小于 0 的数'
      });
    }
  });
});

describe('describeDependencyRejections', () => {
  const customers = [{ id: 'customer-1', name: '星河客户' }];

  it('依赖的客户已不在远端的订单，按本机的客户名指出来（AC#4）', () => {
    expect(describeDependencyRejections([rejection({})], customers)).toEqual([
      '订单被远端拒绝：它的客户「星河客户」已不在远端。拉取之后，这位客户也会从本机消失。'
    ]);
  });

  it('本机也没有这位客户时用 id 指出', () => {
    expect(describeDependencyRejections([rejection({})], [])).toEqual([
      '订单被远端拒绝：它的客户（customer-1）已不在远端。拉取之后，这位客户也会从本机消失。'
    ]);
  });

  it('只看依赖客户失败的订单：别的原因、别的实体、只给出约束名的都不在这里（它们照样在被拒清单里）', () => {
    expect(
      describeDependencyRejections(
        [
          rejection({ reason: 'denied', code: '42501', dependsOn: undefined }),
          rejection({
            entity: 'DemoOrderItem',
            dependsOn: { namespace: 'public', entity: 'DemoOrder', entityId: 'o' }
          }),
          rejection({ dependsOn: { constraint: 'demo_orders_customerId_fkey' } })
        ],
        customers
      )
    ).toEqual([]);
  });
});

describe('describePushOutcome / describePullOutcome', () => {
  const pushResult = (overrides: Partial<PushResult>): PushResult => ({
    pushed: 3,
    rejected: 0,
    failed: 0,
    compacted: 0,
    originalCount: 3,
    failures: [],
    ...overrides
  });
  const pullResult = (overrides: Partial<PullResult>): PullResult => ({
    pulled: 4,
    compacted: 0,
    applied: 4,
    hasMore: false,
    conflictsResolved: 0,
    conflictsDeferred: 0,
    failures: [],
    persistedProgress: true,
    historyInvalidated: true,
    ...overrides
  });

  it('推送报出推上去与被拒的条数，被拒的去被拒清单里看', () => {
    expect(describePushOutcome(pushResult({}))).toEqual({ notice: '推送完成：推上去 3 条', error: null });
    expect(describePushOutcome(pushResult({ pushed: 2, rejected: 1 }))).toEqual({
      notice: '推送完成：推上去 2 条，被拒 1 条（见「被拒的推送」）',
      error: null
    });
  });

  it('拉取报出拉到的条数', () => {
    expect(describePullOutcome(pullResult({}))).toEqual({ notice: '拉取完成：拉到 4 条', error: null });
  });

  it('有仓库失败时按实体报出原因，不报完成', () => {
    const failures = [{ repository: { namespace: 'public', entity: 'DemoOrder' }, error: new Error('网络断了') }];
    expect(describePushOutcome(pushResult({ failures }))).toEqual({
      notice: null,
      error: '推送没有全部完成：DemoOrder：网络断了'
    });
    expect(describePullOutcome(pullResult({ failures }))).toEqual({
      notice: null,
      error: '拉取没有全部完成：DemoOrder：网络断了'
    });
  });
});
