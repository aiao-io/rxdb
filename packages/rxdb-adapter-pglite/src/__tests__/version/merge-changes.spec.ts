import { RxDB, RxDBChange, SwitchVersionActions, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { cleanup_db, generateDbName } from '../test-utils.js';

/**
 * 辅助函数：创建 SwitchVersionChange
 */
const change = (patch: Partial<Todo> | null, inversePatch: Partial<Todo> | null = null) => ({ patch, inversePatch });

/**
 * 辅助函数：生成 UUID
 */
const uuid = () => crypto.randomUUID();

describe('mergeChanges', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  const find_all_todos = async () => {
    // 使用 internalQuery 绕过缓存，直接从数据库读取
    const result = await adapter.internalQuery<Todo>('SELECT * FROM "public"."todos"');
    return result.rows;
  };

  const find_all_changes = async () =>
    await adapter.getRepository(RxDBChange).find({
      where: { combinator: 'and', rules: [] },
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
          [`public:Todo:${todoId}`, change({ id: todoId, title: 'Inserted Todo', completed: false } as Partial<Todo>)]
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
      // 先创建一条数据
      const todo = new Todo();
      todo.title = 'Original Title';
      await todo.save();

      // 通过 mergeChanges 更新
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
      // 先创建一条数据
      const todo = new Todo();
      todo.title = 'To Be Deleted';
      await todo.save();

      const todosBeforeDelete = await find_all_todos();
      expect(todosBeforeDelete).toHaveLength(1);

      // 通过 mergeChanges 删除
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
          [`public:Todo:${todoId}`, change({ id: todoId, title: 'With Trigger', completed: false } as Partial<Todo>)]
        ]),
        updates: new Map()
      };

      await adapter.mergeChanges(actions, undefined, false);

      const changes = await find_all_changes();
      expect(changes.length).toBeGreaterThan(0);
      expect(changes.some((c: RxDBChange) => c.entityId === todoId)).toBe(true);
    });

    it('disableTriggers=true 不会生成 RxDBChange 记录', async () => {
      // 清空之前的 changes
      await cleanup_db(adapter);

      const todoId = uuid();
      const actions: SwitchVersionActions = {
        deletes: new Map(),
        inserts: new Map([
          [`public:Todo:${todoId}`, change({ id: todoId, title: 'Without Trigger', completed: false } as Partial<Todo>)]
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
      // 创建两条初始数据
      const todo1 = new Todo();
      todo1.title = 'Todo 1';
      await todo1.save();

      const todo2 = new Todo();
      todo2.title = 'Todo 2';
      await todo2.save();

      const newTodoId = uuid();

      // 混合操作：删除 todo1，更新 todo2，插入新的
      const actions: SwitchVersionActions = {
        deletes: new Map([[`public:Todo:${todo1.id}`, change(null)]]),
        inserts: new Map([
          [`public:Todo:${newTodoId}`, change({ id: newTodoId, title: 'New Todo', completed: false } as Partial<Todo>)]
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
      // 创建多条数据
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
