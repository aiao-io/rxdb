import { Todo, TypeDemo } from '@aiao/rxdb-test/entities';
import { filter, firstValueFrom } from 'rxjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { AdapterFactory } from './adapter-factory.js';
import { SUITE_DEADLINE_MS, cleanup_db, expect_observable_sequence } from './test-utils.js';

const createHistoryReadyFactory = (baseFactory: AdapterFactory): AdapterFactory => ({
  name: baseFactory.name,
  async createAdapter<T = unknown>(options?: Record<string, unknown>): Promise<T> {
    const adapter = await baseFactory.createAdapter<RxDBAdapterSqliteBase>(options);
    await firstValueFrom(adapter.rxdb.versionManager.history().undoHistories$);
    return adapter as T;
  },
  async createClient<T = unknown>(dbName: string, options?: Record<string, unknown>): Promise<T> {
    return baseFactory.createClient<T>(dbName, options);
  }
});

/** Undo-Redo 测试：版本切换动作的撤销与重做。 */
export function undoRedoSuite(baseFactory: AdapterFactory) {
  const factory = createHistoryReadyFactory(baseFactory);
  describe.sequential(`Undo-Redo [${factory.name}]`, () => {
    // ================================================================
    // 1. undo-redo-single — 单个 save 操作
    // ================================================================
    describe('单个 save', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      it('创建 → 撤销 → 重做', async () => {
        const todo = new Todo();
        todo.title = 'test-todo';
        await todo.save();

        const todoRepository = adapter.getRepository(Todo);
        let todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(1);
        expect(todos[0].title).toBe('test-todo');

        await adapter.rxdb.versionManager.history().undo();

        todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(0);

        await adapter.rxdb.versionManager.history().redo();

        todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(1);
        expect(todos[0].title).toBe('test-todo');
      });
    });

    // ================================================================
    // 2. undo-redo-single-step — 撤销一步
    // ================================================================
    describe('撤销一步', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      it('多次操作中只撤销最后一次', async () => {
        const todoRepository = adapter.getRepository(Todo);

        await Object.assign(new Todo(), { title: 'todo-1' }).save();
        await Object.assign(new Todo(), { title: 'todo-2' }).save();
        await Object.assign(new Todo(), { title: 'todo-3' }).save();

        let todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(3);

        await adapter.rxdb.versionManager.history().undo(1);

        todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(2);
        expect(todos.map(t => t.title).sort()).toEqual(['todo-1', 'todo-2']);
      });
    });

    // ================================================================
    // 3. undo-redo-batch — 批量创建
    // ================================================================
    describe('批量创建', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeEach(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterEach(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      it('Promise.all 批量保存 → 撤销 → 重做', async () => {
        const todoRepository = adapter.getRepository(Todo);

        await Promise.all([
          Object.assign(new Todo(), { title: 'batch-1' }).save(),
          Object.assign(new Todo(), { title: 'batch-2' }).save(),
          Object.assign(new Todo(), { title: 'batch-3' }).save()
        ]);

        let savedTodos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(savedTodos.length).toBe(3);
        expect(savedTodos.map(t => t.title).sort()).toEqual(['batch-1', 'batch-2', 'batch-3']);

        await adapter.rxdb.versionManager.history().undo(3);

        savedTodos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(savedTodos.length).toBe(0);

        await adapter.rxdb.versionManager.history().redo(3);

        savedTodos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(savedTodos.length).toBe(3);
        expect(savedTodos.map(t => t.title).sort()).toEqual(['batch-1', 'batch-2', 'batch-3']);
      });

      it('saveMany 批量保存撤销后只保留 redo 入口', async () => {
        const todoRepository = adapter.getRepository(Todo);
        const history = adapter.rxdb.versionManager.history(Todo);
        const batchTodos = Array.from({ length: 3 }, (_, index) =>
          Object.assign(new Todo(), { title: `batch-save-many-${index}` })
        );

        await adapter.rxdb.entityManager.saveMany(batchTodos);

        await expect(firstValueFrom(history.undoCount$.pipe(filter(count => count === 1)))).resolves.toBe(1);

        await history.undo();

        const savedTodos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(savedTodos.filter(t => t.title.startsWith('batch-save-many-')).length).toBe(0);
        await expect(firstValueFrom(history.undoCount$)).resolves.toBe(0);
        await expect(firstValueFrom(history.redoCount$)).resolves.toBe(1);
      });
    });

    // ================================================================
    // 4. undo-redo-multi-step — 撤销多步
    // ================================================================
    describe('撤销多步', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      it('连续撤销多次操作', async () => {
        const todoRepository = adapter.getRepository(Todo);

        for (let i = 1; i <= 5; i++) {
          await Object.assign(new Todo(), { title: `todo-${i}` }).save();
        }

        let todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(5);

        await adapter.rxdb.versionManager.history().undo(3);

        todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(2);
        expect(todos.map(t => t.title).sort()).toEqual(['todo-1', 'todo-2']);

        await new Promise(resolve => setTimeout(resolve, 100));

        await adapter.rxdb.versionManager.history().undo(2);

        todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(0);

        await adapter.rxdb.versionManager.history().redo(2);

        todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(2);
        expect(todos.map(t => t.title).sort()).toEqual(['todo-1', 'todo-2']);
      });
    });

    // ================================================================
    // 5. undo-redo-redo-multi — 重做多步
    // ================================================================
    describe('重做多步', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      it('连续重做多次操作', async () => {
        const todoRepository = adapter.getRepository(Todo);

        for (let i = 1; i <= 3; i++) {
          await Object.assign(new Todo(), { title: `todo-${i}` }).save();
        }

        await adapter.rxdb.versionManager.history().undo(3);

        let todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(0);

        await adapter.rxdb.versionManager.history().redo(2);
        todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(2);
        expect(todos.map(t => t.title).sort()).toEqual(['todo-2', 'todo-3']);

        await adapter.rxdb.versionManager.history().redo(1);

        todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(3);
        expect(todos.map(t => t.title).sort()).toEqual(['todo-1', 'todo-2', 'todo-3']);
      });
    });

    // ================================================================
    // 6. undo-redo-update — UPDATE 操作
    // ================================================================
    describe('UPDATE 操作', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      it('单个 update → undo → redo', async () => {
        const todoRepository = adapter.getRepository(Todo);

        const todo = new Todo();
        todo.title = 'v1';
        await todo.save();

        todo.title = 'v2';
        await todo.save();

        let todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(1);
        expect(todos[0].title).toBe('v2');

        await adapter.rxdb.versionManager.history().undo();

        todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(1);
        expect(todos[0].title).toBe('v1');

        await adapter.rxdb.versionManager.history().redo();

        todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(1);
        expect(todos[0].title).toBe('v2');
      });
    });

    // ================================================================
    // 6b. P1-011 —— undo/redo 写出的 updatedAt 必须单调
    // 缺陷：undo 走 `get_switch_version_actions(changes, false)`，UPDATE 分支把
    // `patch = change.inversePatch`——**inversePatch 里带着旧的 `updatedAt`**（trigger 按
    // `OLD IS NOT NEW` 逐列记录，而每次 save 都会改 updatedAt，所以它必然在里面）。
    // 适配器侧 `switch-result.utils.ts` 又直接 `entityData['updatedAt']` 取出来喂给
    // `update_sql`，于是 undo 把行的 updatedAt **原样倒退**到上一版本。
    // 为什么是缺陷而不是「精确还原」：`updatedAt` 是**写入时刻**，不是用户的逻辑状态。
    // 倒退会让 ① LWW 同步（supabase）把 undo 判成旧写而丢弃 ② 查询缓存的单调性前提失效
    // （`EntityStatus.fingerprint` = `id@updatedAt`，P0-004 的守卫正是建立在这个前提上）。
    // 本套件此前对 `updatedAt` **零断言**，所以旧行为不是被锁定的契约。
    // ================================================================
    describe('updatedAt 单调性（P1-011）', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      it('undo / redo 写出的 updatedAt 不得旧于被它替换掉的行', async () => {
        const todoRepository = adapter.getRepository(Todo);
        const readUpdatedAt = async (): Promise<number> => {
          const [row] = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
          return new Date(row.updatedAt as unknown as string).getTime();
        };

        const todo = new Todo();
        todo.title = 'v1';
        await todo.save();

        todo.title = 'v2';
        await todo.save();
        const afterUpdate = await readUpdatedAt();

        await adapter.rxdb.versionManager.history().undo();
        const afterUndo = await readUpdatedAt();
        expect(afterUndo).toBeGreaterThan(afterUpdate);

        await adapter.rxdb.versionManager.history().redo();
        const afterRedo = await readUpdatedAt();
        expect(afterRedo).toBeGreaterThan(afterUndo);
      });
    });

    // ================================================================
    // 7. undo-redo-update-multi — CREATE + UPDATE 多步
    // ================================================================
    describe('CREATE + UPDATE 多步', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      it('create → update → undo(2) → redo(2)', async () => {
        const todoRepository = adapter.getRepository(Todo);

        const todo = new Todo();
        todo.title = 'v1';
        await todo.save();

        todo.title = 'v2';
        await todo.save();

        let todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(1);
        expect(todos[0].title).toBe('v2');

        await adapter.rxdb.versionManager.history().undo(2);

        todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(0);

        await adapter.rxdb.versionManager.history().redo(2);

        todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(1);
        expect(todos[0].title).toBe('v2');
      });
    });

    // ================================================================
    // 8. undo-redo-update-batch — 批量 UPDATE
    // ================================================================
    describe('批量 UPDATE', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      it('批量 update → undo → redo', async () => {
        const todoRepository = adapter.getRepository(Todo);

        const todos = await Promise.all([
          Object.assign(new Todo(), { title: 'todo-1' }).save(),
          Object.assign(new Todo(), { title: 'todo-2' }).save(),
          Object.assign(new Todo(), { title: 'todo-3' }).save()
        ]);

        await Promise.all(
          todos.map((todo, i) => {
            todo.title = `updated-${i + 1}`;
            return todo.save();
          })
        );

        let savedTodos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(savedTodos.length).toBe(3);
        expect(savedTodos.map(t => t.title).sort()).toEqual(['updated-1', 'updated-2', 'updated-3']);

        await adapter.rxdb.versionManager.history().undo(3);

        savedTodos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(savedTodos.length).toBe(3);
        expect(savedTodos.map(t => t.title).sort()).toEqual(['todo-1', 'todo-2', 'todo-3']);

        await adapter.rxdb.versionManager.history().redo(3);

        savedTodos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(savedTodos.length).toBe(3);
        expect(savedTodos.map(t => t.title).sort()).toEqual(['updated-1', 'updated-2', 'updated-3']);
      });
    });

    // ================================================================
    // 9. undo-redo-delete — DELETE 操作
    // ================================================================
    describe('DELETE 操作', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      it('create → delete → undo → redo', async () => {
        const todoRepository = adapter.getRepository(Todo);

        const todo = new Todo();
        todo.title = 'test-todo';
        await todo.save();

        let todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(1);
        expect(todos[0].title).toBe('test-todo');

        await todo.remove();

        todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(0);

        await adapter.rxdb.versionManager.history().undo();

        todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(1);
        expect(todos[0].title).toBe('test-todo');

        await adapter.rxdb.versionManager.history().redo();

        todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(0);
      });
    });

    // ================================================================
    // 10. undo-redo-delete-multi — CREATE + DELETE 多步
    // ================================================================
    describe('CREATE + DELETE 多步', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      it('create → delete → undo(2) → redo(1)', async () => {
        const todoRepository = adapter.getRepository(Todo);

        const todo = new Todo();
        todo.title = 'test';
        await todo.save();

        await todo.remove();

        let todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(0);

        await adapter.rxdb.versionManager.history().undo(2);

        todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(0);

        await adapter.rxdb.versionManager.history().redo(1);

        todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(0);

        await adapter.rxdb.versionManager.history().redo(1);

        todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(1);
        expect(todos[0].title).toBe('test');
      });
    });

    // ================================================================
    // 11. undo-redo-delete-batch — 批量 DELETE
    // ================================================================
    describe('批量 DELETE', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      it('批量 delete → undo → redo', async () => {
        const todoRepository = adapter.getRepository(Todo);

        const todos = await Promise.all([
          Object.assign(new Todo(), { title: 'todo-1' }).save(),
          Object.assign(new Todo(), { title: 'todo-2' }).save(),
          Object.assign(new Todo(), { title: 'todo-3' }).save()
        ]);

        let savedTodos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(savedTodos.length).toBe(3);

        await Promise.all(todos.map(todo => todo.remove()));

        savedTodos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(savedTodos.length).toBe(0);

        await adapter.rxdb.versionManager.history().undo(3);

        savedTodos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(savedTodos.length).toBe(3);
        expect(savedTodos.map(t => t.title).sort()).toEqual(['todo-1', 'todo-2', 'todo-3']);

        await adapter.rxdb.versionManager.history().redo(3);

        savedTodos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(savedTodos.length).toBe(0);
      });
    });

    // ================================================================
    // 12. undo-redo-mixed — 混合操作
    // ================================================================
    describe('混合操作', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      it('单个 + 批量保存 → 撤销 → 重做', async () => {
        const todoRepository = adapter.getRepository(Todo);

        await Object.assign(new Todo(), { title: 'single-1' }).save();

        await Promise.all([
          Object.assign(new Todo(), { title: 'batch-1' }).save(),
          Object.assign(new Todo(), { title: 'batch-2' }).save()
        ]);

        await Object.assign(new Todo(), { title: 'single-2' }).save();

        let todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(4);

        await adapter.rxdb.versionManager.history().undo(3);

        todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(1);
        expect(todos[0].title).toBe('single-1');

        await adapter.rxdb.versionManager.history().redo(2);

        todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(3);
        expect(todos.map(t => t.title).sort()).toEqual(['batch-2', 'single-1', 'single-2']);
      });
    });

    // ================================================================
    // 13. undo-redo-mixed-crud — 混合 CRUD
    // ================================================================
    describe('混合 CRUD', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      it('create → update → delete → undo(3)', async () => {
        const todoRepository = adapter.getRepository(Todo);

        const todo = new Todo();
        todo.title = 'v1';
        await todo.save();

        let todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(1);
        expect(todos[0].title).toBe('v1');

        todo.title = 'v2';
        await todo.save();

        todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos[0].title).toBe('v2');

        await todo.remove();

        todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(0);

        await adapter.rxdb.versionManager.history().undo(3);

        todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(0);
      });
    });

    // ================================================================
    // 14. undo-redo-mixed-crud-batch — 批量混合 CRUD
    // ================================================================
    describe('批量混合 CRUD', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      it('批量混合操作 → 全部 undo → 全部 redo', async () => {
        const todoRepository = adapter.getRepository(Todo);

        const todos = await Promise.all([
          Object.assign(new Todo(), { title: 'a' }).save(),
          Object.assign(new Todo(), { title: 'b' }).save(),
          Object.assign(new Todo(), { title: 'c' }).save()
        ]);

        await Promise.all([
          Object.assign(todos[0], { title: 'a-updated' }).save(),
          Object.assign(todos[1], { title: 'b-updated' }).save()
        ]);

        await Promise.all([todos[0].remove(), todos[2].remove()]);

        let savedTodos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(savedTodos.length).toBe(1);
        expect(savedTodos[0].title).toBe('b-updated');

        await adapter.rxdb.versionManager.history().undo(7);

        savedTodos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(savedTodos.length).toBe(0);

        await adapter.rxdb.versionManager.history().redo(7);

        savedTodos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(savedTodos.length).toBe(1);
        expect(savedTodos[0].title).toBe('b-updated');
      });
    });

    // ================================================================
    // 15. undo-redo-mixed-crud-complex — 复杂混合 CRUD
    // ================================================================
    describe('复杂混合 CRUD', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      it('create×2 → update×2 → delete×1 → 部分 undo/redo', async () => {
        const todoRepository = adapter.getRepository(Todo);

        const todo1 = await Object.assign(new Todo(), { title: 'todo-1' }).save();
        const todo2 = await Object.assign(new Todo(), { title: 'todo-2' }).save();

        todo1.title = 'updated-1';
        await todo1.save();
        todo2.title = 'updated-2';
        await todo2.save();

        await todo1.remove();

        let todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(1);
        expect(todos[0].title).toBe('updated-2');

        await adapter.rxdb.versionManager.history().undo(1);

        todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(2);
        expect(todos.map(t => t.title).sort()).toEqual(['updated-1', 'updated-2']);

        await adapter.rxdb.versionManager.history().redo(1);

        todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(1);
        expect(todos[0].title).toBe('updated-2');
      });
    });

    // ================================================================
    // 16. undo-redo-savemany —— saveMany。
    // ================================================================
    describe('saveMany', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      it(
        '单个 save + saveMany → undo → redo',
        async () => {
          const todoRepository = adapter.getRepository(Todo);

          const todo1 = new Todo();
          todo1.title = 'single-todo';
          await todo1.save();

          let todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
          expect(todos.length).toBe(1);
          expect(todos[0].title).toBe('single-todo');

          const batchTodos: Todo[] = [];
          for (let i = 0; i < 10; i++) {
            const todo = new Todo();
            todo.title = `batch-todo-${i}`;
            batchTodos.push(todo);
          }
          await adapter.rxdb.entityManager.saveMany(batchTodos);

          todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
          expect(todos.length).toBe(11);

          await adapter.rxdb.versionManager.history().undo();

          todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
          expect(todos.length).toBe(1);
          expect(todos[0].title).toBe('single-todo');

          await adapter.rxdb.versionManager.history().redo();

          todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
          expect(todos.length).toBe(11);
          expect(todos.filter(t => t.title.startsWith('batch-todo')).length).toBe(10);
        },
        SUITE_DEADLINE_MS
      );
    });

    // ================================================================
    // 17. undo-redo-json-types — JSON 类型字段
    // ================================================================
    describe('JSON 类型字段 (stringArray, numberArray, json, keyValue)', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [TypeDemo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      it('stringArray: 创建 → 更新 → undo → 值恢复为数组', async () => {
        const demo = new TypeDemo();
        demo.string = 'sa-test';
        demo.number = 1;
        demo.integer = 1;
        demo.boolean = true;
        demo.date = new Date();
        demo.stringArray = ['apple', 'banana'];
        demo.numberArray = [1];
        demo.keyValue = { string: 'kv', number: 1, integer: 1, boolean: true, date: new Date() };
        demo.json = { x: 1 };
        await demo.save();

        const repo = adapter.getRepository(TypeDemo);

        let rows = await repo.find({
          where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: demo.id }] }
        });
        expect(rows[0].stringArray).toEqual(['apple', 'banana']);

        demo.stringArray = ['cherry'];
        await demo.save();

        rows = await repo.find({
          where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: demo.id }] }
        });
        expect(rows[0].stringArray).toEqual(['cherry']);

        await adapter.rxdb.versionManager.history().undo();

        rows = await repo.find({
          where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: demo.id }] }
        });
        expect(Array.isArray(rows[0].stringArray)).toBe(true);
        expect(rows[0].stringArray).toEqual(['apple', 'banana']);
      });

      it('numberArray: 创建 → 更新 → undo → 值恢复为数组', async () => {
        const demo = new TypeDemo();
        demo.string = 'na-test';
        demo.number = 1;
        demo.integer = 1;
        demo.boolean = true;
        demo.date = new Date();
        demo.stringArray = ['a'];
        demo.numberArray = [10, 20, 30];
        demo.keyValue = { string: 'kv', number: 1, integer: 1, boolean: true, date: new Date() };
        demo.json = { x: 1 };
        await demo.save();

        const repo = adapter.getRepository(TypeDemo);

        demo.numberArray = [99];
        await demo.save();

        await adapter.rxdb.versionManager.history().undo();

        const rows = await repo.find({
          where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: demo.id }] }
        });
        expect(Array.isArray(rows[0].numberArray)).toBe(true);
        expect(rows[0].numberArray).toEqual([10, 20, 30]);
      });

      it('json: 创建 → 更新 → undo → 值恢复为对象', async () => {
        const demo = new TypeDemo();
        demo.string = 'json-test';
        demo.number = 1;
        demo.integer = 1;
        demo.boolean = true;
        demo.date = new Date();
        demo.stringArray = ['a'];
        demo.numberArray = [1];
        demo.keyValue = { string: 'kv', number: 1, integer: 1, boolean: true, date: new Date() };
        demo.json = { nested: { key: 'value', arr: [1, 2] } };
        await demo.save();

        const repo = adapter.getRepository(TypeDemo);

        demo.json = { updated: true };
        await demo.save();

        await adapter.rxdb.versionManager.history().undo();

        const rows = await repo.find({
          where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: demo.id }] }
        });
        expect(rows[0].json).toEqual({ nested: { key: 'value', arr: [1, 2] } });
      });

      it('stringArray: 连续多次更新 → 多次 undo → 逐步恢复', async () => {
        const demo = new TypeDemo();
        demo.string = 'multi-undo';
        demo.number = 1;
        demo.integer = 1;
        demo.boolean = true;
        demo.date = new Date();
        demo.stringArray = ['v1'];
        demo.numberArray = [1];
        demo.keyValue = { string: 'kv', number: 1, integer: 1, boolean: true, date: new Date() };
        demo.json = { x: 1 };
        await demo.save();

        const repo = adapter.getRepository(TypeDemo);

        demo.stringArray = ['v1', 'v2'];
        await demo.save();

        demo.stringArray = ['v1', 'v2', 'v3'];
        await demo.save();

        await adapter.rxdb.versionManager.history().undo();
        let rows = await repo.find({
          where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: demo.id }] }
        });
        expect(rows[0].stringArray).toEqual(['v1', 'v2']);

        await adapter.rxdb.versionManager.history().undo();
        rows = await repo.find({
          where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: demo.id }] }
        });
        expect(rows[0].stringArray).toEqual(['v1']);
      });

      it('stringArray: 更新 → undo → redo → 值正确', async () => {
        const demo = new TypeDemo();
        demo.string = 'redo-test';
        demo.number = 1;
        demo.integer = 1;
        demo.boolean = true;
        demo.date = new Date();
        demo.stringArray = ['a', 'b'];
        demo.numberArray = [1];
        demo.keyValue = { string: 'kv', number: 1, integer: 1, boolean: true, date: new Date() };
        demo.json = { x: 1 };
        await demo.save();

        const repo = adapter.getRepository(TypeDemo);

        demo.stringArray = ['c', 'd', 'e'];
        await demo.save();

        await adapter.rxdb.versionManager.history().undo();
        let rows = await repo.find({
          where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: demo.id }] }
        });
        expect(rows[0].stringArray).toEqual(['a', 'b']);

        await adapter.rxdb.versionManager.history().redo();
        rows = await repo.find({
          where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: demo.id }] }
        });
        expect(rows[0].stringArray).toEqual(['c', 'd', 'e']);
      });

      it('DELETE 含 stringArray 的实体 → undo → 值恢复为数组', async () => {
        const demo = new TypeDemo();
        demo.string = 'delete-undo';
        demo.number = 1;
        demo.integer = 1;
        demo.boolean = true;
        demo.date = new Date();
        demo.stringArray = ['x', 'y', 'z'];
        demo.numberArray = [1];
        demo.keyValue = { string: 'kv', number: 1, integer: 1, boolean: true, date: new Date() };
        demo.json = { x: 1 };
        await demo.save();

        const repo = adapter.getRepository(TypeDemo);
        const demoId = demo.id;

        await demo.remove();
        let rows = await repo.find({
          where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: demoId }] }
        });
        expect(rows.length).toBe(0);

        await adapter.rxdb.versionManager.history().undo();
        rows = await repo.find({
          where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: demoId }] }
        });
        expect(rows.length).toBe(1);
        expect(Array.isArray(rows[0].stringArray)).toBe(true);
        expect(rows[0].stringArray).toEqual(['x', 'y', 'z']);
      });
    });

    // ================================================================
    // 18. undo-redo-invalidate-1 — redo 栈失效 (创建新数据)
    // ================================================================
    describe('redo 栈失效 - 创建新数据', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      it('undo 后创建新数据，之前 undo 的数据不可 redo', async () => {
        const rxdb = adapter.rxdb;
        const repo = adapter.getRepository(Todo);

        const todoA = new Todo();
        todoA.title = 'Todo A';
        await todoA.save();

        const todoB = new Todo();
        todoB.title = 'Todo B';
        await todoB.save();

        const todoC = new Todo();
        todoC.title = 'Todo C';
        await todoC.save();

        let todos = await repo.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(3);

        await rxdb.versionManager.history().undo(1);

        todos = await repo.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(2);

        let redoHistories = await firstValueFrom(rxdb.versionManager.history().redoHistories$);
        expect(redoHistories.length).toBe(1);

        const todoD = new Todo();
        todoD.title = 'Todo D';
        await todoD.save();

        await new Promise(resolve => setTimeout(resolve, 100));

        redoHistories = await firstValueFrom(rxdb.versionManager.history().redoHistories$);
        expect(redoHistories.length).toBe(0);

        todos = await repo.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(3);

        await rxdb.versionManager.history().redo(1);

        todos = await repo.find({ where: { combinator: 'and', rules: [] } });
        expect(todos.length).toBe(3);
      });
    });

    // ================================================================
    // 19. undo-redo-invalidate-2 — redo 栈失效 (多次 undo)
    // ================================================================
    describe('redo 栈失效 - 多次 undo 后创建新数据', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      it('undo 多次后创建新数据，所有 undo 的数据都不可 redo', async () => {
        const rxdb = adapter.rxdb;
        const repo = adapter.getRepository(Todo);

        const titles = ['A', 'B', 'C', 'D'];
        for (const title of titles) {
          const todo = new Todo();
          todo.title = `Todo ${title}`;
          await todo.save();
        }

        let result = await repo.find({ where: { combinator: 'and', rules: [] } });
        expect(result.length).toBe(4);

        await rxdb.versionManager.history().undo(2);

        result = await repo.find({ where: { combinator: 'and', rules: [] } });
        expect(result.length).toBe(2);

        let redoHistories = await firstValueFrom(rxdb.versionManager.history().redoHistories$);
        expect(redoHistories.length).toBe(2);

        const todoE = new Todo();
        todoE.title = 'Todo E';
        await todoE.save();

        await new Promise(resolve => setTimeout(resolve, 100));

        redoHistories = await firstValueFrom(rxdb.versionManager.history().redoHistories$);
        expect(redoHistories.length).toBe(0);

        result = await repo.find({ where: { combinator: 'and', rules: [] } });
        expect(result.length).toBe(3);
      });
    });

    // ================================================================
    // 20. undo-redo-invalidate-3 — redo 栈失效 (更新数据)
    // ================================================================
    describe('redo 栈失效 - undo 后更新数据', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      it('undo 后更新数据，redo 栈失效', async () => {
        const rxdb = adapter.rxdb;

        const todoA = new Todo();
        todoA.title = 'Todo A';
        await todoA.save();

        await rxdb.versionManager.history().undo(1);

        let redoHistories = await firstValueFrom(rxdb.versionManager.history().redoHistories$);
        expect(redoHistories.length).toBe(1);

        const todoB = new Todo();
        todoB.title = 'Todo B';
        await todoB.save();

        await new Promise(resolve => setTimeout(resolve, 100));

        redoHistories = await firstValueFrom(rxdb.versionManager.history().redoHistories$);
        expect(redoHistories.length).toBe(0);
      });
    });

    // ================================================================
    // 21. undo-redo-invalidate-4 — redo 栈失效 (删除数据)
    // ================================================================
    describe('redo 栈失效 - undo 后删除数据', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      it('undo 后删除数据，redo 栈失效', async () => {
        const rxdb = adapter.rxdb;
        const repo = adapter.getRepository(Todo);

        const todoA = new Todo();
        todoA.title = 'Todo A';
        await todoA.save();

        const todoB = new Todo();
        todoB.title = 'Todo B';
        await todoB.save();

        await rxdb.versionManager.history().undo(1);

        let redoHistories = await firstValueFrom(rxdb.versionManager.history().redoHistories$);
        expect(redoHistories.length).toBe(1);

        const todos = await repo.find({ where: { combinator: 'and', rules: [] } });
        await todos[0].remove();

        await new Promise(resolve => setTimeout(resolve, 100));

        redoHistories = await firstValueFrom(rxdb.versionManager.history().redoHistories$);
        expect(redoHistories.length).toBe(0);
      });
    });

    // ================================================================
    // 22. undo-redo-observable — Observable 增量计算观察
    // ================================================================
    describe('Observable 增量计算观察', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeEach(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterEach(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      it('观察 completed 状态变化：创建 → 标记完成 → undo', async () => {
        const rxdb = adapter.rxdb;
        const repository = adapter.rxdb.entityManager.getRepository(Todo) as Pick<typeof Todo, 'findAll'>;

        const initialTodo = new Todo();
        initialTodo.title = 'Todo 1';
        initialTodo.completed = true;
        await initialTodo.save();

        await expect_observable_sequence(
          repository.findAll({
            where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: true }] }
          }),
          [
            {
              validate: (data: Todo[]) => {
                expect(data.length).toBe(1);
              },
              run: async () => {
                await rxdb.versionManager.history().undo();
              }
            },
            {
              validate: (data: Todo[]) => {
                expect(data.length).toBe(0);
              }
            }
          ]
        );
      });

      it('观察完成计数：多次操作 → 多次 undo', async () => {
        const rxdb = adapter.rxdb;
        const repository = adapter.rxdb.entityManager.getRepository(Todo) as Pick<typeof Todo, 'findAll'>;

        const todo1 = new Todo();
        todo1.title = 'Todo 1';
        todo1.completed = true;
        await todo1.save();

        const todo2 = new Todo();
        todo2.title = 'Todo 2';
        todo2.completed = true;
        await todo2.save();

        await expect_observable_sequence(
          repository.findAll({
            where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: true }] }
          }),
          [
            {
              validate: (data: Todo[]) => {
                expect(data.length).toBe(2);
              },
              run: async () => {
                await rxdb.versionManager.history().undo();
              }
            },
            {
              validate: (data: Todo[]) => {
                expect(data.length).toBe(1);
              },
              run: async () => {
                await rxdb.versionManager.history().undo();
              }
            },
            {
              validate: (data: Todo[]) => {
                expect(data.length).toBe(0);
              }
            }
          ]
        );
      });

      it('观察总数变化：创建 → undo → redo', async () => {
        const rxdb = adapter.rxdb;
        const repository = adapter.rxdb.entityManager.getRepository(Todo) as Pick<typeof Todo, 'findAll'>;

        await adapter.getRepository(Todo).find({ where: { combinator: 'and', rules: [] } });

        await expect_observable_sequence(
          repository.findAll({
            where: { combinator: 'and', rules: [] }
          }),
          [
            {
              validate: (data: Todo[]) => {
                expect(data.length).toBe(0);
              },
              run: async () => {
                const todo = new Todo();
                todo.title = 'Todo 1';
                todo.completed = false;
                await todo.save();
              }
            },
            {
              validate: (data: Todo[]) => {
                expect(data.length).toBe(1);
              },
              run: async () => {
                await rxdb.versionManager.history().undo();
              }
            },
            {
              validate: (data: Todo[]) => {
                expect(data.length).toBe(0);
              },
              run: async () => {
                await new Promise(resolve => setTimeout(resolve, 100));
                await rxdb.versionManager.history().redo();
              }
            },
            {
              validate: (data: Todo[]) => {
                expect(data.length).toBe(1);
              }
            }
          ]
        );
      });

      it('观察 title 值变化：更新 → undo → redo', async () => {
        const rxdb = adapter.rxdb;
        const repository = adapter.rxdb.entityManager.getRepository(Todo) as Pick<typeof Todo, 'findAll'>;

        const todo = new Todo();
        todo.title = 'Version 1';
        todo.completed = false;
        await todo.save();

        await expect_observable_sequence(
          repository.findAll({
            where: { combinator: 'and', rules: [] }
          }),
          [
            {
              validate: (data: Todo[]) => {
                expect(data.map(t => t.title).sort()).toEqual(['Version 1']);
              },
              run: async () => {
                todo.title = 'Version 2';
                await todo.save();
              }
            },
            {
              validate: (data: Todo[]) => {
                expect(data.map(t => t.title).sort()).toEqual(['Version 2']);
              },
              run: async () => {
                await rxdb.versionManager.history().undo();
              }
            },
            {
              validate: (data: Todo[]) => {
                expect(data.map(t => t.title).sort()).toEqual(['Version 1']);
              },
              run: async () => {
                await new Promise(resolve => setTimeout(resolve, 100));
                await rxdb.versionManager.history().redo();
              }
            },
            {
              validate: (data: Todo[]) => {
                expect(data.map(t => t.title).sort()).toEqual(['Version 2']);
              }
            }
          ]
        );
      });

      it('观察删除操作：创建 → 删除 → undo 恢复', async () => {
        const rxdb = adapter.rxdb;
        const repository = adapter.rxdb.entityManager.getRepository(Todo) as Pick<typeof Todo, 'findAll'>;

        const todo = new Todo();
        todo.title = 'To be deleted';
        todo.completed = false;
        await todo.save();

        await expect_observable_sequence(
          repository.findAll({
            where: { combinator: 'and', rules: [] }
          }),
          [
            {
              validate: (data: Todo[]) => {
                expect(data.length).toBe(1);
              },
              run: async () => {
                await todo.remove();
              }
            },
            {
              validate: (data: Todo[]) => {
                expect(data.length).toBe(0);
              },
              run: async () => {
                await rxdb.versionManager.history().undo();
              }
            },
            {
              validate: (data: Todo[]) => {
                expect(data.length).toBe(1);
              }
            }
          ]
        );
      });
    });

    // ================================================================
    // 23. undo-redo-observable-completed — Observable 观察 completed 状态
    // ================================================================
    describe('Observable 观察 completed 状态', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      afterEach(async () => {
        await cleanup_db(adapter);
      });

      it('观察 completed 状态变化：创建 → 标记完成 → undo', async () => {
        const rxdb = adapter.rxdb;

        const initialTodo = new Todo();
        initialTodo.title = 'Todo 1';
        initialTodo.completed = true;
        await initialTodo.save();

        let index = 0;
        const actions = [
          {
            completedCount: 1,
            run: async () => {
              await rxdb.versionManager.history().undo();
            }
          },
          {
            completedCount: 0
          }
        ];

        return new Promise<void>((resolve, reject) => {
          const sub = Todo.findAll({
            where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: true }] }
          }).subscribe({
            next: data => {
              try {
                const action = actions[index];
                expect(data.length).toBe(action.completedCount);

                if (action.run) {
                  action.run().catch(reject);
                }

                index++;
                if (index >= actions.length) {
                  adapter
                    .getRepository(Todo)
                    .find({ where: { combinator: 'and', rules: [] } })
                    .then(() => {
                      // 无操作。
                    });
                  sub.unsubscribe();
                  setTimeout(resolve, 50);
                }
              } catch (error) {
                sub.unsubscribe();
                reject(error);
              }
            },
            error: err => {
              sub.unsubscribe();
              reject(err);
            }
          });
        });
      });
    });

    // ================================================================
    // 24. undo-redo-observable-count —— Observable 计数。
    // ================================================================
    describe('Undo/Redo Observable Count', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      afterEach(async () => {
        await cleanup_db(adapter);
      });

      it('观察总数变化：创建 → undo → redo', async () => {
        const rxdb = adapter.rxdb;

        let index = 0;
        const actions = [
          {
            totalCount: 0,
            run: async () => {
              const todo = new Todo();
              todo.title = 'Todo 1';
              todo.completed = false;
              await todo.save();
            }
          },
          {
            totalCount: 1,
            run: async () => {
              await rxdb.versionManager.history().undo();
            }
          },
          {
            totalCount: 0,
            run: async () => {
              await new Promise(resolve => setTimeout(resolve, 100));
              await rxdb.versionManager.history().redo();
            }
          },
          {
            totalCount: 1
          }
        ];

        return new Promise<void>((resolve, reject) => {
          const sub = Todo.find({
            where: { combinator: 'and', rules: [] }
          }).subscribe({
            next: data => {
              try {
                const action = actions[index];
                expect(data.length).toBe(action.totalCount);

                if (action.run) {
                  action.run().catch(reject);
                }

                index++;
                if (index >= actions.length) {
                  sub.unsubscribe();
                  setTimeout(resolve, 50);
                }
              } catch (error) {
                sub.unsubscribe();
                reject(error);
              }
            },
            error: err => {
              sub.unsubscribe();
              reject(err);
            }
          });
        });
      });
    });

    // ================================================================
    // 25. undo-redo-observable-delete — Observable 观察删除操作
    // ================================================================
    describe('Observable 观察删除操作', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      afterEach(async () => {
        await cleanup_db(adapter);
      });

      it('观察删除操作：创建 → 删除 → undo 恢复', async () => {
        const rxdb = adapter.rxdb;

        await adapter.getRepository(Todo).find({ where: { combinator: 'and', rules: [] } });

        let index = 0;
        const actions = [
          {
            totalCount: 0,
            run: async () => {
              const todo = new Todo();
              todo.title = 'To be deleted';
              todo.completed = false;
              await todo.save();
            }
          },
          {
            totalCount: 1,
            run: async () => {
              const todos = await adapter.getRepository(Todo).find({ where: { combinator: 'and', rules: [] } });
              await todos[0].remove();
            }
          },
          {
            totalCount: 0,
            run: async () => {
              await rxdb.versionManager.history().undo();
            }
          },
          {
            totalCount: 1
          }
        ];

        return new Promise<void>((resolve, reject) => {
          const sub = Todo.find({
            where: { combinator: 'and', rules: [] }
          }).subscribe({
            next: data => {
              try {
                const action = actions[index];
                expect(data.length).toBe(action.totalCount);

                if (action.run) {
                  action.run().catch(reject);
                }

                index++;
                if (index >= actions.length) {
                  sub.unsubscribe();
                  setTimeout(resolve, 50);
                }
              } catch (error) {
                sub.unsubscribe();
                reject(error);
              }
            },
            error: err => {
              sub.unsubscribe();
              reject(err);
            }
          });
        });
      });
    });

    // ================================================================
    // 26. undo-redo-observable-multi — Observable 观察多次操作
    // ================================================================
    describe('Observable 观察多次操作', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      afterEach(async () => {
        await cleanup_db(adapter);
      });

      it('观察完成计数:多次操作 → 多次 undo', async () => {
        const rxdb = adapter.rxdb;

        const todo1 = new Todo();
        todo1.title = 'Todo 1';
        todo1.completed = true;
        await todo1.save();

        const todo2 = new Todo();
        todo2.title = 'Todo 2';
        todo2.completed = true;
        await todo2.save();

        let index = 0;
        const actions = [
          {
            completedCount: 2,
            run: async () => {
              await rxdb.versionManager.history().undo();
            }
          },
          {
            completedCount: 1,
            run: async () => {
              await rxdb.versionManager.history().undo();
            }
          },
          {
            completedCount: 0
          }
        ];

        return new Promise<void>((resolve, reject) => {
          const sub = Todo.findAll({
            where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: true }] }
          }).subscribe({
            next: data => {
              try {
                const action = actions[index];
                expect(data.length).toBe(action.completedCount);

                if (action.run) {
                  action.run().catch(reject);
                }

                index++;
                if (index >= actions.length) {
                  sub.unsubscribe();
                  setTimeout(resolve, 50);
                }
              } catch (error) {
                sub.unsubscribe();
                reject(error);
              }
            },
            error: err => {
              sub.unsubscribe();
              reject(err);
            }
          });
        });
      });
    });

    // ================================================================
    // 27. undo-redo-observable-title — Observable 观察 title 变化
    // ================================================================
    describe('Observable 观察 title 变化', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeEach(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterEach(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      it('观察 title 值变化：更新 → undo → redo', async () => {
        const rxdb = adapter.rxdb;
        const repository = adapter.rxdb.entityManager.getRepository(Todo) as Pick<typeof Todo, 'findAll'>;

        const todo = new Todo();
        todo.title = 'Version 1';
        todo.completed = false;
        await todo.save();

        await expect_observable_sequence(
          repository.findAll({
            where: { combinator: 'and', rules: [] }
          }),
          [
            {
              validate: data => {
                expect(data.map(t => t.title).sort()).toEqual(['Version 1']);
              },
              run: async () => {
                todo.title = 'Version 2';
                await todo.save();
              }
            },
            {
              validate: data => {
                expect(data.map(t => t.title).sort()).toEqual(['Version 2']);
              },
              run: async () => {
                await rxdb.versionManager.history().undo();
              }
            },
            {
              validate: data => {
                expect(data.map(t => t.title).sort()).toEqual(['Version 1']);
              },
              run: async () => {
                await new Promise(resolve => setTimeout(resolve, 100));
                await rxdb.versionManager.history().redo();
              }
            },
            {
              validate: data => {
                expect(data.map(t => t.title).sort()).toEqual(['Version 2']);
              }
            }
          ]
        );
      });
    });

    // ================================================================
    // 28. undo-redo-toggle-completed-2 — 来回切换 completed 状态 测试 2
    // ================================================================
    describe('来回切换 completed 状态 - Test 2', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      afterEach(async () => {
        await cleanup_db(adapter);
      });

      it('应该通过 Observable 正确观察 completed 状态的变化', { timeout: SUITE_DEADLINE_MS }, async () => {
        const rxdb = adapter.rxdb;
        const wait = () => new Promise(resolve => setTimeout(resolve, 50));

        const todo = new Todo();
        todo.title = 'Observable Test Todo';
        todo.completed = false;
        await todo.save();
        await wait();
        const todoId = todo.id;

        const observedStates: boolean[] = [];
        let actionIndex = 0;

        const actions = [
          {
            expectedCompleted: false,
            run: async () => {
              todo.completed = true;
              await todo.save();
              await wait();
            }
          },
          {
            expectedCompleted: true,
            run: async () => {
              todo.completed = false;
              await todo.save();
              await wait();
            }
          },
          {
            expectedCompleted: false,
            run: async () => {
              await rxdb.versionManager.history().undo();
              await wait();
            }
          },
          {
            expectedCompleted: true,
            run: async () => {
              await rxdb.versionManager.history().undo();
              await wait();
            }
          },
          {
            expectedCompleted: false,
            run: async () => {
              await rxdb.versionManager.history().redo();
              await wait();
            }
          },
          {
            expectedCompleted: true,
            run: async () => {
              await rxdb.versionManager.history().redo();
              await wait();
            }
          },
          {
            expectedCompleted: false
          }
        ];

        return new Promise<void>((resolve, reject) => {
          let isProcessing = false;

          const sub = Todo.findOneOrFail({
            where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: todoId }] }
          }).subscribe({
            next: async data => {
              if (isProcessing || actionIndex >= actions.length) return;
              isProcessing = true;

              try {
                const action = actions[actionIndex];
                expect(data.completed).toBe(action.expectedCompleted);
                observedStates.push(data.completed);

                const currentActionIndex = actionIndex;
                actionIndex++;
                isProcessing = false;

                if (actions[currentActionIndex].run) {
                  await actions[currentActionIndex].run();
                }

                if (actionIndex >= actions.length) {
                  sub.unsubscribe();

                  expect(observedStates).toEqual([false, true, false, true, false, true, false]);

                  setTimeout(resolve, 50);
                }
              } catch (error) {
                sub.unsubscribe();
                reject(error);
              }
            },
            error: err => {
              sub.unsubscribe();
              reject(err);
            }
          });
        });
      });
    });

    // ================================================================
    // 29. undo-redo-toggle-completed-3 — 来回切换 completed 状态 测试 3
    // ================================================================
    describe('来回切换 completed 状态 - Test 3', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      afterEach(async () => {
        await cleanup_db(adapter);
      });

      it('应该正确处理多个 todo 的 completed 状态切换', async () => {
        const rxdb = adapter.rxdb;
        const wait = () => new Promise(resolve => setTimeout(resolve, 50));

        const todo1 = new Todo({ title: 'Todo 1', completed: false });
        const todo2 = new Todo({ title: 'Todo 2', completed: false });
        const todo3 = new Todo({ title: 'Todo 3', completed: false });
        await todo1.save();
        await todo2.save();
        await todo3.save();
        await wait();

        todo1.completed = true;
        await todo1.save();
        await wait();
        todo2.completed = true;
        await todo2.save();
        await wait();

        let completedCount = await firstValueFrom(
          Todo.count({
            where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: true }] }
          })
        );
        expect(completedCount).toBe(2);

        await rxdb.versionManager.history().undo();
        await wait();
        completedCount = await firstValueFrom(
          Todo.count({
            where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: true }] }
          })
        );
        expect(completedCount).toBe(1);

        await rxdb.versionManager.history().undo();
        await wait();
        completedCount = await firstValueFrom(
          Todo.count({
            where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: true }] }
          })
        );
        expect(completedCount).toBe(0);

        await rxdb.versionManager.history().redo();
        await wait();
        completedCount = await firstValueFrom(
          Todo.count({
            where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: true }] }
          })
        );
        expect(completedCount).toBe(1);

        await rxdb.versionManager.history().redo();
        await wait();
        completedCount = await firstValueFrom(
          Todo.count({
            where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: true }] }
          })
        );
        expect(completedCount).toBe(2);

        const todos = await firstValueFrom(Todo.findAll({ where: { combinator: 'and', rules: [] } }));
        const completedTodos = todos.filter(t => t.completed);
        expect(completedTodos.length).toBe(2);
        expect(completedTodos.some(t => t.id === todo1.id)).toBe(true);
        expect(completedTodos.some(t => t.id === todo2.id)).toBe(true);
      });
    });

    // ================================================================
    // 30. undo-redo-toggle-completed-4 — 来回切换 completed 状态 测试 4
    // ================================================================
    describe('来回切换 completed 状态 - Test 4', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        if (adapter) {
          await adapter.rxdb.disconnectAll();
        }
      });

      afterEach(async () => {
        await cleanup_db(adapter);
      });

      it('应该在批量更新 completed 后正确 undo/redo', async () => {
        const rxdb = adapter.rxdb;
        const wait = () => new Promise(resolve => setTimeout(resolve, 50));

        const todos: Todo[] = [];
        for (let i = 0; i < 5; i++) {
          const todo = new Todo({ title: `Todo ${i}`, completed: false });
          todos.push(todo);
        }
        await rxdb.entityManager.saveMany(todos);
        await wait();

        todos.forEach(t => (t.completed = true));
        await rxdb.entityManager.saveMany(todos);
        await wait();

        let completedCount = await firstValueFrom(
          Todo.count({
            where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: true }] }
          })
        );
        expect(completedCount).toBe(5);

        await rxdb.versionManager.history().undo();
        await wait();
        completedCount = await firstValueFrom(
          Todo.count({
            where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: true }] }
          })
        );
        expect(completedCount).toBe(0);

        await rxdb.versionManager.history().redo();
        await wait();
        completedCount = await firstValueFrom(
          Todo.count({
            where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: true }] }
          })
        );
        expect(completedCount).toBe(5);

        await rxdb.versionManager.history().undo();
        await wait();
        completedCount = await firstValueFrom(
          Todo.count({
            where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: true }] }
          })
        );
        expect(completedCount).toBe(0);
      });
    });
  });
}
