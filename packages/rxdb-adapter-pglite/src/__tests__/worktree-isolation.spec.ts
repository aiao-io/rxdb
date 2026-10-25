import {
  Entity,
  ENTITY_LOCAL_UPDATE_EVENT,
  EntityBase,
  getEntityStatus,
  PropertyType,
  RxDB,
  RxDBBranch,
  SyncType,
  WorktreeTableSet,
  WorktreeTableSetMismatchError
} from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { Todo } from '@aiao/rxdb-test/entities';
import { filter, firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handle_rxdb_change } from '../handle_rxdb_change.js';
import { PGliteChangeType } from '../pglite.interface.js';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { generateDbName } from './test-utils.js';

@Entity({
  name: 'SortableIsolationNote',
  tableName: 'sortable_isolation_note',
  manualOrder: { groupBy: ['group'] },
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'group', type: PropertyType.string, default: 'inbox' },
    { name: 'sortOrder', type: PropertyType.string }
  ]
})
class SortableIsolationNote extends EntityBase {
  declare title: string;
  declare sortOrder: string;
  declare group: string;
}

describe('检出位的并发写与连接隔离', () => {
  const tableSet = WorktreeTableSet.of('wt_isolation', [Todo, SortableIsolationNote]);
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;
  let todo: Todo;

  beforeEach(async () => {
    rxdb = new RxDB({
      dbName: generateDbName(),
      multiInstance: false,
      entities: [Todo, SortableIsolationNote],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    rxdb.use(rxDBPluginHistory);
    adapter = await rxdb.connect('pglite');
    todo = new Todo({ title: 'original' });
    await todo.save();
    await rxdb.versionManager.createBranch('held');
    await adapter.transaction(async executor => {
      const repository = executor.getRepository(RxDBBranch);
      const [held] = await repository.find({
        where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: 'held' }] }
      });
      await repository.update(held, { activeKey: tableSet.holderKey });
      await adapter.createWorktreeTableSet(executor, tableSet, {
        branchId: 'held',
        actions: { inserts: new Map(), updates: new Map(), deletes: new Map() }
      });
    }, false);
  });

  afterEach(async () => {
    await rxdb.disconnectAll();
  });

  const rejectWriteAfterMount = async (write: () => Promise<unknown>): Promise<void> => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const blocking = adapter.transaction(async () => {
      entered.resolve();
      await release.promise;
    }, false);
    await entered.promise;
    const mounting = rxdb.mountWorktreeTableSet(tableSet);
    const saving = write();
    release.resolve();
    const [blocked, mounted, saved] = await Promise.allSettled([blocking, mounting, saving]);

    expect(blocked.status).toBe('fulfilled');
    expect(mounted.status).toBe('fulfilled');
    expect(saved).toMatchObject({ status: 'rejected', reason: expect.any(WorktreeTableSetMismatchError) });
  };

  it.each(['save', 'remove', 'create', 'saveMany', 'removeMany'] as const)(
    '换挂排队期间的 %s 拒绝旧实体，影子表原样',
    async operation => {
      todo.title = 'main-edit';
      const draft = new Todo({ title: 'draft' });
      const writes = {
        save: () => todo.save(),
        remove: () => todo.remove(),
        create: () => draft.save(),
        saveMany: () => rxdb.entityManager.saveMany([todo]),
        removeMany: () => rxdb.entityManager.removeMany([todo])
      };
      await rejectWriteAfterMount(writes[operation]);
      const main = await adapter.internalQuery<{ title: string }>('SELECT "title" FROM "public"."todos"');
      expect(main.rows).toEqual([{ title: 'original' }]);
      const result = await adapter.internalQuery<{ title: string }>(
        'SELECT "title" FROM "public$wt_isolation"."todos"'
      );
      expect(result.rows.map(row => row.title)).toEqual(['original']);
    }
  );

  it.each(['saveMany', 'removeMany'] as const)('适配器公开批量入口在换挂期间拒绝旧实体', async operation => {
    todo.title = 'adapter-main-edit';
    await rejectWriteAfterMount(() =>
      operation === 'saveMany' ? adapter.saveMany([todo]) : adapter.removeMany([todo])
    );
  });

  it.each(['save', 'saveMany'] as const)('缺排序键的 %s 同样在写事务内拒绝旧表集实体', async operation => {
    const note = new SortableIsolationNote({ title: 'main draft' });
    await rejectWriteAfterMount(() => (operation === 'save' ? note.save() : rxdb.entityManager.saveMany([note])));
    expect(note.sortOrder).toBeUndefined();
    const rows = await adapter.internalQuery('SELECT * FROM "public$wt_isolation"."sortable_isolation_note"');
    expect(rows.rows).toEqual([]);
  });

  it.each(['save', 'saveMany'] as const)('改排序分组的 %s 不得更新另一检出位', async operation => {
    const note = new SortableIsolationNote({ title: 'original' });
    await note.save();
    const originalOrder = note.sortOrder;
    await adapter.internalQuery(
      'INSERT INTO "public$wt_isolation"."sortable_isolation_note" SELECT * FROM "public"."sortable_isolation_note"'
    );
    note.group = 'elsewhere';
    await rejectWriteAfterMount(() => (operation === 'save' ? note.save() : rxdb.entityManager.saveMany([note])));
    expect(note.sortOrder).toBe(originalOrder);
    const rows = await adapter.internalQuery<{ group: string }>(
      'SELECT "group" FROM "public$wt_isolation"."sortable_isolation_note"'
    );
    expect(rows.rows).toEqual([{ group: 'inbox' }]);
  });

  it.each(['adapter', 'facade'] as const)('换挂排队期间的 %s 查询只回填当前表集', async mode => {
    todo.title = 'main-only';
    await todo.save();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const blocking = adapter.transaction(async () => {
      entered.resolve();
      await release.promise;
    }, false);
    await entered.promise;
    const mounting = rxdb.mountWorktreeTableSet(tableSet);
    const options = { where: { combinator: 'and' as const, rules: [] } };
    const reading =
      mode === 'adapter' ?
        adapter.getRepository(Todo).find(options)
      : firstValueFrom(rxdb.entityManager.getRepository(Todo).findAll(options));
    release.resolve();
    const [, , rows] = await Promise.all([blocking, mounting, reading]);
    expect(rows.map(row => ({ title: row.title, suffix: getEntityStatus(row).tableSet.suffix }))).toEqual([
      { title: 'original', suffix: tableSet.suffix }
    ]);
    rows[0].title = `${rows[0].title}-edited`;
    await rxdb.entityManager.saveMany(rows);
    const shadow = await adapter.internalQuery('SELECT "title" FROM "public$wt_isolation"."todos"');
    expect(shadow.rows).toEqual([{ title: 'original-edited' }]);
  });

  it.each(['disconnect', 'disconnectAll'] as const)('%s 等待影子事务结束后才复位挂载', async operation => {
    await rxdb.mountWorktreeTableSet(tableSet);
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const writing = adapter.transaction(async executor => {
      const repository = executor.getRepository(Todo);
      const [shadowTodo] = await repository.find({ where: { combinator: 'and', rules: [] } });
      entered.resolve();
      await release.promise;
      await repository.update(shadowTodo, { title: 'shadow-edit' });
      const main = await executor.query('SELECT "title" FROM "public"."todos"');
      const shadow = await executor.query('SELECT "title" FROM "public$wt_isolation"."todos"');
      return { main: main.rows, shadow: shadow.rows, tableSet: executor.tableSet };
    }, false);
    await entered.promise;
    const stopped = firstValueFrom(rxdb.connected$.pipe(filter(connected => !connected)));
    const closing = operation === 'disconnect' ? rxdb.disconnect('pglite') : rxdb.disconnectAll();
    await stopped;
    release.resolve();
    const [result] = await Promise.all([writing, closing]);
    expect(result).toEqual({ main: [['original']], shadow: [['shadow-edit']], tableSet });
    expect(rxdb.entityManager.hasEntityRef(Todo, todo.id)).toBe(false);
    expect(rxdb.worktreeTableSet).toBe(WorktreeTableSet.MAIN);
    expect(await firstValueFrom(rxdb.worktreeTableSet$)).toBe(WorktreeTableSet.MAIN);
  });

  it('持有键释放后，迟到事件仍保留写入时的影子表来源', async () => {
    await rxdb.mountWorktreeTableSet(tableSet);
    await adapter.internalQuery('UPDATE "public$wt_isolation"."todos" SET "title" = $1 WHERE "id" = $2', [
      'shadow-edit',
      todo.id
    ]);
    const changes = await adapter.internalQuery<{ id: number }>(
      'SELECT "id" FROM "rxdb"."rxdb_change" WHERE "branchId" = $1 AND "type" = $2 ORDER BY "id" DESC LIMIT 1',
      ['held', 'UPDATE']
    );
    await rxdb.mountWorktreeTableSet(WorktreeTableSet.MAIN);
    await adapter.transaction(async executor => {
      const repository = executor.getRepository(RxDBBranch);
      const [held] = await repository.find({ where: tableSet.heldBranchWhere });
      await repository.update(held, { activeKey: null });
    }, false);
    const seen: { id: unknown; tableSetSuffix?: string }[] = [];
    const listener = (event: { entities: { entity: string; id: unknown; tableSetSuffix?: string }[] }) => {
      seen.push(...event.entities.filter(entity => entity.entity === 'Todo'));
    };
    rxdb.addEventListener(ENTITY_LOCAL_UPDATE_EVENT, listener);
    try {
      await handle_rxdb_change(adapter, {
        type: PGliteChangeType.INSERT,
        dbName: rxdb.config.dbName,
        tableName: 'rxdb_change',
        rowIds: [changes.rows[0].id],
        recordAt: new Date()
      });
      expect(seen).toContainEqual(expect.objectContaining({ id: todo.id, tableSetSuffix: tableSet.suffix }));
    } finally {
      rxdb.removeEventListener(ENTITY_LOCAL_UPDATE_EVENT, listener);
    }
  });

  it('内存库断开重连后，挂载与通知流一起恢复主表集', async () => {
    await rxdb.mountWorktreeTableSet(tableSet);
    await rxdb.disconnectAll();
    await rxdb.connect('pglite');

    expect(rxdb.worktreeTableSet).toBe(WorktreeTableSet.MAIN);
    expect(await firstValueFrom(rxdb.worktreeTableSet$)).toBe(WorktreeTableSet.MAIN);
    const repository = rxdb.entityManager.getRepository(Todo);
    await expect(firstValueFrom(repository.findAll({ where: { combinator: 'and', rules: [] } }))).resolves.toEqual([]);
  });
});
