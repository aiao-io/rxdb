/**
 * @fileoverview 分区实体的本地写入（US-034）—— 真实 PGlite 本地 + 脚本化远端。
 *
 * @remarks
 * 商品（`CatalogItem`）按授权分区同步。这里只验本地一侧：本地增删改留下带 `patch` / `inversePatch` 的变更，
 * 能按商品作用域撤销、重做；推送之后撤销栈清空；拉取到远端变更之后撤销历史失效，但没推的修改照样待推。
 * 远端按写后的行算区、日志不带正文、换区与 RLS 被拒由 Supabase 真栈用例（`rxdb-adapter-supabase`）覆盖。
 *
 * 商品声明了按租户的成员写权限（US-234 阶段 B）：脚本化远端不报告授权，快照由应用设入本租户的 `edit`。
 */
import { type RemoteChange, RxDB, RxDBChange, SyncType } from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { CatalogItem } from '@aiao/rxdb-test/entities';
import { firstValueFrom, type Observable } from 'rxjs';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { newScript, type RemoteScript, SCRIPTED_REMOTE_ADAPTER, ScriptedRemote } from './scripted-remote-fixture.js';

const TENANT = 'xinghe';
const REMOTE_AT = '2026-11-20T08:00:00.000Z';

const opened: RxDB[] = [];

afterEach(async () => {
  const pending = opened.splice(0);
  for (const database of pending) await database.disconnectAll();
});

