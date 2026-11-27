/**
 * @fileoverview 多对多关联的推拉同步（US-228 AC#7～#10）—— 真实 Supabase 栈上的 shop 中间表
 *
 * @remarks
 * `shop."Category_OrderItem"` 按契约建表：`id uuid` 主键、两端外键 ON DELETE CASCADE、两端成对唯一，并登记同步。
 * 两个客户端（各自一个内存 wa-sqlite）关联同一对数据：关联行 id 由两端派生，远端只落一行、推送不撞成对唯一。
 *
 * 实体是这里自己声明的 shop 子集（User、Order、OrderItem、Category）：用 `@aiao/rxdb-test/shop` 会带进
 * User ↔ IdCard 的环（US-038）。远端的每一列都声明上，拉下来的行不带未知列。读远端、做清理用 authenticated 客户端
 * （service_role 没有 shop schema 的权限）；日志与历史只能由 service_role 删，只删本文件写下的那些实体 id。
 */
import {
  Entity,
  EntityBase,
  type EntityType,
  getEntityMetadata,
  junctionEntityId,
  OnDeleteAction,
  PropertyType,
  type RelationEntitiesObservable,
  RelationKind,
  RxDB,
  SyncType
} from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import { createAuthenticatedTestClient, getSupabaseServiceRoleClient } from './test-utils.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';

@Entity({
  name: 'User',
  namespace: 'shop',
  tableName: 'user',
  properties: [
    { name: 'name', type: PropertyType.string },
    { name: 'idCardId', type: PropertyType.uuid, nullable: true },
    { name: 'married', type: PropertyType.boolean, nullable: true },
    { name: 'age', type: PropertyType.number, nullable: true },
    { name: 'gender', type: PropertyType.string, nullable: true }
  ]
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
    { name: 'amount', type: PropertyType.number },
    { name: 'status', type: PropertyType.string, nullable: true }
  ],
  relations: [
    {
      name: 'owner',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'User',
      mappedProperty: 'orders',
      onDelete: OnDeleteAction.CASCADE
    }
  ]
})
class ShopOrder extends EntityBase {
  declare number: string;
  declare amount: number;
  declare ownerId: string;
}

@Entity({
  name: 'OrderItem',
  namespace: 'shop',
  tableName: 'order_item',
  properties: [
    { name: 'productName', type: PropertyType.string },
    { name: 'quantity', type: PropertyType.number },
    { name: 'price', type: PropertyType.number },
    { name: 'skuId', type: PropertyType.uuid, nullable: true }
  ],
  relations: [
    {
      name: 'order',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'Order',
      mappedProperty: 'items',
      onDelete: OnDeleteAction.CASCADE
    },
    { name: 'categories', kind: RelationKind.MANY_TO_MANY, mappedEntity: 'Category', mappedProperty: 'orderItems' }
  ]
})
class ShopOrderItem extends EntityBase {
  declare productName: string;
  declare quantity: number;
  declare price: number;
  declare orderId: string;
  declare categories$: RelationEntitiesObservable<typeof ShopCategory>;
}

@Entity({
  name: 'Category',
  namespace: 'shop',
  tableName: 'category',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [
    { name: 'orderItems', kind: RelationKind.MANY_TO_MANY, mappedEntity: 'OrderItem', mappedProperty: 'categories' }
  ]
})
class ShopCategory extends EntityBase {
  declare name: string;
  declare orderItems$: RelationEntitiesObservable<typeof ShopOrderItem>;
}

