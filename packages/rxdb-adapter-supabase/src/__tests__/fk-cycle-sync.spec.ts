/**
 * @fileoverview 双向一对一的推拉（US-038 AC#12～#16）—— 真实 Supabase 栈上的 shop 用户与身份证
 *
 * @remarks
 * `shop."user"."idCardId"` 可空（ON DELETE SET NULL）↔ `shop.id_card."ownerId"` 非空（ON DELETE CASCADE），
 * 另有复合外键 `("idCardId", id)` → `id_card(id, "ownerId")`。本地同批新建互相引用的一对，推送时 `idCardId`
 * 先写空、同一请求里补写（`p_deferred_columns`）；另一个客户端拉取时环内的行在一个本地事务里落库。
 *
 * 实体是这里自己声明的 shop 子集（与夹具同形、远端的每一列都声明上）。读远端、做清理用 authenticated 客户端
 * （service_role 没有 shop schema 的权限）；日志与历史只能由 service_role 删，只删本文件写下的那些实体 id。
 */
import { Entity, EntityBase, OnDeleteAction, PropertyType, RelationKind, RxDB, SyncType } from '@aiao/rxdb';
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
    { name: 'married', type: PropertyType.boolean, nullable: true },
    { name: 'age', type: PropertyType.number, nullable: true },
    { name: 'gender', type: PropertyType.string, nullable: true }
  ],
  relations: [
    {
      name: 'idCard',
      kind: RelationKind.ONE_TO_ONE,
      mappedEntity: 'IdCard',
      mappedProperty: 'owner',
      nullable: true,
      onDelete: OnDeleteAction.SET_NULL
    }
  ],
  foreignKeys: [
    {
      name: 'id_card_owner_consistency',
      properties: ['idCardId', 'id'],
      mappedEntity: 'IdCard',
      mappedProperties: ['id', 'ownerId']
    }
  ]
})
class ShopUser extends EntityBase {
  declare name: string;
  declare idCardId: string | null;
}

@Entity({
  name: 'IdCard',
  namespace: 'shop',
  tableName: 'id_card',
  properties: [{ name: 'code', type: PropertyType.string, unique: true }],
  relations: [
    { name: 'owner', kind: RelationKind.ONE_TO_ONE, mappedEntity: 'User', mappedProperty: 'idCard', nullable: false }
  ],
  indexes: [{ name: 'card_owner_identity', properties: ['id', 'ownerId'], unique: true }]
})
class ShopIdCard extends EntityBase {
  declare code: string;
  declare ownerId: string;
}

