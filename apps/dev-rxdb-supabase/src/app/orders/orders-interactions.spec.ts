import { junctionEntityId, type SyncRejection } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import {
  attachmentId,
  describeDependencyRejections,
  groupBy,
  idCardOf,
  orderTotal,
  orderTreeDraft,
  orderTreeRows,
  parseOrderItemDraft,
  pendingRows
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

describe('groupBy', () => {
  it('按父行分组（订单项按订单、订单按客户），组内保持原顺序', () => {
    const items = [
      { id: 'a', orderId: 'o1' },
      { id: 'b', orderId: 'o2' },
      { id: 'c', orderId: 'o1' }
    ];

    const grouped = groupBy(items, item => item.orderId);

    expect(grouped.get('o1')?.map(item => item.id)).toEqual(['a', 'c']);
    expect(grouped.get('o2')?.map(item => item.id)).toEqual(['b']);
    expect(grouped.get('o3')).toBeUndefined();
  });
});

describe('pendingRows', () => {
  const change = (entityId: string, type: 'INSERT' | 'UPDATE' | 'DELETE') => ({ entityId, type });

  it('待推送清单落到行上：新建的算新建，只改过的算修改', () => {
    const pending = pendingRows([
      { changes: [change('customer-1', 'INSERT'), change('card-1', 'INSERT')] },
      { changes: [change('order-1', 'UPDATE')] }
    ]);

    expect(Object.fromEntries(pending)).toEqual({ 'customer-1': 'INSERT', 'card-1': 'INSERT', 'order-1': 'UPDATE' });
  });

  it('新建之后又改过的仍算新建；删掉的行本机已经没有，不在里面', () => {
    // 清单最新在前：先建后改，改的那一项排在前面
    const pending = pendingRows([
      { changes: [change('customer-1', 'UPDATE')] },
      { changes: [change('customer-1', 'INSERT')] },
      { changes: [change('order-1', 'DELETE')] }
    ]);

    expect(Object.fromEntries(pending)).toEqual({ 'customer-1': 'INSERT' });
  });
});

describe('attachmentId', () => {
  it('订单项挂分类的关联行 id 与 RxDB 派生的一致：中间表、两端外键名同 supabase/orders-demo.sql', () => {
    const itemId = '0190f3a2-0000-7000-8000-000000000001';
    const categoryId = '0190f3a2-0000-7000-8000-000000000002';

    expect(attachmentId(itemId, categoryId)).toBe(
      junctionEntityId({ namespace: 'public', name: 'DemoCategory_DemoOrderItem' }, [
        { foreignKey: 'orderItemsId', id: itemId, uuid: true },
        { foreignKey: 'categoriesId', id: categoryId, uuid: true }
      ])
    );
    expect(attachmentId(itemId.toUpperCase(), categoryId)).toBe(attachmentId(itemId, categoryId));
    expect(attachmentId(categoryId, itemId)).not.toBe(attachmentId(itemId, categoryId));
  });
});

describe('orderTreeDraft / orderTreeRows', () => {
  it('一组示例：带证件的客户、一张订单与两条订单项，名字带同一个后缀', () => {
    expect(orderTreeDraft('示例客户', '7F3A')).toEqual({
      customerName: '示例客户 7F3A',
      idCardCode: 'ID-7F3A',
      orderNumber: 'SO-7F3A',
      items: [
        { productName: '耳机', quantity: 2, price: 99 },
        { productName: '手环', quantity: 1, price: 199 }
      ]
    });
  });

  it('先定下各行的 id：客户与证件互相引用，订单指向客户，订单项指向订单', () => {
    let next = 0;
    const rows = orderTreeRows(orderTreeDraft('示例客户', '7F3A'), () => `id-${++next}`);

    expect(rows).toEqual({
      customer: { id: 'id-1', name: '示例客户 7F3A', idCardId: 'id-2' },
      idCard: { id: 'id-2', code: 'ID-7F3A', ownerId: 'id-1' },
      order: { id: 'id-3', number: 'SO-7F3A', customerId: 'id-1' },
      items: [
        { id: 'id-4', productName: '耳机', quantity: 2, price: 99, orderId: 'id-3' },
        { id: 'id-5', productName: '手环', quantity: 1, price: 199, orderId: 'id-3' }
      ]
    });
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

describe('idCardOf（阶段 C）', () => {
  const card = { id: 'card-1', ownerId: 'customer-1', code: 'ID-1' };

  it('客户指向的证件也指回这位客户时，交出这张证件', () => {
    expect(idCardOf({ id: 'customer-1', idCardId: 'card-1' }, [card])).toBe(card);
  });

  it('客户没有证件、证件不在本机、或两边的引用对不上时没有证件', () => {
    expect(idCardOf({ id: 'customer-1', idCardId: null }, [card])).toBeUndefined();
    expect(idCardOf({ id: 'customer-1', idCardId: 'card-9' }, [card])).toBeUndefined();
    expect(idCardOf({ id: 'customer-2', idCardId: 'card-1' }, [card])).toBeUndefined();
  });
});
