import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import { SupabaseRepository } from '../SupabaseRepository.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';

describe('Todo 实体 Supabase 适配器', () => {
  let testTodo: Todo;
  let rxdb: RxDB;
  let adapter: RxDBAdapterSupabase;
  let repository: SupabaseRepository<typeof Todo>;

  beforeAll(async () => {
    // 创建新的数据库实例
    rxdb = new RxDB({
      dbName: `test-todo-${Date.now()}`,
      context: { userId: 'userId' },
      entities: [Todo],
      sync: {
        remote: {
          adapter: 'supabase'
        },
        type: SyncType.None
      }
    });

    // 配置 Supabase 适配器
    rxdb.adapter(
      'supabase',
      async db =>
        new RxDBAdapterSupabase(db, {
          supabaseUrl: SUPABASE_URL,
          supabaseKey: SUPABASE_KEY
        })
    );

    rxdb.init();
    adapter = (await rxdb.getAdapter('supabase')) as RxDBAdapterSupabase;
    await adapter.connect();
    repository = adapter.getRepository(Todo) as unknown as SupabaseRepository<typeof Todo>;

    // 创建测试数据
    testTodo = new Todo();
    testTodo.title = 'do1';
    await repository.create(testTodo);
  });

  afterAll(async () => {
    // 清理测试数据
    if (testTodo && testTodo.id) {
      try {
        await repository.remove(testTodo);
      } catch {
        // 忽略清理错误
      }
    }
  });

  it('find by id 能查询到指定 Todo', async () => {
    const todos = await repository.find({
      where: {
        combinator: 'and',
        rules: [
          {
            field: 'id',
            operator: '=',
            value: testTodo.id
          }
        ]
      }
    });
    expect(todos.length).toBe(1);
    const todo = todos[0];
    expect(todo).toBeDefined();
    expect(todo.id).toEqual(testTodo.id);
    expect(todo.title).toEqual('do1');
  });

  it('find 能找到指定 Todo 否则抛异常', async () => {
    const todos = await repository.find({
      where: {
        combinator: 'and',
        rules: [
          {
            field: 'id',
            operator: '=',
            value: testTodo.id
          }
        ]
      }
    });
    if (todos.length === 0) {
      throw new Error('Todo not found');
    }
    expect(todos[0].id).toEqual(testTodo.id);
    expect(todos[0].title).toEqual('do1');
  });

  it('find 未找到数据时返回空数组', async () => {
    const todos = await repository.find({
      where: {
        combinator: 'and',
        rules: [
          {
            field: 'id',
            operator: '=',
            value: '591e97aa-f7e3-499c-9fa4-4e2ae4459ef6'
          }
        ]
      }
    });
    expect(todos.length).toBe(0);
  });

  it('find() 按 id 查询返回指定 Todo', async () => {
    const todoList = await repository.find({
      where: {
        combinator: 'and',
        rules: [
          {
            field: 'id',
            operator: '=',
            value: testTodo.id
          }
        ]
      }
    });
    const todo = todoList[0];
    expect(todoList.length).toEqual(1);
    expect(todo.id).toEqual(testTodo.id);
    expect(todo.title).toEqual('do1');
  });

  it('find(completed=false) 返回未完成 Todo', async () => {
    const todoList = await repository.find({
      where: {
        combinator: 'and',
        rules: [
          {
            field: 'completed',
            operator: '=',
            value: false
          }
        ]
      }
    });
    expect(todoList.length).toBeGreaterThanOrEqual(1);
    const todo = todoList.find(t => t.id === testTodo.id);
    expect(todo).toBeDefined();
    expect(todo!.id).toEqual(testTodo.id);
    expect(todo!.title).toEqual('do1');
  });

  it('find() 规则为空时返回全部 Todo', async () => {
    const todoList = await repository.find({
      where: {
        combinator: 'and',
        rules: []
      }
    });
    expect(todoList.length).toBeGreaterThanOrEqual(1);
    const found = todoList.some(todo => todo.id === testTodo.id);
    expect(found).toBe(true);
  });

  it('find 能返回匹配项', async () => {
    const todos = await repository.find({
      where: {
        combinator: 'and',
        rules: [
          {
            field: 'id',
            operator: '=',
            value: testTodo.id
          }
        ]
      }
    });
    expect(todos.length).toBeGreaterThan(0);
    const todo = todos[0];
    expect(todo).toBeDefined();
    expect(todo.id).toEqual(testTodo.id);
    expect(todo.title).toEqual('do1');
  });

  it('find 未命中时返回空数组', async () => {
    const todos = await repository.find({
      where: {
        combinator: 'and',
        rules: [
          {
            field: 'id',
            operator: '=',
            value: '591e97aa-f7e3-499c-9fa4-4e2ae4459ef6'
          }
        ]
      }
    });
    expect(todos.length).toBe(0);
  });

  it('findAll() 返回符合条件的 Todo', async () => {
    const todoList = await repository.find({
      where: {
        combinator: 'and',
        rules: [
          {
            field: 'id',
            operator: '=',
            value: testTodo.id
          }
        ]
      }
    });
    const todo = todoList[0];
    expect(todoList.length).toEqual(1);
    expect(todo.id).toEqual(testTodo.id);
    expect(todo.title).toEqual('do1');
  });

  it('create() 能创建新的 Todo 实体', async () => {
    const todo = new Todo();
    todo.title = 'Fanny';
    await repository.create(todo);
    expect(todo.id).toBeDefined();
    expect(todo.title).toEqual('Fanny');

    // 清理
    await repository.remove(todo);
  });

  it('update() 能更新已存在的 Todo', async () => {
    const originalTitle = testTodo.title;
    const newTitle = 'Jim';
    await repository.update(testTodo, { title: newTitle });

    // 验证更新成功
    const todos = await repository.find({
      where: {
        combinator: 'and',
        rules: [
          {
            field: 'id',
            operator: '=',
            value: testTodo.id
          }
        ]
      }
    });
    expect(todos[0].title).toEqual(newTitle);

    // 恢复原标题
    await repository.update(testTodo, { title: originalTitle });
  });
  it('count() 返回正确数量', async () => {
    const count = await repository.count({
      where: {
        combinator: 'and',
        rules: [
          {
            field: 'id',
            operator: '=',
            value: testTodo.id
          }
        ]
      }
    });
    expect(count).toEqual(1);
  });

  it('orderBy desc 实现 Todo 降序排序', async () => {
    // 创建有明确排序规则的测试数据
    const todoA = new Todo();
    todoA.title = 'A_sort_test';
    const todoZ = new Todo();
    todoZ.title = 'Z_sort_test';

    await repository.create(todoA);
    await repository.create(todoZ);

    const sortedTodos = await repository.find({
      where: {
        combinator: 'and',
        rules: [
          {
            field: 'title',
            operator: 'in',
            value: ['A_sort_test', 'Z_sort_test']
          }
        ]
      },
      orderBy: [
        {
          field: 'title',
          sort: 'desc'
        }
      ]
    });

    expect(sortedTodos.length).toBeGreaterThanOrEqual(2);
    expect(sortedTodos[0].title.localeCompare(sortedTodos[1].title) >= 0).toBe(true);

    // 清理
    await repository.remove(todoA);
    await repository.remove(todoZ);
  });

  it('orderBy asc 实现 Todo 升序排序', async () => {
    const todoA = new Todo();
    todoA.title = 'A_sort_test2';
    const todoZ = new Todo();
    todoZ.title = 'Z_sort_test2';

    await repository.create(todoA);
    await repository.create(todoZ);

    const sortedTodos = await repository.find({
      where: {
        combinator: 'and',
        rules: [
          {
            field: 'title',
            operator: 'in',
            value: ['A_sort_test2', 'Z_sort_test2']
          }
        ]
      },
      orderBy: [
        {
          field: 'title',
          sort: 'asc'
        }
      ]
    });

    expect(sortedTodos.length).toBeGreaterThanOrEqual(2);
    expect(sortedTodos[0].title.localeCompare(sortedTodos[1].title) <= 0).toBe(true);

    // 清理
    await repository.remove(todoA);
    await repository.remove(todoZ);
  });

  it('update() 能更新 completed 状态', async () => {
    const todo = new Todo();
    todo.title = 'Test completed status';
    todo.completed = false;
    await repository.create(todo);

    // 验证初始状态
    expect(todo.completed).toBe(false);

    // 更新状态
    await repository.update(todo, { completed: true });

    // 重新获取并验证更新后的状态
    const todos = await repository.find({
      where: {
        combinator: 'and',
        rules: [
          {
            field: 'id',
            operator: '=',
            value: todo.id
          }
        ]
      }
    });
    expect(todos[0].completed).toBe(true);

    // 清理
    await repository.remove(todo);
  });

  it('limit 和 offset 实现分页', async () => {
    // 创建测试数据
    const todos: Todo[] = [];
    for (let i = 0; i < 5; i++) {
      const todo = new Todo();
      todo.title = `page_test_${i}`;
      await repository.create(todo);
      todos.push(todo);
    }

    // 第一页
    const page1 = await repository.find({
      where: {
        combinator: 'and',
        rules: [
          {
            field: 'title',
            operator: 'startsWith',
            value: 'page_test_'
          }
        ]
      },
      orderBy: [{ field: 'title', sort: 'asc' }],
      limit: 2,
      offset: 0
    });

    expect(page1.length).toBe(2);

    // 第二页
    const page2 = await repository.find({
      where: {
        combinator: 'and',
        rules: [
          {
            field: 'title',
            operator: 'startsWith',
            value: 'page_test_'
          }
        ]
      },
      orderBy: [{ field: 'title', sort: 'asc' }],
      limit: 2,
      offset: 2
    });

    expect(page2.length).toBe(2);
    expect(page1[0].id).not.toEqual(page2[0].id);

    // 清理
    for (const todo of todos) {
      await repository.remove(todo);
    }
  });
});