describe.skipIf(!SUPABASE_URL || !SUPABASE_KEY)('Supabase 双向一对一的推拉（US-038）', () => {
  const runId = crypto.randomUUID().slice(0, 8);
  const remote = createAuthenticatedTestClient();
  const databases: RxDB[] = [];
  const userIds: string[] = [];
  const cardIds: string[] = [];
  let alice!: RxDB;
  let bob!: RxDB;

  async function openClient(): Promise<RxDB> {
    const rxdb = new RxDB({
      dbName: `us038-${runId}-${databases.length}`,
      context: { userId: crypto.randomUUID() },
      entities: [ShopIdCard, ShopUser],
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

  /** 本地同一个事务里新建互相引用的一对 */
  async function savePair(rxdb: RxDB, n: number): Promise<{ userId: string; cardId: string }> {
    const userId = crypto.randomUUID();
    const cardId = crypto.randomUUID();
    userIds.push(userId);
    cardIds.push(cardId);
    const user = rxdb.entityManager.instantiate(ShopUser, {
      id: userId as never,
      name: `us038-${runId}-${n}`,
      idCardId: cardId
    });
    const card = rxdb.entityManager.instantiate(ShopIdCard, {
      id: cardId as never,
      code: `us038-${runId}-${n}`,
      ownerId: userId
    });
    await rxdb.entityManager.saveMany([user, card]);
    return { userId, cardId };
  }

  async function remoteRow(table: 'user' | 'id_card', id: string) {
    const { data, error } = await remote.schema('shop').from(table).select('*').eq('id', id);
    if (error) throw error;
    return (data as Record<string, unknown>[])[0];
  }

  async function local(rxdb: RxDB, userId: string, cardId: string) {
    const adapter = await rxdb.getAdapter('wa-sqlite');
    const byId = (id: string) => ({
      combinator: 'and' as const,
      rules: [{ field: 'id' as const, operator: '=' as const, value: id }]
    });
    const [user] = await adapter.getRepository(ShopUser).find({ where: byId(userId) });
    const [card] = await adapter.getRepository(ShopIdCard).find({ where: byId(cardId) });
    return { user: user && { idCardId: user.idCardId }, card: card && { ownerId: card.ownerId } };
  }

  async function pushClean(rxdb: RxDB, pushed?: number): Promise<void> {
    const result = await rxdb.syncManager.push();
    expect(result).toMatchObject({ rejected: 0, failed: 0, failures: [], ...(pushed === undefined ? {} : { pushed }) });
  }

  async function pullClean(rxdb: RxDB, limit?: number): Promise<void> {
    expect(await rxdb.syncManager.pull({ fetchAll: true, ...(limit ? { limit } : {}) })).toMatchObject({
      failures: []
    });
  }

  beforeAll(async () => {
    alice = await openClient();
    bob = await openClient();
  });

  afterAll(async () => {
    try {
      // 删用户级联删身份证；身份证再显式删一遍，让失败的用例也收得干净
      const { error: userError } = await remote.schema('shop').from('user').delete().in('id', userIds);
      if (userError) throw userError;
      const { error: cardError } = await remote.schema('shop').from('id_card').delete().in('id', cardIds);
      if (cardError) throw cardError;
      const service = getSupabaseServiceRoleClient();
      const entityIds = [...userIds, ...cardIds];
      const { error: logError } = await service.from('rxdb_change').delete().in('entityId', entityIds);
      if (logError) throw logError;
      const { error: historyError } = await service.from('rxdb_change_history').delete().in('entityId', entityIds);
      if (historyError) throw historyError;
    } finally {
      for (const database of databases) await database.disconnectAll();
    }
  });

  it('AC#12：本地同批新建互相引用的用户与身份证，一次推送：远端两行都在、互相引用一致，无被拒', async () => {
    const { userId, cardId } = await savePair(alice, 1);

    await pushClean(alice, 2);

    expect(await remoteRow('user', userId)).toMatchObject({ idCardId: cardId });
    expect(await remoteRow('id_card', cardId)).toMatchObject({ ownerId: userId });
  });

  it('AC#13：客户端 B 以 limit = 1 拉取：环内的行一起落库，两行一致', async () => {
    const [userId, cardId] = [userIds[0], cardIds[0]];

    await pullClean(bob, 1);

    expect(await local(bob, userId, cardId)).toEqual({ user: { idCardId: cardId }, card: { ownerId: userId } });
  });

  it('AC#14：新的客户端只拉 User（pullRepository）：环内成员在一个本地事务里落库', async () => {
    const [userId, cardId] = [userIds[0], cardIds[0]];
    const carol = await openClient();

    const result = await carol.syncManager.pullRepository('shop', 'User', { fetchAll: true });

    expect(result.failures).toEqual([]);
    expect(await local(carol, userId, cardId)).toEqual({ user: { idCardId: cardId }, card: { ownerId: userId } });
  });

  it('AC#15：A 删掉身份证并推送，B 拉取：远端与 B 本地的 idCardId 都为空，用户还在', async () => {
    const [userId, cardId] = [userIds[0], cardIds[0]];
    const card = await firstValueFrom(alice.entityManager.getRepository(ShopIdCard).get(cardId as never));

    await card.remove();
    await pushClean(alice);
    await pullClean(bob);

    expect(await remoteRow('id_card', cardId)).toBeUndefined();
    expect(await remoteRow('user', userId)).toMatchObject({ idCardId: null });
    expect(await local(bob, userId, cardId)).toEqual({ user: { idCardId: null }, card: undefined });
  });

  it('AC#16：A 删掉用户并推送，B 拉取：远端与 B 本地的身份证一并消失', async () => {
    const { userId, cardId } = await savePair(alice, 2);
    await pushClean(alice, 2);
    await pullClean(bob);
    expect(await local(bob, userId, cardId)).toEqual({ user: { idCardId: cardId }, card: { ownerId: userId } });

    const user = await firstValueFrom(alice.entityManager.getRepository(ShopUser).get(userId as never));
    await user.remove();
    await pushClean(alice);
    await pullClean(bob);

    expect(await remoteRow('user', userId)).toBeUndefined();
    expect(await remoteRow('id_card', cardId)).toBeUndefined();
    expect(await local(bob, userId, cardId)).toEqual({ user: undefined, card: undefined });
  });
});