/** 商品按 `SyncType.Filter` 同步：本租户的商品全部同步（远端替身不求值条件） */
const createDatabase = async (script: RemoteScript): Promise<RxDB> => {
  const database = new RxDB({
    dbName: `catalog-local-writes-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    context: { userId: 'us034-alice' },
    entities: [CatalogItem],
    sync: { type: SyncType.None, local: { adapter: 'pglite' }, remote: { adapter: SCRIPTED_REMOTE_ADAPTER } },
    syncOverrides: [
      {
        entity: CatalogItem,
        sync: {
          type: SyncType.Filter,
          local: { adapter: 'pglite' },
          remote: {
            adapter: SCRIPTED_REMOTE_ADAPTER,
            filter: () => ({ combinator: 'and', rules: [{ field: 'tenantId', operator: '=', value: TENANT }] })
          }
        }
      }
    ]
  });
  database.adapter('pglite', async db => new RxDBAdapterPGlite(db, { store: 'memory' }));
  database.adapter(SCRIPTED_REMOTE_ADAPTER, async db => new ScriptedRemote(db, script));
  database.use(rxDBPluginSync);
  database.use(rxDBPluginHistory);
  opened.push(database);
  await database.connect('pglite');
  await database.connect(SCRIPTED_REMOTE_ADAPTER);
  await database.grants.set([{ scope: `tenant:${TENANT}`, permissions: ['read', 'edit'] }]);
  await database.versionManager.getCurrentBranch();
  return database;
};

const saveItem = async (fields: Partial<Pick<CatalogItem, 'name' | 'price' | 'visibility'>> = {}) => {
  const item = new CatalogItem();
  item.name = fields.name ?? '星河 X3 耳机';
  item.category = '数码';
  item.price = fields.price ?? 299;
  item.cost = 120;
  item.visibility = fields.visibility ?? 'public';
  item.tenantId = TENANT;
  await item.save();
  return item;
};

/** 远端日志里一条整行的商品写入：拉取按它落库 */
const remoteItem = (id: number, entityId: string, fields: Partial<CatalogItem>): RemoteChange => ({
  id,
  namespace: 'public',
  entity: 'CatalogItem',
  entityId,
  branchId: 'main',
  type: 'INSERT',
  patch: {
    id: entityId,
    name: '远端商品',
    category: '数码',
    price: 99,
    cost: 40,
    visibility: 'public',
    tenantId: TENANT,
    createdAt: REMOTE_AT,
    updatedAt: REMOTE_AT,
    createdBy: null,
    updatedBy: null,
    ...fields
  },
  inversePatch: null,
  clientId: 'bob-client',
  createdAt: new Date(REMOTE_AT),
  updatedAt: new Date(REMOTE_AT)
});

const localItems = async (database: RxDB): Promise<CatalogItem[]> => {
  const adapter = await database.getAdapter('pglite');
  return adapter.getRepository(CatalogItem).find({ where: { combinator: 'and', rules: [] } });
};

const localItem = async (database: RxDB, id: string): Promise<CatalogItem | undefined> =>
  (await localItems(database)).find(item => item.id === id);

const catalogChanges = async (database: RxDB): Promise<RxDBChange[]> => {
  const adapter = await database.getAdapter('pglite');
  const changes = await adapter.getRepository(RxDBChange).find({ where: { combinator: 'and', rules: [] } });
  return changes.filter(change => change.entity === 'CatalogItem').sort((left, right) => left.id - right.id);
};

const pushableCount = async (database: RxDB): Promise<number> =>
  (await database.syncManager.getRepositorySyncStatus('public', 'CatalogItem')).pushableCount;

/** 订阅一条计数流，返回它最新的值；断言用 `vi.waitFor` 等它追上 */
const track = (count$: Observable<number>): { readonly latest: () => number | undefined } => {
  let latest: number | undefined;
  const subscription = count$.subscribe(value => (latest = value));
  onTestFinished(() => subscription.unsubscribe());
  return { latest: () => latest };
};

describe('分区实体的本地写入（US-034）', () => {
  it('AC#1：本地新建一件商品，留下带 patch 的 INSERT，待推数加 1', async () => {
    const database = await createDatabase(newScript());

    const item = await saveItem();

    expect(await localItem(database, item.id)).toMatchObject({ name: '星河 X3 耳机', price: 299, tenantId: TENANT });
    expect(await catalogChanges(database)).toEqual([
      expect.objectContaining({
        type: 'INSERT',
        entityId: item.id,
        patch: expect.objectContaining({ name: '星河 X3 耳机', price: 299, tenantId: TENANT })
      })
    ]);
    expect(await pushableCount(database)).toBe(1);
  });

  it('AC#2：改售价后撤销回到原值、重做回到新值；UPDATE 带 patch 与 inversePatch', async () => {
    const database = await createDatabase(newScript());
    const history = database.versionManager.history(CatalogItem);
    const item = await saveItem({ price: 299 });

    item.price = 399;
    await item.save();

    const update = (await catalogChanges(database)).find(change => change.type === 'UPDATE');
    expect(update).toMatchObject({ patch: { price: 399 }, inversePatch: { price: 299 } });

    await history.undo();
    expect((await localItem(database, item.id))?.price).toBe(299);

    await history.redo();
    expect((await localItem(database, item.id))?.price).toBe(399);
  });

  it('AC#3：删除一件已同步的商品后撤销，商品按删除前的字段恢复', async () => {
    const script = newScript();
    const syncedId = crypto.randomUUID();
    script.log.push(remoteItem(1, syncedId, { name: '星河智能手环', price: 199, cost: 80 }));
    const database = await createDatabase(script);
    await database.syncManager.pullRepository('public', 'CatalogItem');
    const before = await localItem(database, syncedId);
    if (!before) throw new Error('fixture: 拉取后本地应有这件商品');
    const fields = { name: before.name, category: before.category, price: before.price, cost: before.cost };

    const history = database.versionManager.history(CatalogItem);
    const undoCount = track(history.undoCount$);

    const synced = await firstValueFrom(database.entityManager.getRepository(CatalogItem).get(syncedId));
    await synced.remove();
    expect(await localItem(database, syncedId)).toBeUndefined();
    expect((await catalogChanges(database)).at(-1)).toMatchObject({ type: 'DELETE', inversePatch: fields });
    // 拉取清过撤销历史：本地写入的变更通知到了，撤销栈才重新接上这次删除
    await vi.waitFor(() => expect(undoCount.latest()).toBe(1));

    await history.undo();

    expect(await localItem(database, syncedId)).toMatchObject({
      ...fields,
      visibility: 'public',
      tenantId: TENANT
    });
  });

  it('AC#4：推送之后撤销栈清空，已推送的修改撤销不了', async () => {
    const script = newScript();
    const database = await createDatabase(script);
    const history = database.versionManager.history(CatalogItem);
    const undoCount = track(history.undoCount$);
    const item = await saveItem({ price: 299 });
    item.price = 399;
    await item.save();
    await vi.waitFor(() => expect(undoCount.latest()).toBe(2));

    const result = await database.syncManager.pushRepository('public', 'CatalogItem');

    expect(result).toMatchObject({ pushed: 1, rejected: 0 });
    expect(script.calls.flatMap(call => call.changes.map(change => change.type))).toEqual(['INSERT', 'UPDATE']);
    await vi.waitFor(() => expect(undoCount.latest()).toBe(0));
    await history.undo();
    expect((await localItem(database, item.id))?.price).toBe(399);
    expect(await pushableCount(database)).toBe(0);
  });

  it('AC#9：拉到别人的修改之后撤销历史失效，没推的修改照样待推', async () => {
    const script = newScript();
    const database = await createDatabase(script);
    const history = database.versionManager.history(CatalogItem);
    const undoCount = track(history.undoCount$);
    const mine = await saveItem({ name: '我的新品', price: 299 });
    await vi.waitFor(() => expect(undoCount.latest()).toBe(1));

    const othersId = crypto.randomUUID();
    script.log.push(remoteItem(1, othersId, { name: 'Bob 新建的商品' }));
    const pulled = await database.syncManager.pullRepository('public', 'CatalogItem');

    expect(pulled.historyInvalidated).toBe(true);
    await vi.waitFor(() => expect(undoCount.latest()).toBe(0));
    await history.undo();
    expect(await localItem(database, mine.id)).toMatchObject({ name: '我的新品', price: 299 });
    expect(await localItem(database, othersId)).toMatchObject({ name: 'Bob 新建的商品' });
    expect(await pushableCount(database)).toBe(1);
  });
});
