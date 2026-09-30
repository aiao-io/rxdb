import { RxDB, RxDBBranch, RxDBChange, SyncType } from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { cleanup_db, generateDbName } from '../test-utils.js';

describe('分支合并 (mergeBranch)', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  const find_all_todos = async () =>
    await adapter.getRepository(Todo).find({
      where: { combinator: 'and', rules: [] }
    });

  const find_all_changes = async () =>
    await adapter.getRepository(RxDBChange).find({
      where: { combinator: 'and', rules: [] },
      limit: Number.MAX_SAFE_INTEGER
    });

  const find_all_branches = async () =>
    await adapter.getRepository(RxDBBranch).find({
      where: { combinator: 'and', rules: [] },
      limit: Number.MAX_SAFE_INTEGER
    });

  const todo_titles = async () => {
    const todos = await find_all_todos();
    return todos.map(t => t.title).sort();
  };

  beforeAll(async () => {
    const db = new RxDB({
      dbName: generateDbName(),
      entities: [Todo],
      sync: {
        local: { adapter: 'pglite' },
        type: SyncType.None
      }
    });
    db.adapter(
      'pglite',
      db =>
        new RxDBAdapterPGlite(db, {
          store: 'memory'
        })
    );
    rxdb = db;
    adapter = await rxdb.getAdapter('pglite');
    rxdb.use(rxDBPluginHistory);
    await rxdb.connect('pglite');
  });

  afterEach(async () => await cleanup_db(adapter));

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  it('空分支合并，merged=0', async () => {
    await rxdb.versionManager.createBranch('feature');
    const result = await rxdb.versionManager.mergeBranch('feature');

    expect(result.merged).toBe(0);
    expect(result.strategy).toBe('squash');
    expect(result.sourceDeleted).toBe(false);
  });

  it('合并分支中新创建的数据到 main', async () => {
    const todo1 = new Todo();
    todo1.title = 'main-todo';
    await todo1.save();

    await rxdb.versionManager.createBranch('feature');
    await rxdb.versionManager.switchBranch('feature');

    const todo2 = new Todo();
    todo2.title = 'feature-todo-1';
    await todo2.save();

    const todo3 = new Todo();
    todo3.title = 'feature-todo-2';
    await todo3.save();

    await rxdb.versionManager.switchBranch('main');
    expect(await todo_titles()).toEqual(['main-todo']);

    const result = await rxdb.versionManager.mergeBranch('feature');

    expect(result.merged).toBe(2);
    expect(result.strategy).toBe('squash');
    expect(await todo_titles()).toEqual(['feature-todo-1', 'feature-todo-2', 'main-todo']);
  });

  it('合并分支中修改的数据到 main', async () => {
    const todo = new Todo();
    todo.title = 'original';
    await todo.save();

    await rxdb.versionManager.createBranch('feature');
    await rxdb.versionManager.switchBranch('feature');

    todo.title = 'modified-in-feature';
    await todo.save();

    await rxdb.versionManager.switchBranch('main');
    expect(await todo_titles()).toEqual(['original']);

    const result = await rxdb.versionManager.mergeBranch('feature');

    expect(result.merged).toBe(1);
    expect(await todo_titles()).toEqual(['modified-in-feature']);
  });

  it('合并分支中删除的数据到 main', async () => {
    const todo = new Todo();
    todo.title = 'to-delete';
    await todo.save();

    await rxdb.versionManager.createBranch('feature');
    await rxdb.versionManager.switchBranch('feature');

    await todo.remove();

    await rxdb.versionManager.switchBranch('main');
    expect(await todo_titles()).toEqual(['to-delete']);

    const result = await rxdb.versionManager.mergeBranch('feature');

    expect(result.merged).toBe(1);
    expect(await todo_titles()).toEqual([]);
  });

  it('squash 合并压缩 INSERT + UPDATE 为一次 INSERT', async () => {
    await rxdb.versionManager.createBranch('feature');
    await rxdb.versionManager.switchBranch('feature');

    const todo = new Todo();
    todo.title = 'draft';
    await todo.save();
    todo.title = 'v2';
    await todo.save();
    todo.title = 'final';
    await todo.save();

    await rxdb.versionManager.switchBranch('main');

    expect(await todo_titles()).toEqual([]);

    const result = await rxdb.versionManager.mergeBranch('feature');

    expect(result.merged).toBe(1);
    expect(await todo_titles()).toEqual(['final']);

    const changes = await find_all_changes();
    const mainChanges = changes.filter(c => c.branchId === 'main');
    const featureInsertChanges = mainChanges.filter(c => c.entityId === todo.id && c.type === 'INSERT');
    expect(featureInsertChanges.length).toBe(1);
  });

  it('normal 合并产生相同的数据结果', async () => {
    await rxdb.versionManager.createBranch('feature');
    await rxdb.versionManager.switchBranch('feature');

    const todo = new Todo();
    todo.title = 'feature-data';
    await todo.save();

    await rxdb.versionManager.switchBranch('main');

    const result = await rxdb.versionManager.mergeBranch('feature', { strategy: 'normal' });

    expect(result.merged).toBe(1);
    expect(result.strategy).toBe('normal');
    expect(await todo_titles()).toEqual(['feature-data']);
  });

  it('合并后删除源分支', async () => {
    await rxdb.versionManager.createBranch('feature');
    await rxdb.versionManager.switchBranch('feature');

    const todo = new Todo();
    todo.title = 'data';
    await todo.save();

    await rxdb.versionManager.switchBranch('main');

    const result = await rxdb.versionManager.mergeBranch('feature', { deleteSource: true });

    expect(result.sourceDeleted).toBe(true);
    expect(await todo_titles()).toEqual(['data']);

    const branches = await find_all_branches();
    expect(branches.find(b => b.id === 'feature')).toBeUndefined();
  });

  it('合并后默认不删除源分支', async () => {
    await rxdb.versionManager.createBranch('feature');

    await rxdb.versionManager.mergeBranch('feature');

    const branches = await find_all_branches();
    expect(branches.find(b => b.id === 'feature')).toBeDefined();
  });

  it('合并不存在的分支抛错', async () => {
    await expect(rxdb.versionManager.mergeBranch('ghost')).rejects.toThrow("Branch 'ghost' not found");
  });

  it('合并自身抛错', async () => {
    await expect(rxdb.versionManager.mergeBranch('main')).rejects.toThrow("Cannot merge branch 'main' into itself");
  });

  it('合并产生的变更记录属于目标分支', async () => {
    await rxdb.versionManager.createBranch('feature');
    await rxdb.versionManager.switchBranch('feature');

    const todo = new Todo();
    todo.title = 'in-feature';
    await todo.save();

    await rxdb.versionManager.switchBranch('main');
    await rxdb.versionManager.mergeBranch('feature');

    const changes = await find_all_changes();
    const mainInsert = changes.find(c => c.branchId === 'main' && c.entityId === todo.id && c.type === 'INSERT');
    expect(mainInsert).toBeDefined();
  });

  it('混合 INSERT + UPDATE + DELETE 合并', async () => {
    const todo1 = new Todo();
    todo1.title = 'keep';
    await todo1.save();

    const todo2 = new Todo();
    todo2.title = 'will-update';
    await todo2.save();

    await rxdb.versionManager.createBranch('feature');
    await rxdb.versionManager.switchBranch('feature');

    const todo3 = new Todo();
    todo3.title = 'new-in-feature';
    await todo3.save();

    todo2.title = 'updated-in-feature';
    await todo2.save();

    await todo1.remove();

    await rxdb.versionManager.switchBranch('main');
    expect(await todo_titles()).toEqual(['keep', 'will-update']);

    const result = await rxdb.versionManager.mergeBranch('feature');

    expect(result.merged).toBe(3);
    expect(await todo_titles()).toEqual(['new-in-feature', 'updated-in-feature']);
  });

  it('squash 合并过滤幽灵删除：feature 内 INSERT+DELETE 对 main 无影响', async () => {
    await rxdb.versionManager.createBranch('feature');
    await rxdb.versionManager.switchBranch('feature');

    const ghost = new Todo();
    ghost.title = 'ghost';
    await ghost.save();
    await ghost.remove();

    await rxdb.versionManager.switchBranch('main');
    expect(await todo_titles()).toEqual([]);

    const result = await rxdb.versionManager.mergeBranch('feature');

    expect(result.merged).toBe(0);
    expect(await todo_titles()).toEqual([]);
  });

  it('normal 合并 INSERT+DELETE 两条变更都应用到 main', async () => {
    await rxdb.versionManager.createBranch('feature');
    await rxdb.versionManager.switchBranch('feature');

    const ghost = new Todo();
    ghost.title = 'ghost';
    await ghost.save();
    await ghost.remove();

    await rxdb.versionManager.switchBranch('main');

    const result = await rxdb.versionManager.mergeBranch('feature', { strategy: 'normal' });

    expect(result.merged).toBe(2);
    expect(await todo_titles()).toEqual([]);
  });

  it('合并后可以继续在 main 分支正常操作', async () => {
    await rxdb.versionManager.createBranch('feature');
    await rxdb.versionManager.switchBranch('feature');

    const todo = new Todo();
    todo.title = 'from-feature';
    await todo.save();

    await rxdb.versionManager.switchBranch('main');
    await rxdb.versionManager.mergeBranch('feature');

    const todo2 = new Todo();
    todo2.title = 'after-merge';
    await todo2.save();

    expect(await todo_titles()).toEqual(['after-merge', 'from-feature']);

    const changes = await find_all_changes();
    const latest = changes.filter(c => c.entityId === todo2.id);
    expect(latest.every(c => c.branchId === 'main')).toBe(true);
  });

  it('squash 合并触达 ≥2 个实体后，产生的历史记录不折叠成单条 TRANSACTION', async () => {
    // 回归用例：squash 出口的外层 `adapter.transaction(...)` 曾经没有显式传
    // transactionLog=false。默认值 true 会让适配器在事务开头调 `switch_transaction_id()`
    // （PGlite 下是设事务局部变量 `rxdb.transaction_id`），这次写出的每条 change 行都盖上
    // 同一个 transactionId。`history-item-builder.ts` 的
    // `type = transactionId ? 'TRANSACTION' : first_change.type` 一看到它，就把 squash 产生的
    // 两条 change 折叠成一条 `'TRANSACTION'`，undo 粒度从「按实体」退化成「整次合并一起撤销」。
    // 插件侧 mock 的契约测试（`merge-branch.spec.ts`）只验得了 `transaction()` 的调用参数；
    // transactionId 落库与 HistoryItem 分组要走真实触发器，只有挂了真实 PGlite 适配器的本文件
    // 验得了。直接读公开的 `history()`：触达 2 个实体的 squash 合并应表现为 2 条独立、
    // 类型是自身原类型（INSERT）的 HistoryItem。
    await rxdb.versionManager.createBranch('feature');
    await rxdb.versionManager.switchBranch('feature');

    const todoA = new Todo();
    todoA.title = 'feature-a';
    await todoA.save();

    const todoB = new Todo();
    todoB.title = 'feature-b';
    await todoB.save();

    await rxdb.versionManager.switchBranch('main');

    const result = await rxdb.versionManager.mergeBranch('feature');
    expect(result.merged).toBe(2);

    const histories = await firstValueFrom(rxdb.versionManager.history().histories$);
    const mergedHistories = histories.filter(h =>
      h.changes.some(c => c.entityId === todoA.id || c.entityId === todoB.id)
    );

    // 没被折叠：两个实体各自是独立的 HistoryItem（类型是它们本来的 INSERT），
    // 而不是共享一条 'TRANSACTION' 记录——是 INSERT 已经蕴含了不是 TRANSACTION。
    expect(mergedHistories.length).toBe(2);
    expect(mergedHistories.every(h => h.type === 'INSERT')).toBe(true);
  });
});

