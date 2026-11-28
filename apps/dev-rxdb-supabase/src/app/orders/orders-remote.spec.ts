import { describe, expect, it } from 'vitest';
import { orderTreeDraft, orderTreeRows } from './orders-interactions';
import {
  createRemoteOrderTree,
  deleteRemoteCustomer,
  deleteRemoteOrder,
  fetchOrdersSnapshot,
  type OrdersRemoteClient
} from './orders-remote';

type Result = { data: unknown; error: { message: string } | null };

/** 一次 `from(table)` 之后链上的每一步 */
interface Query {
  readonly table: string;
  readonly chain: (readonly [method: string, args: readonly unknown[]])[];
}

/** PostgREST 查询替身：按表给结果，记下每张表上链了哪些方法 */
function fakeClient(resultOf: (table: string) => Result = () => ({ data: [], error: null })) {
  const queries: Query[] = [];
  const client = {
    from: (table: string) => {
      const query: Query = { table, chain: [] };
      queries.push(query);
      const builder = Object.assign(
        Promise.resolve(resultOf(table)),
        {} as Record<string, (...args: unknown[]) => unknown>
      );
      for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'order']) {
        builder[method] = (...args: unknown[]) => {
          query.chain.push([method, args]);
          return builder;
        };
      }
      return builder;
    }
  };
  return { client: client as unknown as OrdersRemoteClient, queries };
}

describe('fetchOrdersSnapshot', () => {
  it('以当前身份直接读六张表（含中间表），按建立先后排；交出各表原样的行', async () => {
    const customers = [{ id: 'c1', name: '星河客户', idCardId: 'card1' }];
    const items = [{ id: 'i1', productName: '耳机', quantity: 2, price: 99, orderId: 'o1' }];
    const { client, queries } = fakeClient(table => ({
      data:
        table === 'demo_customers' ? customers
        : table === 'demo_order_items' ? items
        : [],
      error: null
    }));

    const snapshot = await fetchOrdersSnapshot(client);

    expect(queries.map(query => [query.table, query.chain[0]])).toEqual([
      ['demo_customers', ['select', ['id, name, idCardId']]],
      ['demo_id_cards', ['select', ['id, code, ownerId']]],
      ['demo_orders', ['select', ['id, number, customerId']]],
      ['demo_order_items', ['select', ['id, productName, quantity, price, orderId']]],
      ['demo_categories', ['select', ['id, name']]],
      ['DemoCategory_DemoOrderItem', ['select', ['id, categoriesId, orderItemsId']]]
    ]);
    for (const query of queries) {
      expect(query.chain.slice(1)).toEqual([
        ['order', ['createdAt']],
        ['order', ['id']]
      ]);
    }
    expect(snapshot).toEqual({ customers, idCards: [], orders: [], items, categories: [], attachments: [] });
  });

  it('任何一张表读不到就整个报错：访客（anon）没有这些表的权限', async () => {
    const { client } = fakeClient(table =>
      table === 'demo_orders' ?
        { data: null, error: { message: 'permission denied for table demo_orders' } }
      : { data: [], error: null }
    );

    await expect(fetchOrdersSnapshot(client)).rejects.toThrow('permission denied for table demo_orders');
  });
});

describe('deleteRemoteCustomer / deleteRemoteOrder', () => {
  it('按 id 删远端的一行：外键级联由远端做，同步触发器把连带删掉的行也记进日志', async () => {
    const { client, queries } = fakeClient(() => ({ data: [{ id: 'x' }], error: null }));

    await deleteRemoteCustomer(client, 'c1');
    await deleteRemoteOrder(client, 'o1');

    expect(queries).toEqual([
      {
        table: 'demo_customers',
        chain: [
          ['delete', []],
          ['eq', ['id', 'c1']],
          ['select', ['id']]
        ]
      },
      {
        table: 'demo_orders',
        chain: [
          ['delete', []],
          ['eq', ['id', 'o1']],
          ['select', ['id']]
        ]
      }
    ]);
  });

  it('一行都没删到就当成失败：这一行已经不在远端了', async () => {
    const { client } = fakeClient(() => ({ data: [], error: null }));

    await expect(deleteRemoteCustomer(client, 'c1')).rejects.toThrow('这一行已经不在远端了');
    await expect(deleteRemoteOrder(client, 'o1')).rejects.toThrow('这一行已经不在远端了');
  });
});

describe('createRemoteOrderTree', () => {
  let next = 0;
  const rows = orderTreeRows(orderTreeDraft('远端客户', 'B2C4'), () => `id-${++next}`);

  it('父在前逐张表写：客户的证件引用先空着，证件写好之后再补上，然后是订单与订单项', async () => {
    const { client, queries } = fakeClient(table =>
      table === 'demo_customers' ? { data: [{ id: rows.customer.id }], error: null } : { data: null, error: null }
    );

    await createRemoteOrderTree(client, rows);

    expect(queries).toEqual([
      { table: 'demo_customers', chain: [['insert', [{ id: rows.customer.id, name: '远端客户 B2C4' }]]] },
      { table: 'demo_id_cards', chain: [['insert', [rows.idCard]]] },
      {
        table: 'demo_customers',
        chain: [
          ['update', [{ idCardId: rows.idCard.id }]],
          ['eq', ['id', rows.customer.id]],
          ['select', ['id']]
        ]
      },
      { table: 'demo_orders', chain: [['insert', [rows.order]]] },
      { table: 'demo_order_items', chain: [['insert', [rows.items]]] }
    ]);
  });

  it('哪一步报错就停在哪一步，原样报出', async () => {
    const { client, queries } = fakeClient(table =>
      table === 'demo_id_cards' ?
        { data: null, error: { message: 'duplicate key value violates unique constraint' } }
      : { data: null, error: null }
    );

    await expect(createRemoteOrderTree(client, rows)).rejects.toThrow('duplicate key value');
    expect(queries.map(query => query.table)).toEqual(['demo_customers', 'demo_id_cards']);
  });
});
