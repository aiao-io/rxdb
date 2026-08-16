import {
  RxDB,
  RxDBBranch,
  RxDBChange,
  SwitchVersionActions,
  getEntityMetadata,
  type SwitchVersionChange
} from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import { dispatch_switch_events, execute_switch_actions } from '../version/execute_switch_actions.js';
import { convertSwitchResultToSql } from '../version/switch-result.utils.js';
import { generateSwitchBranchSql } from '../version/switch_branch.js';
import type { AdapterFactory } from './adapter-factory.js';
import { cleanup_db } from './test-utils.js';

/** Version Branch 测试：分支切换动作的生成与执行。 */
export function versionBranchSuite(factory: AdapterFactory) {
  describe.sequential(`Version Branch [${factory.name}]`, () => {
    let adapter: RxDBAdapterSqliteBase;
    let rxdb: RxDB;

    beforeAll(async () => {
      adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      rxdb = adapter.rxdb;
    });

    afterAll(async () => {
      if (adapter) {
        await adapter.rxdb.disconnectAll();
      }
    });

    /**
     * 变更日志里最后一条变更的 id。
     *
     * `rxdb$rxdb_change.id` 是 `INTEGER PRIMARY KEY AUTOINCREMENT`，产品契约是单调递增、
     * 删行也不回收；`cleanup_db` 因此不重置 `sqlite_sequence`（否则跨测试复用 id 会让
     * 身份缓存把上一个测试的变更实体当成本测试的新行）。所以断言 `fromChangeId` 只能比
     * 「刚写入的那条变更」，不能写死字面量 1。
     */
    const lastChangeId = async (): Promise<number> => {
      const { rows } = await adapter.rawQuery(`SELECT MAX(id) FROM "rxdb$rxdb_change";`);
      return Number(rows[0][0]);
    };

    // ================================================================
    // 1. create_branch
    // ================================================================
    describe('分支创建 (createBranch)', () => {
      beforeEach(async () => await cleanup_db(adapter));

      it('从有数据的主分支创建新分支', async () => {
        const todo = new Todo();
        todo.title = '1';
        await todo.save();
        const result = await rxdb.versionManager.createBranch('branch_01');
        expect(result).contain({
          activated: false,
          id: 'branch_01',
          fromChangeId: await lastChangeId(),
          parentId: 'main',
          local: true,
          remote: false
        });
      });

      it('从空的主分支创建新分支', async () => {
        const result = await rxdb.versionManager.createBranch('branch_01');
        expect(result).contain({
          activated: false,
          id: 'branch_01',
          fromChangeId: null,
          local: true,
          remote: false
        });
      });
    });

    // ================================================================
    // 2. execute_switch_actions
    // ================================================================
    describe('execute_switch_actions 单元测试', () => {
      const emptyActions = (): SwitchVersionActions => ({
        deletes: new Map(),
        updates: new Map(),
        inserts: new Map()
      });

      const generateKey = (entity: Todo): string => {
        const metadata = getEntityMetadata(Todo);
        return `${metadata.namespace}:${metadata.name}:${entity.id}`;
      };

      afterEach(async () => await cleanup_db(adapter));

      describe('execute_switch_actions', () => {
        it('应处理空操作', async () => {
          const actions = emptyActions();

          const switchAction = await convertSwitchResultToSql(adapter, actions);
          await execute_switch_actions(adapter, switchAction);

          expect(switchAction.inserts).toHaveLength(0);
          expect(switchAction.updates).toHaveLength(0);
          expect(switchAction.deletes).toHaveLength(0);
        });

        it('应正确执行删除操作', async () => {
          const todo = new Todo();
          todo.title = 'to-be-deleted';
          await todo.save();

          const countBefore = await adapter.getRepository(Todo).count({
            where: { combinator: 'and', rules: [] }
          });
          expect(countBefore).toBe(1);

          const actions = emptyActions();
          actions.deletes.set(generateKey(todo), {
            patch: { id: todo.id } as Partial<Todo>,
            inversePatch: { ...todo } as Partial<Todo>
          });

          const switchAction = await convertSwitchResultToSql(adapter, actions);
          await execute_switch_actions(adapter, switchAction);

          const countAfter = await adapter.getRepository(Todo).count({
            where: { combinator: 'and', rules: [] }
          });
          expect(countAfter).toBe(0);
        });

        it('应正确执行插入操作', async () => {
          const todo = new Todo();
          todo.title = 'inserted-todo';

          const actions = emptyActions();
          actions.inserts.set(generateKey(todo), {
            patch: { ...todo } as Partial<Todo>,
            inversePatch: null
          });

          const switchAction = await convertSwitchResultToSql(adapter, actions);
          await execute_switch_actions(adapter, switchAction);

          const todos = await adapter.getRepository(Todo).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(todos.length).toBe(1);
          expect(todos[0].title).toBe('inserted-todo');
        });

        it('应正确执行更新操作', async () => {
          const todo = new Todo();
          todo.title = 'original-title';
          await todo.save();

          const actions = emptyActions();
          actions.updates.set(generateKey(todo), {
            patch: { id: todo.id, title: 'updated-title' } as Partial<Todo>,
            inversePatch: { id: todo.id, title: 'original-title' } as Partial<Todo>
          });

          const switchAction = await convertSwitchResultToSql(adapter, actions);
          await execute_switch_actions(adapter, switchAction);

          const todos = await adapter.getRepository(Todo).find({
            where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: todo.id }] }
          });
          expect(todos.length).toBe(1);
          expect(todos[0].title).toBe('updated-title');
        });
      });

      describe('dispatch_switch_events', () => {
        it('应在有操作时派发事件', async () => {
          const todo = new Todo();
          todo.title = 'event-test';
          await todo.save();

          const actions = emptyActions();
          actions.updates.set(generateKey(todo), {
            patch: { ...todo } as Partial<Todo>,
            inversePatch: { ...todo } as Partial<Todo>
          });

          const switchAction = await convertSwitchResultToSql(adapter, actions);
          await execute_switch_actions(adapter, switchAction);

          expect(() => dispatch_switch_events(adapter, switchAction)).not.toThrow();
        });
      });
    });

    // ================================================================
    // 3. merge-changes（合并变更）
    // ================================================================
    describe('mergeChanges', () => {
      const change = (patch: Partial<Todo> | null, inversePatch: Partial<Todo> | null = null) => ({
        patch,
        inversePatch
      });

      const uuid = () => crypto.randomUUID();

      const find_all_todos = async () => {
        return await adapter.getRepository(Todo).find({
          where: { combinator: 'and', rules: [] },
          limit: Number.MAX_SAFE_INTEGER
        });
      };

      const find_all_changes = async () =>
        await adapter.getRepository(RxDBChange).find({
          where: { combinator: 'and', rules: [] },
          limit: Number.MAX_SAFE_INTEGER
        });

      afterEach(async () => await cleanup_db(adapter));

      describe('基础功能', () => {
        it('空 actions 不会出错', async () => {
          const actions: SwitchVersionActions = {
            deletes: new Map(),
            inserts: new Map(),
            updates: new Map()
          };

          await expect(adapter.mergeChanges(actions)).resolves.toBeUndefined();
        });

        it('能正确插入数据', async () => {
          const todoId = uuid();
          const actions: SwitchVersionActions = {
            deletes: new Map(),
            inserts: new Map([
              [
                `public:Todo:${todoId}`,
                change({ id: todoId, title: 'Inserted Todo', completed: false } as Partial<Todo>)
              ]
            ]),
            updates: new Map()
          };

          await adapter.mergeChanges(actions);

          const todos = await find_all_todos();
          expect(todos).toHaveLength(1);
          expect(todos[0].id).toBe(todoId);
          expect(todos[0].title).toBe('Inserted Todo');
          expect(todos[0].completed).toBe(false);
        });

        it('能正确更新数据', async () => {
          const todo = new Todo();
          todo.title = 'Original Title';
          await todo.save();

          const actions: SwitchVersionActions = {
            deletes: new Map(),
            inserts: new Map(),
            updates: new Map([[`public:Todo:${todo.id}`, change({ title: 'Updated Title', completed: true })]])
          };

          await adapter.mergeChanges(actions);

          const todos = await find_all_todos();
          expect(todos).toHaveLength(1);
          expect(todos[0].title).toBe('Updated Title');
          expect(todos[0].completed).toBe(true);
        });

        it('能正确删除数据', async () => {
          const todo = new Todo();
          todo.title = 'To Be Deleted';
          await todo.save();

          const todosBeforeDelete = await find_all_todos();
          expect(todosBeforeDelete).toHaveLength(1);

          const actions: SwitchVersionActions = {
            deletes: new Map([
              [
                `public:Todo:${todo.id}`,
                change(null, { id: todo.id, title: 'To Be Deleted', completed: false } as Partial<Todo>)
              ]
            ]),
            inserts: new Map(),
            updates: new Map()
          };

          await adapter.mergeChanges(actions);

          const todosAfterDelete = await find_all_todos();
          expect(todosAfterDelete).toHaveLength(0);
        });
      });

      describe('触发器控制', () => {
        it('默认会生成 RxDBChange 记录', async () => {
          const todoId = uuid();
          const actions: SwitchVersionActions = {
            deletes: new Map(),
            inserts: new Map([
              [
                `public:Todo:${todoId}`,
                change({ id: todoId, title: 'With Trigger', completed: false } as Partial<Todo>)
              ]
            ]),
            updates: new Map()
          };

          await adapter.mergeChanges(actions, undefined, false);

          const changes = await find_all_changes();
          expect(changes.length).toBeGreaterThan(0);
          expect(changes.some((c: RxDBChange) => c.entityId === todoId)).toBe(true);
        });

        it('disableTriggers=true 不会生成 RxDBChange 记录', async () => {
          await cleanup_db(adapter);

          const todoId = uuid();
          const actions: SwitchVersionActions = {
            deletes: new Map(),
            inserts: new Map([
              [
                `public:Todo:${todoId}`,
                change({ id: todoId, title: 'Without Trigger', completed: false } as Partial<Todo>)
              ]
            ]),
            updates: new Map()
          };

          await adapter.mergeChanges(actions, undefined, true);

          const changes = await find_all_changes();
          expect(changes.filter((c: RxDBChange) => c.entityId === todoId)).toHaveLength(0);
        });
      });

      describe('混合操作', () => {
        it('能同时处理插入、更新和删除', async () => {
          const todo1 = new Todo();
          todo1.title = 'Todo 1';
          await todo1.save();

          const todo2 = new Todo();
          todo2.title = 'Todo 2';
          await todo2.save();

          const newTodoId = uuid();

          const actions: SwitchVersionActions = {
            deletes: new Map([[`public:Todo:${todo1.id}`, change(null)]]),
            inserts: new Map([
              [
                `public:Todo:${newTodoId}`,
                change({ id: newTodoId, title: 'New Todo', completed: false } as Partial<Todo>)
              ]
            ]),
            updates: new Map([[`public:Todo:${todo2.id}`, change({ title: 'Updated Todo 2', completed: true })]])
          };

          await adapter.mergeChanges(actions);

          const todos = await find_all_todos();
          expect(todos).toHaveLength(2);

          const todoIds = todos.map(t => t.id);
          expect(todoIds).not.toContain(todo1.id);
          expect(todoIds).toContain(todo2.id);
          expect(todoIds).toContain(newTodoId);

          const updatedTodo = todos.find(t => t.id === todo2.id);
          expect(updatedTodo?.title).toBe('Updated Todo 2');
          expect(updatedTodo?.completed).toBe(true);
        });
      });

      describe('批量操作', () => {
        it('能批量插入多条数据', async () => {
          const id1 = uuid();
          const id2 = uuid();
          const id3 = uuid();
          const actions: SwitchVersionActions = {
            deletes: new Map(),
            inserts: new Map([
              [`public:Todo:${id1}`, change({ id: id1, title: 'Batch 1', completed: false } as Partial<Todo>)],
              [`public:Todo:${id2}`, change({ id: id2, title: 'Batch 2', completed: true } as Partial<Todo>)],
              [`public:Todo:${id3}`, change({ id: id3, title: 'Batch 3', completed: false } as Partial<Todo>)]
            ]),
            updates: new Map()
          };

          await adapter.mergeChanges(actions);

          const todos = await find_all_todos();
          expect(todos).toHaveLength(3);
        });

        it('能批量删除多条数据', async () => {
          const todo1 = new Todo();
          todo1.title = 'Delete 1';
          await todo1.save();

          const todo2 = new Todo();
          todo2.title = 'Delete 2';
          await todo2.save();

          const todo3 = new Todo();
          todo3.title = 'Delete 3';
          await todo3.save();

          const actions: SwitchVersionActions = {
            deletes: new Map([
              [`public:Todo:${todo1.id}`, change(null)],
              [`public:Todo:${todo2.id}`, change(null)],
              [`public:Todo:${todo3.id}`, change(null)]
            ]),
            inserts: new Map(),
            updates: new Map()
          };

          await adapter.mergeChanges(actions);

          const todos = await find_all_todos();
          expect(todos).toHaveLength(0);
        });
      });
    });

    // ================================================================
    // 4. merge_branch
    // ================================================================
    describe('分支合并 (mergeBranch)', () => {
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

      afterEach(async () => await cleanup_db(adapter));

      // 基础合并

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

      // Squash 压缩效果

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

      // Normal 合并

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

      // 原子性

      /**
       * normal 策略逐条调用 mergeChanges。整个循环必须在一个事务里，
       * 否则第 k 条失败时前 k-1 条已落库、触发器也已在目标分支生成 RxDBChange，
       * 目标分支停在「合了一半」的状态。
       */
      it('normal 合并中途失败时，目标分支不留下任何半截数据', async () => {
        await rxdb.versionManager.createBranch('feature');
        await rxdb.versionManager.switchBranch('feature');

        for (const title of ['n1', 'n2', 'n3']) {
          const todo = new Todo();
          todo.title = title;
          await todo.save();
        }

        await rxdb.versionManager.switchBranch('main');

        const changesBefore = (await find_all_changes()).length;
        expect(await todo_titles()).toEqual([]);

        // 第 2 条变更落库时炸掉
        // ⚠️ 不能 `.bind(adapter)`：C2 起 executor 通过一个 `query` 被改写过的**门面**调用
        // `mergeChanges`（`this` = 门面），内部 helper 收到的 adapter 就是门面，其 query 才落在
        // 本事务里。把 `this` 绑死在真实适配器上，helper 会走真实 `runInTransaction` 再开一个
        // 事务 —— 而队列的唯一槽位正被当前事务占着，于是死锁并毒化本文件后续所有用例。
        const original = adapter.mergeChanges;
        let call = 0;
        const spy = vi.spyOn(adapter, 'mergeChanges').mockImplementation(async function (
          this: unknown,
          ...args: Parameters<typeof original>
        ) {
          call++;
          if (call === 2) throw new Error('merge exploded on change #2');
          return original.apply(this, args);
        });

        try {
          await expect(rxdb.versionManager.mergeBranch('feature', { strategy: 'normal' })).rejects.toThrow(
            'merge exploded on change #2'
          );
        } finally {
          spy.mockRestore();
        }

        // 第 1 条即使已经执行过，也必须随事务一起回滚
        expect(await todo_titles()).toEqual([]);
        expect((await find_all_changes()).length).toBe(changesBefore);
      });

      it('normal 合并全部成功时按条数落库', async () => {
        await rxdb.versionManager.createBranch('feature');
        await rxdb.versionManager.switchBranch('feature');

        for (const title of ['n1', 'n2', 'n3']) {
          const todo = new Todo();
          todo.title = title;
          await todo.save();
        }

        await rxdb.versionManager.switchBranch('main');

        const result = await rxdb.versionManager.mergeBranch('feature', { strategy: 'normal' });

        expect(result.merged).toBe(3);
        expect(await todo_titles()).toEqual(['n1', 'n2', 'n3']);
      });

      // deleteSource 选项

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

      // 错误场景

      it('合并不存在的分支抛错', async () => {
        await expect(rxdb.versionManager.mergeBranch('ghost')).rejects.toThrow("Branch 'ghost' not found");
      });

      it('合并自身抛错', async () => {
        await expect(rxdb.versionManager.mergeBranch('main')).rejects.toThrow("Cannot merge branch 'main' into itself");
      });

      // 合并后的触发器验证

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

      // 复合场景

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
    });

    // ================================================================
    // 5. remove_branch
    // ================================================================
    describe('removeBranch', () => {
      beforeEach(async () => await cleanup_db(adapter));

      it('should throw error when trying to remove non-existent branch', async () => {
        await expect(rxdb.versionManager.removeBranch('non-existent-branch')).rejects.toThrow(
          "Branch 'non-existent-branch' not found"
        );
      });

      it('should throw error when trying to remove main branch', async () => {
        await expect(rxdb.versionManager.removeBranch('main')).rejects.toThrow('Cannot remove main branch');
      });

      it('003', async () => {
        const todo = new Todo();
        todo.title = '1';
        await todo.save();
        await rxdb.versionManager.createBranch('branch_01');
        await rxdb.versionManager.removeBranch('branch_01');
        const branches = await adapter.localRxDBBranch().find({
          where: {
            combinator: 'and',
            rules: [{ field: 'id', operator: '=', value: 'branch_01' }]
          }
        });
        expect(branches.length).toBe(0);
      });
    });

    // ================================================================
    // 6. switch-result.utils
    // ================================================================
    describe('switch-result.utils', () => {
      const change = (patch: object | null, inversePatch: object | null = null): SwitchVersionChange => ({
        patch,
        inversePatch
      });

      // 语句是参数化的：SQL 里只有 ? 占位符，值在 params 中，两者分开断言。
      const sqlOf = (item: { statements: { sql: string }[] }): string => item.statements.map(s => s.sql).join(' ');
      const paramsOf = (item: { statements: { params: unknown[] }[] }): unknown[] =>
        item.statements.flatMap(s => s.params);

      describe('convertSwitchResultToSql', () => {
        it('应该处理空的 actions', async () => {
          const actions: SwitchVersionActions = {
            deletes: new Map(),
            inserts: new Map(),
            updates: new Map()
          };

          const result = await convertSwitchResultToSql(adapter, actions);

          expect(result.deletes).toHaveLength(0);
          expect(result.inserts).toHaveLength(0);
          expect(result.updates).toHaveLength(0);
        });

        it('应该生成删除 SQL（字符串 ID）', async () => {
          const actions: SwitchVersionActions = {
            deletes: new Map([
              ['public:Todo:todo-1', change(null, { title: 'Old 1' })],
              ['public:Todo:todo-2', change(null, { title: 'Old 2' })]
            ]),
            inserts: new Map(),
            updates: new Map()
          };

          const result = await convertSwitchResultToSql(adapter, actions);

          expect(result.deletes).toHaveLength(1);
          expect(result.deletes[0].ids.size).toBe(2);
          expect(sqlOf(result.deletes[0])).toContain('DELETE FROM');
          expect(paramsOf(result.deletes[0])).toEqual(expect.arrayContaining(['todo-1', 'todo-2']));
        });

        it('应该生成插入 SQL', async () => {
          const actions: SwitchVersionActions = {
            deletes: new Map(),
            inserts: new Map([
              ['public:Todo:todo-1', change({ title: 'Test Todo', completed: false })],
              ['public:Todo:todo-2', change({ title: 'Another Todo', completed: true })]
            ]),
            updates: new Map()
          };

          const result = await convertSwitchResultToSql(adapter, actions);

          expect(result.inserts).toHaveLength(1);
          expect(result.inserts[0].ids.size).toBe(2);
          expect(sqlOf(result.inserts[0])).toContain('INSERT');
          expect(paramsOf(result.inserts[0])).toEqual(expect.arrayContaining(['Test Todo', 'Another Todo']));
        });

        it('应该在插入时应用默认值', async () => {
          const actions: SwitchVersionActions = {
            deletes: new Map(),
            inserts: new Map([['public:Todo:todo-1', change({ title: 'Test Todo' })]]),
            updates: new Map()
          };

          const result = await convertSwitchResultToSql(adapter, actions);

          expect(result.inserts).toHaveLength(1);
          expect(result.inserts[0].statements.length).toBeGreaterThan(0);
          const insertSql = sqlOf(result.inserts[0]);
          expect(insertSql).toContain('INSERT');
        });

        it('应该处理带有函数的默认值', async () => {
          const actions: SwitchVersionActions = {
            deletes: new Map(),
            inserts: new Map([['public:Todo:todo-1', change({ title: 'Test Todo' })]]),
            updates: new Map()
          };

          const result = await convertSwitchResultToSql(adapter, actions);

          expect(result.inserts).toHaveLength(1);
          expect(sqlOf(result.inserts[0])).toContain('INSERT');
        });

        it('应该生成更新 SQL', async () => {
          const actions: SwitchVersionActions = {
            deletes: new Map(),
            inserts: new Map(),
            updates: new Map([
              ['public:Todo:todo-1', change({ title: 'Updated Todo', completed: true })],
              ['public:Todo:todo-2', change({ title: 'Another Updated', completed: false })]
            ])
          };

          const result = await convertSwitchResultToSql(adapter, actions);

          expect(result.updates).toHaveLength(1);
          expect(result.updates[0].ids.size).toBe(2);
          expect(sqlOf(result.updates[0])).toContain('UPDATE');
          expect(paramsOf(result.updates[0])).toEqual(expect.arrayContaining(['Updated Todo', 'Another Updated']));
        });

        it('应该同时处理删除、插入和更新', async () => {
          const actions: SwitchVersionActions = {
            deletes: new Map([['public:Todo:todo-old', change(null)]]),
            inserts: new Map([['public:Todo:todo-new', change({ title: 'New Todo', completed: false })]]),
            updates: new Map([['public:Todo:todo-1', change({ title: 'Updated', completed: true })]])
          };

          const result = await convertSwitchResultToSql(adapter, actions);

          expect(result.deletes).toHaveLength(1);
          expect(result.inserts).toHaveLength(1);
          expect(result.updates).toHaveLength(1);
        });

        it('应该按命名空间和实体名称分组操作', async () => {
          const actions: SwitchVersionActions = {
            deletes: new Map([
              ['public:Todo:todo-1', change(null)],
              ['public:Todo:todo-2', change(null)],
              ['public:Todo:todo-3', change(null)]
            ]),
            inserts: new Map(),
            updates: new Map()
          };

          const result = await convertSwitchResultToSql(adapter, actions);

          expect(result.deletes.length).toBe(1);
          expect(result.deletes[0].ids.size).toBe(3);
          expect(result.deletes[0].metadata.name).toBe('Todo');
        });

        it('应该处理包含 updatedAt 的更新', async () => {
          const now = new Date();
          const actions: SwitchVersionActions = {
            deletes: new Map(),
            inserts: new Map(),
            updates: new Map([['public:Todo:todo-1', change({ title: 'Updated', updatedAt: now })]])
          };

          const result = await convertSwitchResultToSql(adapter, actions);

          expect(result.updates).toHaveLength(1);
          expect(sqlOf(result.updates[0])).toContain('UPDATE');
        });

        it('应该处理不包含 updatedAt 的更新', async () => {
          const actions: SwitchVersionActions = {
            deletes: new Map(),
            inserts: new Map(),
            updates: new Map([['public:Todo:todo-1', change({ title: 'Updated' })]])
          };

          const result = await convertSwitchResultToSql(adapter, actions);

          expect(result.updates).toHaveLength(1);
          expect(sqlOf(result.updates[0])).toContain('UPDATE');
        });

        it('应该返回包含 metadata 的结果', async () => {
          const actions: SwitchVersionActions = {
            deletes: new Map([['public:Todo:todo-1', change(null)]]),
            inserts: new Map([['public:Todo:todo-2', change({ title: 'Test', completed: false })]]),
            updates: new Map([['public:Todo:todo-3', change({ title: 'Updated' })]])
          };

          const result = await convertSwitchResultToSql(adapter, actions);

          expect(result.deletes[0].metadata).toBeDefined();
          expect(result.deletes[0].metadata.name).toBe('Todo');
          expect(result.inserts[0].metadata).toBeDefined();
          expect(result.inserts[0].metadata.name).toBe('Todo');
          expect(result.updates[0].metadata).toBeDefined();
          expect(result.updates[0].metadata.name).toBe('Todo');
        });

        it('应该在结果中包含实体 IDs 集合', async () => {
          const actions: SwitchVersionActions = {
            deletes: new Map([
              ['public:Todo:todo-1', change(null)],
              ['public:Todo:todo-2', change(null)]
            ]),
            inserts: new Map([
              ['public:Todo:todo-3', change({ title: 'New 1', completed: false })],
              ['public:Todo:todo-4', change({ title: 'New 2', completed: false })]
            ]),
            updates: new Map()
          };

          const result = await convertSwitchResultToSql(adapter, actions);

          expect(result.deletes[0].ids.has('todo-1')).toBe(true);
          expect(result.deletes[0].ids.has('todo-2')).toBe(true);
          expect(result.inserts[0].ids.has('todo-3')).toBe(true);
          expect(result.inserts[0].ids.has('todo-4')).toBe(true);
        });

        it('应该为相同实体类型的多个操作生成正确的 SQL', async () => {
          const actions: SwitchVersionActions = {
            deletes: new Map(),
            inserts: new Map([
              ['public:Todo:todo-1', change({ title: 'First', completed: false })],
              ['public:Todo:todo-2', change({ title: 'Second', completed: true })],
              ['public:Todo:todo-3', change({ title: 'Third', completed: false })]
            ]),
            updates: new Map()
          };

          const result = await convertSwitchResultToSql(adapter, actions);

          expect(result.inserts).toHaveLength(1);
          const insertSql = sqlOf(result.inserts[0]);
          expect(paramsOf(result.inserts[0])).toEqual(expect.arrayContaining(['First', 'Second', 'Third']));
          const insertCount = (insertSql.match(/INSERT/g) || []).length;
          expect(insertCount).toBe(3);
        });

        it('应该为多个更新生成正确的 SQL', async () => {
          const actions: SwitchVersionActions = {
            deletes: new Map(),
            inserts: new Map(),
            updates: new Map([
              ['public:Todo:todo-1', change({ title: 'Updated 1', completed: true })],
              ['public:Todo:todo-2', change({ title: 'Updated 2', completed: false })]
            ])
          };

          const result = await convertSwitchResultToSql(adapter, actions);

          expect(result.updates).toHaveLength(1);
          const updateSql = sqlOf(result.updates[0]);
          expect(paramsOf(result.updates[0])).toEqual(expect.arrayContaining(['Updated 1', 'Updated 2']));
          const updateCount = (updateSql.match(/UPDATE/g) || []).length;
          expect(updateCount).toBe(2);
        });
      });
    });

    // ================================================================
    // 7. switch-version
    // ================================================================
    describe('版本切换 (switchVersion)', () => {
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

      beforeEach(async () => await cleanup_db(adapter));

      afterEach(async () => await cleanup_db(adapter));

      it('分支没变化，直接切换', async () => {
        const todo = new Todo();
        todo.title = '1';
        await todo.save();
        const branch_01 = await rxdb.versionManager.createBranch('branch_01');
        expect(branch_01.activated).toEqual(false);
        expect(branch_01.fromChangeId).toEqual(await lastChangeId());
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

      it('test_004', async () => {
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
        const triggers = await adapter.internalQuery(
          `SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'trigger';`
        );
        const triggerRows = triggers.results[0].rows || [];
        const expectTriggers = triggerRows.some(row => row[2] && String(row[2]).includes('branch_01'));
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

        it('兄弟分支有不同的 fromChangeId', async () => {
          const todo1 = new Todo();
          todo1.title = 'root-1';
          await todo1.save();

          await rxdb.versionManager.createBranch('branch_01');

          const todo2 = new Todo();
          todo2.title = 'root-2';
          await todo2.save();

          await rxdb.versionManager.createBranch('branch_02');

          await rxdb.versionManager.switchBranch('branch_01');

          const todos = await adapter.getRepository(Todo).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(todos.length).toBe(1);
          expect(todos[0].title).toBe('root-1');
        });
      });

      describe('多代分支切换', () => {
        it('孙子分支回退到祖父分支', async () => {
          const todo1 = new Todo();
          todo1.title = 'root-1';
          await todo1.save();

          await rxdb.versionManager.createBranch('branch_01');

          await rxdb.versionManager.switchBranch('branch_01');

          const todo2 = new Todo();
          todo2.title = 'child-1';
          await todo2.save();

          await rxdb.versionManager.createBranch('branch_02');

          await rxdb.versionManager.switchBranch('branch_02');

          const todo3 = new Todo();
          todo3.title = 'grandchild-1';
          await todo3.save();

          await rxdb.versionManager.switchBranch('main');

          const todos = await adapter.getRepository(Todo).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(todos.length).toBe(1);
          expect(todos[0].title).toBe('root-1');
        });

        it('祖父分支前进到孙子分支', async () => {
          const todo1 = new Todo();
          todo1.title = 'root-1';
          await todo1.save();

          await rxdb.versionManager.createBranch('branch_01');

          await rxdb.versionManager.switchBranch('branch_01');

          const todo2 = new Todo();
          todo2.title = 'child-1';
          await todo2.save();

          await rxdb.versionManager.createBranch('branch_02');

          await rxdb.versionManager.switchBranch('branch_02');

          const todo3 = new Todo();
          todo3.title = 'grandchild-1';
          await todo3.save();

          await rxdb.versionManager.switchBranch('main');
          await rxdb.versionManager.switchBranch('branch_02');

          const todos = await adapter.getRepository(Todo).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(todos.length).toBe(3);
          expect(todos.map(t => t.title).sort()).toEqual(['child-1', 'grandchild-1', 'root-1']);
        });

        it('堂兄弟分支切换', async () => {
          const todo1 = new Todo();
          todo1.title = 'root-1';
          await todo1.save();

          await rxdb.versionManager.createBranch('branch_01');
          await rxdb.versionManager.createBranch('branch_02');

          await rxdb.versionManager.switchBranch('branch_01');

          const todo2 = new Todo();
          todo2.title = 'branch_01-1';
          await todo2.save();

          await rxdb.versionManager.createBranch('branch_03');

          await rxdb.versionManager.switchBranch('branch_02');

          const todo3 = new Todo();
          todo3.title = 'branch_02-1';
          await todo3.save();

          await rxdb.versionManager.createBranch('branch_04');

          await rxdb.versionManager.switchBranch('branch_03');

          const todo4 = new Todo();
          todo4.title = 'branch_03-1';
          await todo4.save();

          await rxdb.versionManager.switchBranch('branch_04');

          const todos = await adapter.getRepository(Todo).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(todos.length).toBe(2);
          expect(todos.map(t => t.title).sort()).toEqual(['branch_02-1', 'root-1']);
        });
      });

      describe('叔侄关系', () => {
        it('从叔叔切换到侄子', async () => {
          const todo1 = new Todo();
          todo1.title = 'root-1';
          await todo1.save();

          await rxdb.versionManager.createBranch('branch_uncle');
          await rxdb.versionManager.createBranch('branch_parent');

          await rxdb.versionManager.switchBranch('branch_uncle');

          const todo2 = new Todo();
          todo2.title = 'uncle-1';
          await todo2.save();

          await rxdb.versionManager.switchBranch('branch_parent');

          const todo3 = new Todo();
          todo3.title = 'parent-1';
          await todo3.save();

          await rxdb.versionManager.createBranch('branch_nephew');

          await rxdb.versionManager.switchBranch('branch_nephew');

          const todo4 = new Todo();
          todo4.title = 'nephew-1';
          await todo4.save();

          await rxdb.versionManager.switchBranch('branch_uncle');
          await rxdb.versionManager.switchBranch('branch_nephew');

          const todos = await adapter.getRepository(Todo).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(todos.length).toBe(3);
          expect(todos.map(t => t.title).sort()).toEqual(['nephew-1', 'parent-1', 'root-1']);
        });

        it('从侄子切换到叔叔', async () => {
          const todo1 = new Todo();
          todo1.title = 'root-1';
          await todo1.save();

          await rxdb.versionManager.createBranch('branch_uncle');
          await rxdb.versionManager.createBranch('branch_parent');

          await rxdb.versionManager.switchBranch('branch_parent');

          const todo2 = new Todo();
          todo2.title = 'parent-1';
          await todo2.save();

          await rxdb.versionManager.createBranch('branch_nephew');

          await rxdb.versionManager.switchBranch('branch_nephew');

          const todo3 = new Todo();
          todo3.title = 'nephew-1';
          await todo3.save();

          await rxdb.versionManager.switchBranch('branch_uncle');

          const todos = await adapter.getRepository(Todo).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(todos.length).toBe(1);
          expect(todos[0].title).toBe('root-1');

          const todo4 = new Todo();
          todo4.title = 'uncle-1';
          await todo4.save();

          await rxdb.versionManager.switchBranch('branch_nephew');

          const nephew_todos = await adapter.getRepository(Todo).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(nephew_todos.length).toBe(3);
          expect(nephew_todos.map(t => t.title).sort()).toEqual(['nephew-1', 'parent-1', 'root-1']);
        });
      });

      describe('从 main 创建的兄弟分支', () => {
        it('在有数据的 main 上创建新分支并切换', async () => {
          const todo1 = new Todo();
          todo1.title = 'main-1';
          await todo1.save();

          await rxdb.versionManager.createBranch('branch_new');

          await rxdb.versionManager.switchBranch('branch_new');

          const todos_new = await adapter.getRepository(Todo).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(todos_new.length).toBe(1);
          expect(todos_new[0].title).toBe('main-1');

          const todo2 = new Todo();
          todo2.title = 'branch-1';
          await todo2.save();

          await rxdb.versionManager.switchBranch('main');

          const todos_main = await adapter.getRepository(Todo).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(todos_main.length).toBe(1);
          expect(todos_main[0].title).toBe('main-1');
        });

        it('多个从 main 派生的分支之间切换', async () => {
          const todo1 = new Todo();
          todo1.title = 'main-1';
          await todo1.save();

          await rxdb.versionManager.createBranch('branch1');

          await rxdb.versionManager.switchBranch('branch1');

          const todo2 = new Todo();
          todo2.title = 'branch1-1';
          await todo2.save();

          await rxdb.versionManager.switchBranch('main');

          await rxdb.versionManager.createBranch('branch2');

          await rxdb.versionManager.switchBranch('branch2');

          const todo3 = new Todo();
          todo3.title = 'branch2-1';
          await todo3.save();

          await rxdb.versionManager.createBranch('branch2_child');

          await rxdb.versionManager.switchBranch('branch2_child');

          const todo4 = new Todo();
          todo4.title = 'branch2_child-1';
          await todo4.save();

          await rxdb.versionManager.switchBranch('branch1');

          const branch1_todos = await adapter.getRepository(Todo).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(branch1_todos.length).toBe(2);
          expect(branch1_todos.map(t => t.title).sort()).toEqual(['branch1-1', 'main-1']);
        });
      });

      describe('同一分支内数据变化', () => {
        it('分支内连续添加多个数据', async () => {
          const todo1 = new Todo();
          todo1.title = 'v1';
          await todo1.save();

          const todo2 = new Todo();
          todo2.title = 'v2';
          await todo2.save();

          const todo3 = new Todo();
          todo3.title = 'v3';
          await todo3.save();

          const todos = await adapter.getRepository(Todo).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(todos.length).toBe(3);
          expect(todos.map(t => t.title).sort()).toEqual(['v1', 'v2', 'v3']);
        });

        it('分支切换后验证数据变化', async () => {
          const todo1 = new Todo();
          todo1.title = 'v1';
          await todo1.save();

          const todo2 = new Todo();
          todo2.title = 'v2';
          await todo2.save();

          await rxdb.versionManager.createBranch('branch_test');

          const todo3 = new Todo();
          todo3.title = 'v3';
          await todo3.save();

          await rxdb.versionManager.switchBranch('branch_test');

          const todos_branch = await adapter.getRepository(Todo).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(todos_branch.length).toBe(2);
          expect(todos_branch[0].title).toBe('v1');
          expect(todos_branch[1].title).toBe('v2');

          await rxdb.versionManager.switchBranch('main');

          const todos_main = await adapter.getRepository(Todo).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(todos_main.length).toBe(3);
        });
      });

      describe('数据完整性验证', () => {
        it('切换分支后验证 change 记录的 branchId 正确', async () => {
          await rxdb.versionManager.createBranch('branch_01');

          const todo1 = new Todo();
          todo1.title = 'main-1';
          await todo1.save();
          await rxdb.versionManager.switchBranch('branch_01');

          const todo2 = new Todo();
          todo2.title = 'branch-1';
          await todo2.save();

          const changes = await find_all_changes();
          const main_change = changes.find(c => c.entityId === todo1.id);
          const branch_change = changes.find(c => c.entityId === todo2.id);

          expect(main_change?.branchId).toBe('main');
          expect(branch_change?.branchId).toBe('branch_01');
        });

        it('验证分支的 activated 状态正确更新', async () => {
          await rxdb.versionManager.createBranch('branch_01');
          await rxdb.versionManager.createBranch('branch_02');

          await rxdb.versionManager.switchBranch('branch_01');

          let branches = await find_all_branches();
          expect(branches.find(b => b.id === 'main')?.activated).toBe(false);
          expect(branches.find(b => b.id === 'branch_01')?.activated).toBe(true);
          expect(branches.find(b => b.id === 'branch_02')?.activated).toBe(false);

          await rxdb.versionManager.switchBranch('branch_02');

          branches = await find_all_branches();
          expect(branches.find(b => b.id === 'main')?.activated).toBe(false);
          expect(branches.find(b => b.id === 'branch_01')?.activated).toBe(false);
          expect(branches.find(b => b.id === 'branch_02')?.activated).toBe(true);
        });

        it('多次切换后数据一致性', async () => {
          const todo1 = new Todo();
          todo1.title = 'main-1';
          await todo1.save();

          await rxdb.versionManager.createBranch('branch_01');

          await rxdb.versionManager.switchBranch('branch_01');

          const todo2 = new Todo();
          todo2.title = 'branch-1';
          await todo2.save();

          await rxdb.versionManager.switchBranch('main');
          await rxdb.versionManager.switchBranch('branch_01');
          await rxdb.versionManager.switchBranch('main');
          await rxdb.versionManager.switchBranch('branch_01');
          await rxdb.versionManager.switchBranch('main');

          const todos = await adapter.getRepository(Todo).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(todos.length).toBe(1);
          expect(todos[0].title).toBe('main-1');
        });
      });

      describe('边界情况', () => {
        it('切换到相同的分支时会直接返回（避免不必要操作）', async () => {
          const todo = new Todo();
          todo.title = 'test';
          await todo.save();

          const currentBranch = await adapter.getRepository(RxDBBranch).find({
            where: {
              combinator: 'and',
              rules: [{ field: 'activated', operator: '=', value: true }]
            },
            limit: 1
          });
          expect(currentBranch.length).toBe(1);
          expect(currentBranch[0].id).toBe('main');

          await expect(rxdb.versionManager.switchBranch('main')).resolves.toBeUndefined();

          const afterBranch = await adapter.getRepository(RxDBBranch).find({
            where: {
              combinator: 'and',
              rules: [{ field: 'activated', operator: '=', value: true }]
            },
            limit: 1
          });
          expect(afterBranch.length).toBe(1);
          expect(afterBranch[0].id).toBe('main');
        });

        it('空父分支到子分支（fromChangeId=0）', async () => {
          await rxdb.versionManager.createBranch('branch_01');

          await rxdb.versionManager.switchBranch('branch_01');

          const todo = new Todo();
          todo.title = 'child-1';
          await todo.save();

          const todos = await adapter.getRepository(Todo).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(todos.length).toBe(1);
          expect(todos[0].title).toBe('child-1');
        });

        it('子分支回退到空父分支', async () => {
          await rxdb.versionManager.createBranch('branch_01');

          await rxdb.versionManager.switchBranch('branch_01');

          const todo = new Todo();
          todo.title = 'child-1';
          await todo.save();

          await rxdb.versionManager.switchBranch('main');

          const todos = await adapter.getRepository(Todo).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(todos.length).toBe(0);
        });

        it('三个兄弟分支：从第一个切换到第三个', async () => {
          const todo1 = new Todo();
          todo1.title = 'root-1';
          await todo1.save();

          const todo2 = new Todo();
          todo2.title = 'root-2';
          await todo2.save();

          await rxdb.versionManager.createBranch('branch_01');

          const todo3 = new Todo();
          todo3.title = 'root-3';
          await todo3.save();

          await rxdb.versionManager.createBranch('branch_02');

          const todo4 = new Todo();
          todo4.title = 'root-4';
          await todo4.save();

          await rxdb.versionManager.createBranch('branch_03');

          await rxdb.versionManager.switchBranch('branch_01');

          const todos_b1 = await adapter.getRepository(Todo).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(todos_b1.length).toBe(2);
          expect(todos_b1[0].title).toBe('root-1');
          expect(todos_b1[1].title).toBe('root-2');

          await rxdb.versionManager.switchBranch('branch_03');

          const todos_b3 = await adapter.getRepository(Todo).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(todos_b3.length).toBe(4);
          expect(todos_b3.map(t => t.title).sort()).toEqual(['root-1', 'root-2', 'root-3', 'root-4']);
        });
      });
    });

    // ================================================================
    // 8. switch_branch
    // ================================================================
    describe('switch_branch 单元测试', () => {
      afterEach(async () => await cleanup_db(adapter));

      describe('generateSwitchBranchSql', () => {
        it('应生成包含触发器重建SQL的语句', async () => {
          const sql = generateSwitchBranchSql(adapter, 'test-branch');

          expect(sql.toUpperCase()).toContain('TRIGGER');
          expect(sql).toContain('UPDATE');
          expect(sql).toContain('rxdb_branch');
          expect(sql).toContain('RETURNING');
        });

        it('应正确转义分支ID中的单引号', async () => {
          const sql = generateSwitchBranchSql(adapter, "test'branch");

          expect(sql).toContain("test''branch");
        });

        it('应使用SQLite语法 (1/0)', async () => {
          const sql = generateSwitchBranchSql(adapter, 'test-branch');

          expect(sql).toMatch(/\b1\b/);
          expect(sql).toMatch(/\b0\b/);
          expect(sql).toContain('CURRENT_TIMESTAMP');
        });
      });

      describe('switch_branch 集成功能', () => {
        it('switchBranch方法应正确切换分支', async () => {
          await rxdb.versionManager.createBranch('feature-branch');

          const branches = await adapter.getRepository(RxDBBranch).find({
            where: { combinator: 'and', rules: [] }
          });
          const mainBranch = branches.find(b => b.id === 'main');
          const featureBranch = branches.find(b => b.id === 'feature-branch');

          expect(mainBranch?.activated).toBe(true);
          expect(featureBranch?.activated).toBe(false);

          await rxdb.versionManager.switchBranch('feature-branch');

          const branchesAfter = await adapter.getRepository(RxDBBranch).find({
            where: { combinator: 'and', rules: [] }
          });
          const mainAfter = branchesAfter.find(b => b.id === 'main');
          const featureAfter = branchesAfter.find(b => b.id === 'feature-branch');

          expect(mainAfter?.activated).toBe(false);
          expect(featureAfter?.activated).toBe(true);
        });
      });
    });
  });
}
