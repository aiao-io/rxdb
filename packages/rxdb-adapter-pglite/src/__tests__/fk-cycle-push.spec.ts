/**
 * @fileoverview 外键成环的推送落在真实 PGlite 上（US-038 AC#4、#5）
 *
 * @remarks
 * 双向一对一：`CycleUser.card` 可空（`SET NULL`）↔ `CycleCard.owner` 非空。本地同批新建互相引用的一对，
 * 远端替身（{@link ScriptedRemote}）声明支持延迟外键。断言推送把这一对放进一次 `mergeChanges` 并带上延迟外键，
 * 远端拒绝时两个仓库的回执、被拒对齐与水位线在一个本地事务里落库，没有本地外键错误。
 */
import {
  Entity,
  EntityBase,
  type EntitySyncOverride,
  type EntityType,
  OnDeleteAction,
  PropertyType,
  RelationKind,
  type RemoteChange,
  RxDB,
  RxDBSync,
  SyncType
} from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { ENTITIES as ShopEntities, IdCard as ShopIdCard, User as ShopUser } from '@aiao/rxdb-test/shop';
import { afterEach, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import {
  applied,
  newScript,
  rejected,
  type RemoteScript,
  SCRIPTED_REMOTE_ADAPTER,
  ScriptedRemote
} from './scripted-remote-fixture.js';

@Entity({
  name: 'CycleUser',
  namespace: 'cycle',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [
    {
      name: 'card',
      kind: RelationKind.ONE_TO_ONE,
      mappedEntity: 'CycleCard',
      mappedProperty: 'owner',
      nullable: true,
      onDelete: OnDeleteAction.SET_NULL
    }
  ]
})
class CycleUser extends EntityBase {
  declare name: string;
  declare cardId: string | null;
}

@Entity({
  name: 'CycleCard',
  namespace: 'cycle',
  properties: [{ name: 'code', type: PropertyType.string }],
  relations: [{ name: 'owner', kind: RelationKind.ONE_TO_ONE, mappedEntity: 'CycleUser', mappedProperty: 'card' }]
})
class CycleCard extends EntityBase {
  declare code: string;
  declare ownerId: string;
}

/** 与环无关的实体：环拉不下来时它照常拉 */
@Entity({ name: 'CycleNote', namespace: 'cycle', properties: [{ name: 'title', type: PropertyType.string }] })
class CycleNote extends EntityBase {
  declare title: string;
}

const opened: RxDB[] = [];

afterEach(async () => {
  for (const database of opened.splice(0)) await database.disconnectAll();
});

const createDatabase = async (
  script: RemoteScript,
  entities: EntityType[] = [CycleCard, CycleUser],
  syncOverrides: EntitySyncOverride[] = []
): Promise<RxDB> => {
  const database = new RxDB({
    dbName: `fk-cycle-push-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    context: { userId: 'us038' },
    entities,
    sync: { type: SyncType.Full, local: { adapter: 'pglite' }, remote: { adapter: SCRIPTED_REMOTE_ADAPTER } },
    syncOverrides
  });
  database.adapter('pglite', async db => new RxDBAdapterPGlite(db, { store: 'memory' }));
  database.adapter(SCRIPTED_REMOTE_ADAPTER, async db => new ScriptedRemote(db, script));
  database.use(rxDBPluginSync);
  database.use(rxDBPluginHistory);
  opened.push(database);
  await database.connect('pglite');
  await database.connect(SCRIPTED_REMOTE_ADAPTER);
  await database.versionManager.getCurrentBranch();
  return database;
};

/** 同一个事务里新建互相引用的一对：本地外键延迟到提交时检查 */
const savePair = async (database: RxDB, n: number) => {
  const userId = crypto.randomUUID();
  const cardId = crypto.randomUUID();
  const user = database.entityManager.instantiate(CycleUser, { id: userId as never, name: `u${n}`, cardId });
  const card = database.entityManager.instantiate(CycleCard, { id: cardId as never, code: `c${n}`, ownerId: userId });
  await database.entityManager.saveMany([user, card]);
  return { userId, cardId };
};

const localIds = async (database: RxDB) => {
  const adapter = await database.getAdapter('pglite');
  const all = { combinator: 'and' as const, rules: [] };
  return {
    users: (await adapter.getRepository(CycleUser).find({ where: all })).map(row => row.id),
    cards: (await adapter.getRepository(CycleCard).find({ where: all })).map(row => row.id)
  };
};

const watermarks = async (database: RxDB) => {
  const adapter = await database.getAdapter('pglite');
  const records = await adapter.getRepository(RxDBSync).find({ where: { combinator: 'and', rules: [] } });
  return Object.fromEntries(records.map(record => [record.entity, record.lastPushedChangeId]));
};

describe('外键成环的推送落在 PGlite 上（US-038）', () => {
  it('AC#4：同批新建的一对放进一次 mergeChanges，带上延迟外键 cycle.CycleUser.cardId；全部接受后水位线推进', async () => {
    const script = newScript(applied);
    script.supportsDeferredForeignKeys = true;
    const database = await createDatabase(script);
    await savePair(database, 1);

    const result = await database.syncManager.push();

    expect(result).toMatchObject({ pushed: 2, rejected: 0, failed: 0, failures: [] });
    expect(script.calls).toHaveLength(1);
    expect(script.calls[0].changes.map(change => change.entity)).toEqual(['CycleUser', 'CycleCard']);
    expect(script.calls[0].options).toEqual({
      deferredForeignKeys: [{ namespace: 'cycle', entity: 'CycleUser', property: 'cardId' }]
    });
    const marks = await watermarks(database);
    expect(marks['CycleUser']).not.toBeNull();
    expect(marks['CycleCard']).not.toBeNull();
  });

  it('AC#5：远端以依赖拒绝环内两个成员（证件被拒、用户的补写随之失败）：回执、被拒对齐与水位线一个事务落库，没有本地外键错误', async () => {
    const script = newScript(change => rejected(change, 'dependency'));
    script.supportsDeferredForeignKeys = true;
    const database = await createDatabase(script);
    const { userId, cardId } = await savePair(database, 1);

    const result = await database.syncManager.push();

    expect(result).toMatchObject({ pushed: 0, rejected: 2, failed: 0, failures: [] });
    // 被拒的新建在本地对齐成远端的样子：两行都删掉（子先父后，证件先删、用户的外键随之置空再删）
    expect(await localIds(database)).toEqual({ users: [], cards: [] });
    const marks = await watermarks(database);
    expect(marks['CycleUser']).not.toBeNull();
    expect(marks['CycleCard']).not.toBeNull();
    expect(database.syncState.snapshot.lastRejections.map(item => [item.entity, item.entityId])).toEqual(
      expect.arrayContaining([
        ['CycleUser', userId],
        ['CycleCard', cardId]
      ])
    );
  });

  it('远端不支持延迟外键：这一环以 remote-unsupported 失败，不发请求，本地两行与待推都原样保留', async () => {
    const script = newScript(applied);
    const database = await createDatabase(script);
    const { userId, cardId } = await savePair(database, 1);

    const result = await database.syncManager.push();

    expect(script.calls).toEqual([]);
    expect(
      result.failures.map(failure => [failure.repository?.entity, (failure.error as { reason?: string }).reason])
    ).toEqual(
      expect.arrayContaining([
        ['CycleUser', 'remote-unsupported'],
        ['CycleCard', 'remote-unsupported']
      ])
    );
    expect(await localIds(database)).toEqual({ users: [userId], cards: [cardId] });
    // 水位线不动：两条新建下一轮照样待推
    const marks = await watermarks(database);
    expect(marks['CycleUser'] ?? null).toBeNull();
    expect(marks['CycleCard'] ?? null).toBeNull();
  });
});

const REMOTE_AT = '2026-11-26T08:00:00.000Z';

/** 远端日志里一条整行的新建：拉取按它落库 */
const remoteInsert = (id: number, entity: string, row: Record<string, unknown>): RemoteChange => ({
  id,
  namespace: 'cycle',
  entity,
  entityId: String(row['id']),
  branchId: 'main',
  type: 'INSERT',
  patch: { createdAt: REMOTE_AT, updatedAt: REMOTE_AT, createdBy: null, updatedBy: null, ...row },
  inversePatch: null,
  clientId: 'remote-client',
  createdAt: new Date(REMOTE_AT),
  updatedAt: new Date(REMOTE_AT)
});

const localRows = async (database: RxDB) => {
  const adapter = await database.getAdapter('pglite');
  const all = { combinator: 'and' as const, rules: [] };
  const users = await adapter.getRepository(CycleUser).find({ where: all });
  const cards = await adapter.getRepository(CycleCard).find({ where: all });
  return {
    users: Object.fromEntries(users.map(user => [user.id, user.cardId])),
    cards: Object.fromEntries(cards.map(card => [card.id, card.ownerId]))
  };
};

describe('外键成环的拉取落在 PGlite 上（US-038）', () => {
  it('AC#13：limit = 1，一页在环中间截断：续拉补齐，两对都在一个事务里落库、互相引用一致', async () => {
    const [u1, u2, c1, c2] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    const script = newScript(applied);
    // 第一页（每仓一条）只有 u1 与 c2：u1 引用的 c1、c2 引用的 u2 都在下一页
    script.log.push(
      remoteInsert(1, 'CycleUser', { id: u1, name: 'u1', cardId: c1 }),
      remoteInsert(2, 'CycleUser', { id: u2, name: 'u2', cardId: c2 }),
      remoteInsert(3, 'CycleCard', { id: c2, code: 'c2', ownerId: u2 }),
      remoteInsert(4, 'CycleCard', { id: c1, code: 'c1', ownerId: u1 })
    );
    const database = await createDatabase(script);

    const result = await database.syncManager.pull({ limit: 1, fetchAll: true });

    expect(result.failures).toEqual([]);
    expect(await localRows(database)).toEqual({ users: { [u1]: c1, [u2]: c2 }, cards: { [c1]: u1, [c2]: u2 } });
  });

  it('AC#14：pullRepository 拉环上的一个仓库：整个环在一个本地事务里落库', async () => {
    const [userId, cardId] = [crypto.randomUUID(), crypto.randomUUID()];
    const script = newScript(applied);
    // 证件的日志在前：逐仓各开事务时先提交的那个仓库会撞上另一半还没落库的外键
    script.log.push(
      remoteInsert(1, 'CycleCard', { id: cardId, code: 'c', ownerId: userId }),
      remoteInsert(2, 'CycleUser', { id: userId, name: 'u', cardId })
    );
    const database = await createDatabase(script);

    const result = await database.syncManager.pullRepository('cycle', 'CycleUser', { fetchAll: true });

    expect(result.failures).toEqual([]);
    expect(await localRows(database)).toEqual({ users: { [userId]: cardId }, cards: { [cardId]: userId } });
  });

  it('AC#17：环上有按条件同步的成员：pull() 让这一环以 pull-unsupported-member 失败，其他仓库照常拉', async () => {
    const script = newScript(applied);
    const noteId = crypto.randomUUID();
    script.log.push(remoteInsert(1, 'CycleNote', { id: noteId, title: 'n' }));
    const database = await createDatabase(
      script,
      [CycleCard, CycleUser, CycleNote],
      [
        {
          entity: CycleUser,
          sync: {
            type: SyncType.Filter,
            local: { adapter: 'pglite' },
            remote: { adapter: SCRIPTED_REMOTE_ADAPTER, filter: () => ({ combinator: 'and', rules: [] }) }
          }
        }
      ]
    );

    const result = await database.syncManager.pull({ fetchAll: true });

    expect(
      result.failures.map(failure => [failure.repository?.entity, (failure.error as { reason?: string }).reason])
    ).toEqual(
      expect.arrayContaining([
        ['CycleUser', 'pull-unsupported-member'],
        ['CycleCard', 'pull-unsupported-member']
      ])
    );
    const adapter = await database.getAdapter('pglite');
    const notes = await adapter.getRepository(CycleNote).find({ where: { combinator: 'and', rules: [] } });
    expect(notes.map(note => note.id)).toEqual([noteId]);
  });
});

describe('注册 shop 夹具全部实体（US-038 AC#1）', () => {
  it('AC#1：push() 与 pull() 都不抛 Circular dependency，没有变更的仓库正常返回', async () => {
    const database = await createDatabase(newScript(applied), ShopEntities);

    expect(await database.syncManager.push()).toMatchObject({ pushed: 0, rejected: 0, failed: 0, failures: [] });
    expect(await database.syncManager.pull({ fetchAll: true })).toMatchObject({ failures: [] });
  });

  it('同批新建 shop 的用户与身份证（带复合外键）：一次 mergeChanges，带上延迟外键 shop.User.idCardId', async () => {
    const script = newScript(applied);
    script.supportsDeferredForeignKeys = true;
    const database = await createDatabase(script, ShopEntities);
    const userId = crypto.randomUUID();
    const cardId = crypto.randomUUID();
    await database.entityManager.saveMany([
      database.entityManager.instantiate(ShopUser, { id: userId as never, name: 'u', idCardId: cardId }),
      database.entityManager.instantiate(ShopIdCard, { id: cardId as never, code: 'c', ownerId: userId })
    ]);

    const result = await database.syncManager.push();

    expect(result).toMatchObject({ pushed: 2, rejected: 0, failed: 0, failures: [] });
    expect(script.calls).toHaveLength(1);
    expect(script.calls[0].changes.map(change => change.entity)).toEqual(['User', 'IdCard']);
    expect(script.calls[0].options).toEqual({
      deferredForeignKeys: [{ namespace: 'shop', entity: 'User', property: 'idCardId' }]
    });
  });
});