describe('恢复实体的历史分组语义 (restoreEntity)', () => {
  // 与上面 squash 合并的用例同一个根因（restore-entity.ts 的外层 `adapter.transaction(...)`
  // 曾经同样缺显式的 transactionLog=false），但恢复的前置状态（要有一条已存在的 DELETE
  // change）与合并分支不同，独立开一个 describe 块，不共享上面的 `rxdb` 实例与生命周期。
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    const db = new RxDB({
      dbName: generateDbName(),
      entities: [Todo],
      sync: {
        local: { adapter: 'pglite' },
        type: SyncType.None
      }
    });
    db.adapter(
      'pglite',
      db =>
        new RxDBAdapterPGlite(db, {
          store: 'memory'
        })
    );
    rxdb = db;
    adapter = await rxdb.getAdapter('pglite');
    rxdb.use(rxDBPluginHistory);
    await rxdb.connect('pglite');
  });

  afterEach(async () => await cleanup_db(adapter));

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  it('恢复被删除实体后，新增的历史记录类型不是 TRANSACTION', async () => {
    // restore-entity.ts 顶部的 TSDoc 承诺「恢复操作本身会生成新的 RxDBChange 记录」——
    // 这条记录必须是一条**普通**的 change（本例中是 INSERT），不能因为外层事务默认的
    // transactionLog=true 被 switch_transaction_id() 盖上 transactionId，进而被
    // `history-item-builder.ts` 显示成 `'TRANSACTION'`。
    const todo = new Todo();
    todo.title = 'to-restore';
    await todo.save();
    await todo.remove();

    // 按 entityId/type 在 `where` 里过滤会漏——本文件其它用例（如 `find_all_changes` 的
    // 调用方）一律是取全表后在 JS 侧用 `===` 筛，这里跟随同一惯例，不单独另起一条查询口径。
    const allChanges = await adapter.getRepository(RxDBChange).find({
      where: { combinator: 'and', rules: [] },
      limit: Number.MAX_SAFE_INTEGER
    });
    const deleteChange = allChanges.find(c => c.entityId === todo.id && c.type === 'DELETE');
    if (!deleteChange) throw new Error(`未找到 entityId=${String(todo.id)} 的 DELETE change`);

    await rxdb.versionManager.restoreEntity(new Todo(), { changeId: String(deleteChange.id) });

    const histories = await firstValueFrom(rxdb.versionManager.history().histories$);
    const restoreHistory = histories.find(h => h.changes.some(c => c.entityId === todo.id && c.type === 'INSERT'));

    expect(restoreHistory).toBeDefined();
    expect(restoreHistory!.type).toBe('INSERT');
    expect(restoreHistory!.type).not.toBe('TRANSACTION');
  });
});