describe.skipIf(!SUPABASE_URL || !SUPABASE_KEY)('Supabase 多对多关联的推拉同步（US-228）', () => {
  const runId = crypto.randomUUID().slice(0, 8);
  const remote = createAuthenticatedTestClient();
  const databases: RxDB[] = [];
  const userId = crypto.randomUUID();
  const orderId = crypto.randomUUID();
  const itemIds = [crypto.randomUUID(), crypto.randomUUID()] as const;
  const categoryIds = [crypto.randomUUID(), crypto.randomUUID()] as const;
  let alice!: RxDB;
  let bob!: RxDB;

  async function openClient(): Promise<RxDB> {
    const rxdb = new RxDB({
      dbName: `us228-${runId}-${databases.length}`,
      context: { userId: crypto.randomUUID() },
      entities: [ShopCategory, ShopOrderItem, ShopOrder, ShopUser],
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

  const junctionOf = (rxdb: RxDB): EntityType => {
    const junction = rxdb.schemaManager.getEntityType('Category_OrderItem', 'shop');
    if (!junction) throw new Error('shop.Category_OrderItem 中间表没有生成');
    return junction;
  };

  const pairId = (rxdb: RxDB, categoryId: string, itemId: string) =>
    junctionEntityId(getEntityMetadata(junctionOf(rxdb)), [
      { foreignKey: 'categoriesId', id: categoryId, uuid: true },
      { foreignKey: 'orderItemsId', id: itemId, uuid: true }
    ]);

  async function item(rxdb: RxDB, id: string): Promise<ShopOrderItem> {
    return firstValueFrom(rxdb.entityManager.getRepository(ShopOrderItem).get(id as never));
  }

  async function category(rxdb: RxDB, id: string): Promise<ShopCategory> {
    return firstValueFrom(rxdb.entityManager.getRepository(ShopCategory).get(id as never));
  }

  /** 本机中间表里这一对的行 id */
  async function localPairIds(rxdb: RxDB, categoryId: string, itemId: string): Promise<string[]> {
    const adapter = await rxdb.getAdapter('wa-sqlite');
    const rows = await adapter.getRepository(junctionOf(rxdb)).find({
      where: {
        combinator: 'and',
        rules: [
          { field: 'categoriesId', operator: '=', value: categoryId },
          { field: 'orderItemsId', operator: '=', value: itemId }
        ]
      }
    });
    return rows.map(row => String(row.id));
  }

  /** 远端中间表里这一对的行 id */
  async function remotePairIds(categoryId: string, itemId: string): Promise<string[]> {
    const { data, error } = await remote
      .schema('shop')
      .from('Category_OrderItem')
      .select('id')
      .eq('categoriesId', categoryId)
      .eq('orderItemsId', itemId);
    if (error) throw error;
    return (data as { id: string }[]).map(row => row.id);
  }

  async function pushClean(rxdb: RxDB): Promise<void> {
    expect(await rxdb.syncManager.push()).toMatchObject({ rejected: 0, failed: 0, failures: [] });
  }

  async function pullClean(rxdb: RxDB): Promise<void> {
    expect(await rxdb.syncManager.pull()).toMatchObject({ failures: [] });
  }

  async function link(rxdb: RxDB, categoryId: string, itemId: string): Promise<void> {
    const target = await item(rxdb, itemId);
    await target.categories$.add(await category(rxdb, categoryId));
    await target.save();
  }

  beforeAll(async () => {
    alice = await openClient();
    bob = await openClient();
    // Alice 建好两端与上面的订单、用户并推上去，Bob 拉下来：之后两边都有同样的两端
    const em = alice.entityManager;
    await em.instantiate(ShopUser, { id: userId as never, name: `us228-${runId}` }).save();
    await em
      .instantiate(ShopOrder, { id: orderId as never, number: `us228-${runId}`, amount: 2, ownerId: userId })
      .save();
    for (const [index, id] of itemIds.entries()) {
      await em
        .instantiate(ShopOrderItem, {
          id: id as never,
          productName: `us228-${runId}-${index}`,
          quantity: 1,
          price: 1,
          orderId
        })
        .save();
    }
    for (const [index, id] of categoryIds.entries()) {
      await em.instantiate(ShopCategory, { id: id as never, name: `us228-${runId}-${index}` }).save();
    }
    await pushClean(alice);
    await pullClean(bob);
  });

  afterAll(async () => {
    try {
      // 删用户级联删订单、订单项与中间表行；分类单独删（中间表行随之级联）
      const { error: userError } = await remote.schema('shop').from('user').delete().eq('id', userId);
      if (userError) throw userError;
      const { error: categoryError } = await remote.schema('shop').from('category').delete().in('id', categoryIds);
      if (categoryError) throw categoryError;
      const junctionIds = categoryIds.flatMap(categoryId => itemIds.map(itemId => pairId(alice, categoryId, itemId)));
      const entityIds = [userId, orderId, ...itemIds, ...categoryIds, ...junctionIds];
      const service = getSupabaseServiceRoleClient();
      const { error: logError } = await service.from('rxdb_change').delete().in('entityId', entityIds);
      if (logError) throw logError;
      const { error: historyError } = await service.from('rxdb_change_history').delete().in('entityId', entityIds);
      if (historyError) throw historyError;
    } finally {
      for (const database of databases) await database.disconnectAll();
    }
  });

  it('AC#7 Alice 关联一对并推送，Bob 拉取：Bob 有这条关联，id 与 Alice 的相同', async () => {
    const expected = pairId(alice, categoryIds[0], itemIds[0]);

    await link(alice, categoryIds[0], itemIds[0]);
    expect(await localPairIds(alice, categoryIds[0], itemIds[0])).toEqual([expected]);
    await pushClean(alice);
    expect(await remotePairIds(categoryIds[0], itemIds[0])).toEqual([expected]);

    await pullClean(bob);
    expect(await localPairIds(bob, categoryIds[0], itemIds[0])).toEqual([expected]);
  });

  it('AC#8 两人同时关联同一对并各自推送：远端只有一行，两边都看到这条关联，没有推送失败', async () => {
    const expected = pairId(alice, categoryIds[1], itemIds[1]);

    await link(alice, categoryIds[1], itemIds[1]);
    await link(bob, categoryIds[1], itemIds[1]);
    await pushClean(alice);
    await pushClean(bob);

    expect(await remotePairIds(categoryIds[1], itemIds[1])).toEqual([expected]);
    await pullClean(alice);
    await pullClean(bob);
    expect(await localPairIds(alice, categoryIds[1], itemIds[1])).toEqual([expected]);
    expect(await localPairIds(bob, categoryIds[1], itemIds[1])).toEqual([expected]);
  });

  it('AC#9 Alice 取消关联并推送，Bob 拉取：Bob 的这条关联消失', async () => {
    const target = await item(alice, itemIds[0]);
    await target.categories$.remove(await category(alice, categoryIds[0]));
    await target.save();
    await pushClean(alice);
    expect(await remotePairIds(categoryIds[0], itemIds[0])).toEqual([]);

    await pullClean(bob);
    expect(await localPairIds(bob, categoryIds[0], itemIds[0])).toEqual([]);
  });

  it('AC#10 Alice 删掉一端（分类）并推送，Bob 拉取：远端与 Bob 的中间表行都随之消失', async () => {
    await (await category(alice, categoryIds[1])).remove();
    await pushClean(alice);
    expect(await remotePairIds(categoryIds[1], itemIds[1])).toEqual([]);

    await pullClean(bob);
    expect(await localPairIds(bob, categoryIds[1], itemIds[1])).toEqual([]);
    const { data, error } = await remote.schema('shop').from('category').select('id').eq('id', categoryIds[1]);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
