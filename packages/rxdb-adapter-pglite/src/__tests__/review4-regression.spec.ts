import {
  Entity,
  EntityBase,
  getEntityStatus,
  PropertyType,
  RxDB,
  RxDBBranch,
  RxDBChange,
  SyncType,
  WorktreeTableSet
} from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterEach, expect, it, vi } from 'vitest';
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

it('评审复现：延迟外键失败应恢复显式 update 之前的实体值', async () => {
  const { adapter } = await create();
  const parent = new Todo({ title: 'parent' });
  await parent.save();
  const child = new DeferredChild({ parentId: parent.id });
  await child.save();
  const before = child.parentId;
  const badId = crypto.randomUUID();
  await expect(adapter.getRepository(DeferredChild).update(child, { parentId: badId })).rejects.toThrow();
  const rows = await adapter.internalQuery<{ parentId: string }>('SELECT "parentId" FROM public.deferred_child');
  expect({ memory: child.parentId, modified: getEntityStatus(child).modified, stored: rows.rows[0]?.parentId }).toEqual(
    {
      memory: before,
      modified: false,
      stored: before
    }
  );
});

it.each([
  ['squash', 'mount'],
  ['normal', 'mount'],
  ['squash', 'switch'],
  ['normal', 'switch']
] as const)('评审复现：%s 合并计划生成后 %s 应拒绝写入其他分支或检出位', async (strategy, operation) => {
  const { db, adapter } = await create();
  const todo = new Todo({ title: 'base' });
  await todo.save();
  await db.versionManager.createBranch('source');
  await db.versionManager.switchBranch('source');
  todo.title = 'source edit';
  await todo.save();
  await db.versionManager.switchBranch('main');
  await db.versionManager.createBranch('other');
  await db.versionManager.createBranch('held');
  const set = WorktreeTableSet.of('wt_review4', [Todo]);
  await adapter.transaction(async tx => {
    const branches = tx.getRepository(RxDBBranch);
    const [held] = await branches.find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: 'held' }] }
    });
    await branches.update(held, { activeKey: set.holderKey });
    await adapter.createWorktreeTableSet(tx, set, {
      branchId: 'held',
      actions: { inserts: new Map(), updates: new Map(), deletes: new Map() }
    });
  }, false);
  const changes = adapter.getRepository(RxDBChange);
  const find = changes.find.bind(changes);
  const entered = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  const spy = vi.spyOn(changes, 'find').mockImplementationOnce(async options => {
    const result = await find(options);
    entered.resolve();
    await resume.promise;
    return result;
  });
  const merging = db.versionManager.mergeBranch('source', { strategy });
  await entered.promise;
  try {
    if (operation === 'mount') await db.mountWorktreeTableSet(set);
    else await db.versionManager.switchBranch('other');
  } finally {
    spy.mockRestore();
    resume.resolve();
  }
  const [result] = await Promise.allSettled([merging]);
  expect(result).toMatchObject({
    status: 'rejected',
    reason: { message: expect.stringContaining('计算合并增量期间') }
  });
  const main = await adapter.internalQuery<{ title: string }>('SELECT title FROM public.todos');
  const shadow = await adapter.internalQuery<{ title: string }>('SELECT title FROM "public$wt_review4".todos');
  expect({ result: result.status, main: main.rows, shadow: shadow.rows }).toEqual({
    result: 'rejected',
    main: [{ title: 'base' }],
    shadow: [{ title: 'base' }]
  });
});
