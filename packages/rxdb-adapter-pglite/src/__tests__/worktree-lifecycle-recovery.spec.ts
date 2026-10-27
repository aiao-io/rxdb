import {
  Entity,
  EntityBase,
  getEntityStatus,
  PropertyType,
  RxDB,
  RxDBBranch,
  SyncType,
  WorktreeTableSet
} from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterEach, expect, it, vi } from 'vitest';
import { PGliteClient } from '../PGliteClient.js';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

@Entity({
  name: 'DeferredChild',
  tableName: 'deferred_child',
  properties: [{ name: 'parentId', type: PropertyType.uuid, required: true }],
  foreignKeys: [{ name: 'parent', properties: ['parentId'], mappedEntity: 'Todo', mappedProperties: ['id'] }]
})
class DeferredChild extends EntityBase {
  declare parentId: string;
}

const databases: RxDB[] = [];
const create = async (workingTree = false) => {
  const db = new RxDB({
    dbName: `lifecycle-recovery-${crypto.randomUUID()}`,
    multiInstance: false,
    entities: [Todo, DeferredChild],
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });
  databases.push(db);
  db.adapter('pglite', source => new RxDBAdapterPGlite(source, { store: 'memory' }));
  db.use(rxDBPluginHistory);
  if (workingTree) db.use(rxDBPluginWorkingTree);
  const adapter = (await db.connect('pglite')) as RxDBAdapterPGlite;
  return { db, adapter };
};
afterEach(async () => {
  vi.restoreAllMocks();
  for (const db of databases.splice(0)) await db.destroy();
});

it('销毁数据库应释放它认领的可写检出位锁', async () => {
  const { db } = await create(true);
  await db.workingTree.enableIfEmpty();
  await db.versionManager.createBranch('feature');
  const worktree = await db.workingTree.checkouts.add('feature');
  await db.destroy();
  const locks = await navigator.locks.query();
  expect(locks.held?.map(lock => lock.name)).not.toContain(`rxdb-worktree:${db.config.dbName}:${worktree.id}`);
  await expect(db.workingTree.checkouts.mount(worktree.id)).rejects.toThrow('已销毁');
});

it('换挂先入队时，切分支不能继续修改原来的主检出位', async () => {
  const { db, adapter } = await create();
  const tableSet = WorktreeTableSet.of('wt_lifecycle', [Todo]);
  await db.versionManager.createBranch('held');
  await db.versionManager.createBranch('target');
  await adapter.transaction(async tx => {
    const branches = tx.getRepository(RxDBBranch);
    const held = await branches.find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: 'held' }] }
    });
    await branches.update(held[0], { activeKey: tableSet.holderKey });
    await adapter.createWorktreeTableSet(tx, tableSet, {
      branchId: 'held',
      actions: { inserts: new Map(), updates: new Map(), deletes: new Map() }
    });
  }, false);
  await adapter.switchBranch({
    actions: { inserts: new Map(), updates: new Map(), deletes: new Map() },
    prepare: async () => undefined
  });
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const blocker = adapter.transaction(async () => {
    entered.resolve();
    await release.promise;
  }, false);
  await entered.promise;
  const mounting = db.mountWorktreeTableSet(tableSet);
  const flushing = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  const flush = PGliteClient.prototype.flushPendingNotifications;
  vi.spyOn(PGliteClient.prototype, 'flushPendingNotifications').mockImplementationOnce(async function (
    this: PGliteClient
  ) {
    flushing.resolve();
    await resume.promise;
    return flush.call(this);
  });
  let executingSuffix: string | null | undefined;
  const switching = adapter.switchBranch({
    branchId: 'target',
    actions: { inserts: new Map(), updates: new Map(), deletes: new Map() },
    prepare: async ({ executor }) => {
      executingSuffix = executor.tableSet.suffix;
    }
  });
  await flushing.promise;
  release.resolve();
  await mounting;
  resume.resolve();
  const results = await Promise.allSettled([blocker, mounting, switching]);
  expect(results.map(result => result.status)).toEqual(['fulfilled', 'fulfilled', 'rejected']);
  expect(results[2]).toMatchObject({
    reason: expect.objectContaining({ message: expect.stringContaining('表集已改变') })
  });
  expect(executingSuffix).toBeUndefined();
  const active = await adapter.internalQuery<{ id: string }>('SELECT id FROM rxdb.rxdb_branch WHERE activated = true');
  expect(active.rows.map(row => row.id)).toEqual(['main']);
});

it('提交被延迟外键拒绝后，普通 save 必须保留可重试的实体状态', async () => {
  const { adapter } = await create();
  const parent = new Todo({ title: 'parent' });
  const child = new DeferredChild({ parentId: parent.id });
  await expect(child.save()).rejects.toThrow();
  const afterFailure = { local: getEntityStatus(child).local, modified: getEntityStatus(child).modified };
  await parent.save();
  await child.save();
  const rows = await adapter.internalQuery<{ id: string }>('SELECT id FROM public.deferred_child');
  expect({ afterFailure, rows: rows.rows.map(row => row.id) }).toEqual({
    afterFailure: { local: false, modified: true },
    rows: [child.id]
  });
});

it('销毁等待影子表事务结束，期间仍持有认领锁', async () => {
  const { db, adapter } = await create(true);
  await db.workingTree.enableIfEmpty();
  await db.versionManager.createBranch('feature');
  const checkout = await db.workingTree.checkouts.add('feature');
  await db.workingTree.checkouts.mount(checkout.id);
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const writing = adapter.transaction(async executor => {
    entered.resolve();
    await release.promise;
    await executor.query(
      `INSERT INTO ${executor.tableRef(Todo)} (id, title, completed, "createdAt", "updatedAt") VALUES ($1, $2, FALSE, NOW(), NOW())`,
      [crypto.randomUUID(), 'in flight']
    );
  }, false);
  await entered.promise;
  const closing = Promise.withResolvers<void>();
  const disconnect = adapter.disconnect.bind(adapter);
  vi.spyOn(adapter, 'disconnect').mockImplementation(async () => {
    closing.resolve();
    await disconnect();
  });
  const destroying = db.destroy();
  await closing.promise;
  try {
    const locks = await navigator.locks.query();
    expect(locks.held?.map(lock => lock.name)).toContain(`rxdb-worktree:${db.config.dbName}:${checkout.id}`);
  } finally {
    release.resolve();
    await Promise.all([writing, destroying]);
  }
  const locks = await navigator.locks.query();
  expect(locks.held?.map(lock => lock.name)).not.toContain(`rxdb-worktree:${db.config.dbName}:${checkout.id}`);
});

it('更新提交被延迟外键拒绝后，修复字段即可重试', async () => {
  const { adapter } = await create();
  const parent = new Todo({ title: 'parent' });
  await parent.save();
  const child = new DeferredChild({ parentId: parent.id });
  await child.save();
  const replacement = new Todo({ title: 'replacement' });
  child.parentId = replacement.id;
  await expect(child.save()).rejects.toThrow();
  expect(getEntityStatus(child).modified).toBe(true);
  await replacement.save();
  await child.save();
  expect(getEntityStatus(child).modified).toBe(false);
  const result = await adapter.internalQuery<{ parentId: string }>('SELECT "parentId" FROM public.deferred_child');
  expect(result.rows).toEqual([{ parentId: replacement.id }]);
});
