import { RxDB, RxDBBranch, SyncType, WorktreeTableSet } from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

describe('换挂检出位时的历史隔离', () => {
  const tableSet = WorktreeTableSet.of('wt_history', [Todo]);
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;
  let todo: Todo;

  const titleOf = async (schema: string) =>
    (await adapter.internalQuery<{ title: string }>(`SELECT "title" FROM "${schema}"."todos"`)).rows[0].title;

  const todoOfCurrentCheckout = async () =>
    (await firstValueFrom(
      rxdb.entityManager.getRepository(Todo).findOne({
        where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: todo.id }] }
      })
    ))!;

  beforeEach(async () => {
    rxdb = new RxDB({
      dbName: `worktree-history-${Date.now()}`,
      entities: [Todo],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    rxdb.use(rxDBPluginHistory);
    await rxdb.connect('pglite');
    adapter = await rxdb.getAdapter('pglite');
    todo = new Todo({ title: 'a' });
    await todo.save();
    await rxdb.versionManager.createBranch('held');
    await adapter.transaction(async executor => {
      const repo = executor.getRepository(RxDBBranch);
      const [held] = await repo.find({
        where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: 'held' }] }
      });
      await repo.update(held, { activeKey: tableSet.holderKey });
      await adapter.createWorktreeTableSet(executor, tableSet, {
        branchId: 'held',
        actions: { inserts: new Map(), updates: new Map(), deletes: new Map() }
      });
    }, false);
  });

  afterEach(async () => {
    await rxdb.disconnectAll();
  });

  it('换挂后不把主检出位的 redo 重放到影子表，也不改主分支的撤销标记', async () => {
    todo.title = 'b';
    await todo.save();
    const history = rxdb.versionManager.history();
    await history.undo();
    expect(await firstValueFrom(history.redoCount$)).toBe(1);
    await rxdb.mountWorktreeTableSet(tableSet);
    await history.redo();
    expect(await titleOf('public')).toBe('a');
    expect(await titleOf('public$wt_history')).toBe('a');
    const reverted = await adapter.internalQuery<{ revertChangeId: number | null }>(
      `SELECT "revertChangeId" FROM "rxdb"."rxdb_change" WHERE "branchId" = 'main' AND "type" = 'UPDATE'`
    );
    expect(reverted.rows[0].revertChangeId).not.toBeNull();
    expect(await firstValueFrom(history.redoCount$)).toBe(0);
  });

  it('换挂后 undo 视图重查新分支的继承屏障，挂回后恢复主分支屏障', async () => {
    await rxdb.mountWorktreeTableSet(tableSet);
    const shadowTodo = await todoOfCurrentCheckout();
    shadowTodo.title = 'shadow-edit';
    await shadowTodo.save();
    await rxdb.mountWorktreeTableSet(WorktreeTableSet.MAIN);
    const mainTodo = await todoOfCurrentCheckout();
    mainTodo.title = 'main-edit';
    await mainTodo.save();
    await rxdb.versionManager.createBranch('sibling');
    const history = rxdb.versionManager.history();
    await expect.poll(async () => (await firstValueFrom(history.undoBarrier$))?.branchIds).toContain('sibling');
    await rxdb.mountWorktreeTableSet(tableSet);
    await expect.poll(async () => (await firstValueFrom(history.histories$))[0]?.changes[0]?.branchId).toBe('held');
    await expect.poll(() => firstValueFrom(history.undoCount$)).toBe(1);
    expect(await firstValueFrom(history.undoBarrier$)).toBeNull();
    await rxdb.mountWorktreeTableSet(WorktreeTableSet.MAIN);
    await expect.poll(async () => (await firstValueFrom(history.undoBarrier$))?.branchIds).toContain('sibling');
  });

  it('撤销事务提交后、内存入栈前换挂，不把旧分支的重做项补进新分支', async () => {
    todo.title = 'b';
    await todo.save();
    const history = rxdb.versionManager.history();
    const switchBranch = adapter.switchBranch.bind(adapter);
    vi.spyOn(adapter, 'switchBranch').mockImplementationOnce(async options => {
      await switchBranch(options);
      await rxdb.mountWorktreeTableSet(tableSet);
      await expect.poll(async () => (await firstValueFrom(history.histories$)).length).toBe(0);
    });
    await history.undo();
    expect(await titleOf('public')).toBe('a');
    expect(await titleOf('public$wt_history')).toBe('a');
    expect(await firstValueFrom(history.redoCount$)).toBe(0);
  });
});
