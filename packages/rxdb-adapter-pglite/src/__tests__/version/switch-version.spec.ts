import { RxDB, RxDBBranch, RxDBChange, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { cleanup_db, generateDbName } from '../test-utils.js';

describe('版本切换 (switchVersion)', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  const find_all_changes = async () =>
    await adapter.getRepository(RxDBChange).find({
      where: {
        combinator: 'and',
        rules: []
      },
      limit: Number.MAX_SAFE_INTEGER
    });

  const find_all_branches = async () =>
    await adapter.getRepository(RxDBBranch).find({
      where: {
        combinator: 'and',
        rules: []
      },
      limit: Number.MAX_SAFE_INTEGER
    });

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
    await rxdb.connect('pglite');
  });

  afterEach(async () => await cleanup_db(adapter));

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  it('分支没变化，直接切换', async () => {
    const todo = new Todo();
    todo.title = '1';
    await todo.save();
    const branch_01 = await rxdb.versionManager.createBranch('branch_01');
    expect(branch_01.activated).toEqual(false);
    expect(branch_01.fromChangeId).toEqual(1);
    expect(branch_01.parentId).toEqual('main');
    await rxdb.versionManager.switchBranch('branch_01');
    expect(branch_01.activated).toBe(true);
    await rxdb.versionManager.switchBranch('main');
    expect(branch_01.activated).toBe(false);
  });

  it('两个空分支随便切', async () => {
    const branch_01 = await rxdb.versionManager.createBranch('branch_01');
    await rxdb.versionManager.switchBranch('branch_01');
    expect(branch_01.activated).toBe(true);
    await rxdb.versionManager.switchBranch('main');
    expect(branch_01.activated).toBe(false);
  });

  describe('正确清空测试缓存', () => {
    it('A', async () => {
      const todo = new Todo();
      todo.title = '1';
      await todo.save();
      await rxdb.versionManager.createBranch('branch_01');
    });

    it('B', async () => {
      const todo = new Todo();
      todo.title = '2';
      await todo.save();
      const end_changes = await find_all_changes();
      expect(end_changes[0].entityId).toBe(todo.id);
    });
  });

  it('会清空数据', async () => {
    const todo_count = async () =>
      await adapter.getRepository(Todo).count({
        where: {
          combinator: 'and',
          rules: []
        }
      });
    const branch_01 = await rxdb.versionManager.createBranch('branch_01');
    expect(branch_01.activated).toBe(false);
    const todo = new Todo();
    todo.title = '1';
    await todo.save();
    todo.title = '2';
    await todo.save();
    todo.title = '3';
    await todo.save();
    await rxdb.versionManager.switchBranch('branch_01');
    expect(await todo_count()).toBe(0);
    await rxdb.versionManager.switchBranch('main');
    expect(await todo_count()).toBe(1);
    expect(todo.title).toBe('3');
  });

  it('切换分支后触发器使用新分支ID', async () => {
    const todo_titles = async () => {
      const todos = await adapter.getRepository(Todo).find({
        where: {
          combinator: 'and',
          rules: []
        }
      });
      return todos.map(todo => todo.title);
    };
    await rxdb.versionManager.createBranch('branch_01');
    const todo = new Todo();
    todo.title = '1';
    await todo.save();
    await rxdb.versionManager.switchBranch('branch_01');

    // 检查 PostgreSQL 触发器函数是否包含 branch_01
    // 分支 ID 存储在触发器函数定义中，而不是触发器定义中
    const functionResult = await adapter.internalQuery(`
      SELECT prosrc
      FROM pg_proc
      WHERE proname LIKE '%_change_trigger_fn'
    `);
    const functionRows = functionResult.rows || [];
    const expectTriggers = functionRows.some(
      (row: { prosrc?: string }) => row.prosrc && String(row.prosrc).includes('branch_01')
    );
    expect(expectTriggers).toBe(true);

    expect(await todo_titles()).toEqual([]);
    const all_branches = await find_all_branches();
    expect(all_branches.find(b => b.id === 'branch_01')?.activated).toBe(true);

    const todo2 = new Todo();
    todo2.title = '2';
    await todo2.save();
    const changes = await find_all_changes();
    const change = changes.find(c => c.entityId == todo2.id);
    expect(change!.branchId).toBe('branch_01');
    expect(await todo_titles()).toEqual(['2']);
    await rxdb.versionManager.switchBranch('main');
    expect(await todo_titles()).toEqual(['1']);
  });

  describe('父子分支切换', () => {
    it('从空数据父分支切换到子分支', async () => {
      await rxdb.versionManager.createBranch('branch_01');

      const todo = new Todo();
      todo.title = 'parent-1';
      await todo.save();

      await rxdb.versionManager.switchBranch('branch_01');

      const todo2 = new Todo();
      todo2.title = 'child-1';
      await todo2.save();

      const changes = await find_all_changes();
      const child_change = changes.find(c => c.entityId === todo2.id);
      expect(child_change?.branchId).toBe('branch_01');

      await rxdb.versionManager.switchBranch('main');

      const todos = await adapter.getRepository(Todo).find({
        where: { combinator: 'and', rules: [] }
      });
      expect(todos.length).toBe(1);
      expect(todos[0].title).toBe('parent-1');
    });

    it('父分支前进后再切换到子分支', async () => {
      const todo1 = new Todo();
      todo1.title = 'parent-1';
      await todo1.save();

      const todo2 = new Todo();
      todo2.title = 'parent-2';
      await todo2.save();

      await rxdb.versionManager.createBranch('branch_01');

      const todo3 = new Todo();
      todo3.title = 'parent-3';
      await todo3.save();

      await rxdb.versionManager.switchBranch('branch_01');

      const todos = await adapter.getRepository(Todo).find({
        where: { combinator: 'and', rules: [] }
      });
      // 切换到 branch_01（fromChangeId=2），应该恢复到 changeId=2 的状态
      // 即包含 parent-1 和 parent-2（2条数据）
      expect(todos.length).toBe(2);
      expect(todos[0].title).toBe('parent-1');
      expect(todos[1].title).toBe('parent-2');
    });

    it('子分支回退到父分支的起点', async () => {
      const todo1 = new Todo();
      todo1.title = 'parent-1';
      await todo1.save();

      await rxdb.versionManager.createBranch('branch_01');

      await rxdb.versionManager.switchBranch('branch_01');

      const todo2 = new Todo();
      todo2.title = 'child-1';
      await todo2.save();

      const todo3 = new Todo();
      todo3.title = 'child-2';
      await todo3.save();

      await rxdb.versionManager.switchBranch('main');

      const todos = await adapter.getRepository(Todo).find({
        where: { combinator: 'and', rules: [] }
      });
      expect(todos.length).toBe(1);
      expect(todos[0].title).toBe('parent-1');
    });
  });

  describe('兄弟分支切换', () => {
    it('通过共同父节点切换兄弟分支', async () => {
      const todo1 = new Todo();
      todo1.title = 'root-1';
      await todo1.save();

      await rxdb.versionManager.createBranch('branch_01');
      await rxdb.versionManager.createBranch('branch_02');

      await rxdb.versionManager.switchBranch('branch_01');

      const todo2 = new Todo();
      todo2.title = 'branch_01-1';
      await todo2.save();

      await rxdb.versionManager.switchBranch('branch_02');

      const todos = await adapter.getRepository(Todo).find({
        where: { combinator: 'and', rules: [] }
      });
      expect(todos.length).toBe(1);
      expect(todos[0].title).toBe('root-1');

      const todo3 = new Todo();
      todo3.title = 'branch_02-1';
      await todo3.save();

      await rxdb.versionManager.switchBranch('branch_01');

      const branch_01_todos = await adapter.getRepository(Todo).find({
        where: { combinator: 'and', rules: [] }
      });
      expect(branch_01_todos.length).toBe(2);
      expect(branch_01_todos.map(t => t.title).sort()).toEqual(['branch_01-1', 'root-1']);
    });
  });
});
