/**
 * @fileoverview 推送按外键依赖排序（US-037）—— 真实 Supabase 栈上的 shop 外键
 *
 * @remarks
 * `shop."order"."ownerId"` 引用 `shop."user"(id)`（`order_ownerId_fkey`，ON DELETE CASCADE）。实体按「子在前」声明，
 * 推送顺序若沿用声明顺序，订单先到远端就撞 23503，被当终态拒绝、本地行随之删除。
 *
 * 读远端、做清理都用 authenticated 客户端：service_role 没有 shop schema 的权限。日志行只能由 service_role 删，
 * 且只删本文件写下的那几个实体 id，不碰共用栈上别的数据。
 */
import { Entity, EntityBase, PropertyType, RelationKind, RxDB, RxDBChange, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { afterAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import { createAuthenticatedTestClient, getSupabaseServiceRoleClient } from './test-utils.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';

@Entity({
  name: 'User',
  namespace: 'shop',
  tableName: 'user',
  properties: [{ name: 'name', type: PropertyType.string }]
})
class ShopUser extends EntityBase {
  declare name: string;
}

@Entity({
  name: 'Order',
  namespace: 'shop',
  tableName: 'order',
  properties: [
    { name: 'number', type: PropertyType.string },
    { name: 'amount', type: PropertyType.number }
  ],
  relations: [{ name: 'owner', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'User', mappedProperty: 'orders' }]
})
class ShopOrder extends EntityBase {
  declare number: string;
  declare amount: number;
  declare ownerId: string;
}

describe.skipIf(!SUPABASE_URL || !SUPABASE_KEY)('Supabase 推送按外键依赖排序（US-037）', () => {
  const runId = crypto.randomUUID().slice(0, 8);
  const remote = createAuthenticatedTestClient();
  const databases: RxDB[] = [];
  const userIds: string[] = [];
  const orderIds: string[] = [];
  let sequence = 0;

  /** 子实体 `Order` 声明在父实体 `User` 前面 */
  async function openClient(): Promise<RxDB> {
    const rxdb = new RxDB({
      dbName: `us037-${runId}-${databases.length}`,
      context: { userId: crypto.randomUUID() },
      entities: [ShopOrder, ShopUser],
      sync: { type: SyncType.Full, local: { adapter: 'wa-sqlite' }, remote: { adapter: 'supabase' } }
    });
    databases.push(rxdb);
    rxdb.adapter(
      'wa-sqlite',
      db => new RxDBAdapterWaSqlite(db, { vfs: 'MemoryAsyncVFS', async: true, worker: false, wasmPath: asyncWasmPath })
    );
    rxdb.adapter('supabase', db => new RxDBAdapterSupabase(db, { client: remote }));
    rxdb.use(rxDBPluginHistory);
    rxdb.use(rxDBPluginSync);
    await rxdb.connect('wa-sqlite');
    return rxdb;
  }

  async function saveUser(rxdb: RxDB): Promise<ShopUser> {
    const user = rxdb.entityManager.instantiate(ShopUser, { id: crypto.randomUUID(), name: `us037-${runId}` });
    userIds.push(user.id);
    await user.save();
    return user;
  }

  async function saveOrder(rxdb: RxDB, owner: ShopUser): Promise<ShopOrder> {
    sequence += 1;
    const order = rxdb.entityManager.instantiate(ShopOrder, {
      id: crypto.randomUUID(),
      number: `us037-${runId}-${sequence}`,
      amount: sequence,
      ownerId: owner.id
    });
    orderIds.push(order.id);
    await order.save();
    return order;
  }

  async function remoteIds(table: 'user' | 'order', ids: string[]): Promise<string[]> {
    const { data, error } = await remote.schema('shop').from(table).select('id').in('id', ids);
    if (error) throw error;
    return (data as { id: string }[]).map(row => row.id).sort();
  }

  async function localOrderIds(rxdb: RxDB): Promise<string[]> {
    const adapter = await rxdb.getAdapter('wa-sqlite');
    const rows = await adapter.getRepository(ShopOrder).find({ where: { combinator: 'and', rules: [] } });
    return rows.map(row => row.id).sort();
  }

  async function orderInsert(rxdb: RxDB, orderId: string): Promise<RxDBChange | undefined> {
    const adapter = await rxdb.getAdapter('wa-sqlite');
    const changes = await adapter.getRepository(RxDBChange).find({ where: { combinator: 'and', rules: [] } });
    return changes.find(change => String(change.entityId) === orderId && change.type === 'INSERT');
  }

  afterAll(async () => {
    try {
      // 先删订单再删用户；用户删除本会级联订单，显式删一遍让失败的用例也收得干净
      const { error: orderError } = await remote.schema('shop').from('order').delete().in('id', orderIds);
      if (orderError) throw orderError;
      const { error: userError } = await remote.schema('shop').from('user').delete().in('id', userIds);
      if (userError) throw userError;
      const { error: logError } = await getSupabaseServiceRoleClient()
        .from('rxdb_change')
        .delete()
        .in('entityId', [...userIds, ...orderIds]);
      if (logError) throw logError;
    } finally {
      for (const database of databases) await database.disconnectAll();
    }
  });

  it('AC#1：子实体声明在前，父子同批新建都到远端，本地订单保留并拿到 remoteId', async () => {
    const rxdb = await openClient();
    const user = await saveUser(rxdb);
    const order = await saveOrder(rxdb, user);

    const result = await rxdb.syncManager.push();

    expect(result).toMatchObject({ pushed: 2, rejected: 0, failures: [] });
    expect(await remoteIds('user', [user.id])).toEqual([user.id]);
    expect(await remoteIds('order', [order.id])).toEqual([order.id]);
    expect(await localOrderIds(rxdb)).toEqual([order.id]);
    expect((await orderInsert(rxdb, order.id))?.remoteId).toEqual(expect.any(Number));
  });

  it('AC#3：删旧建新混在一批，远端只剩新的一对，四条变更都被接受', async () => {
    const rxdb = await openClient();
    const oldUser = await saveUser(rxdb);
    const oldOrder = await saveOrder(rxdb, oldUser);
    await rxdb.syncManager.push();

    await oldOrder.remove();
    await oldUser.remove();
    const newUser = await saveUser(rxdb);
    const newOrder = await saveOrder(rxdb, newUser);

    const result = await rxdb.syncManager.push();

    expect(result).toMatchObject({ pushed: 4, rejected: 0, failures: [] });
    expect(await remoteIds('user', [oldUser.id, newUser.id])).toEqual([newUser.id]);
    expect(await remoteIds('order', [oldOrder.id, newOrder.id])).toEqual([newOrder.id]);
  });

  it('AC#5：只推子仓 pushRepository("shop", "Order")，用户一起推上去、订单被接受', async () => {
    const rxdb = await openClient();
    const user = await saveUser(rxdb);
    const order = await saveOrder(rxdb, user);

    const result = await rxdb.syncManager.pushRepository('shop', 'Order');

    expect(result).toMatchObject({ pushed: 1, rejected: 0, failures: [] });
    expect(result.relatedResults?.map(related => [related.repository.entity, related.pushed])).toEqual([['User', 1]]);
    expect(await remoteIds('order', [order.id])).toEqual([order.id]);
  });

  it('AC#7：远端用户已被别的客户端删掉时，新订单仍以 dependency 被拒并在本地移除', async () => {
    const rxdb = await openClient();
    const user = await saveUser(rxdb);
    await rxdb.syncManager.push();
    const { error } = await remote.schema('shop').from('user').delete().eq('id', user.id);
    if (error) throw error;
    const order = await saveOrder(rxdb, user);

    const result = await rxdb.syncManager.push();

    expect(result).toMatchObject({ pushed: 0, rejected: 1 });
    expect(await localOrderIds(rxdb)).toEqual([]);
    expect(rxdb.syncState.snapshot.lastRejections).toEqual([
      expect.objectContaining({ entity: 'Order', entityId: order.id, code: '23503', reason: 'dependency' })
    ]);
  });
});
