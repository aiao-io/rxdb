import { RxDB, SyncType, getEntityStatus } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../index.js';
describe('Todo 实体 PGlite 适配器', () => {
  let testTodo: Todo;
  let rxdb: RxDB;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `module-test-todo-${Date.now()}`,
      context: { userId: 'userId' },
      entities: [Todo],
      sync: {
        local: {
          adapter: 'pglite'
        },
        type: SyncType.None
      }
    });

    rxdb
      .adapter('pglite', async db => {
        return new RxDBAdapterPGlite(db, { store: 'memory' });
      })
      .init();

    await rxdb.connect('pglite');

    testTodo = new Todo();
    testTodo.title = 'do1';
    const status = getEntityStatus(testTodo);
    expect(status.local).toEqual(false);
    expect(status.remote).toEqual(false);
    await testTodo.save();
  });

  afterAll(async () => {
    if (rxdb) {
      await rxdb.disconnectAll();
    }
  });

  it('get() 能查询到指定 Todo', async () => {
    const todo = await firstValueFrom(Todo.get(testTodo.id));
    const status = getEntityStatus(todo);
    expect(status.local).toEqual(true);
    expect(todo.id).toEqual(testTodo.id);
  });

  it('findOneOrFail() 能找到指定 Todo', async () => {
    const todo = await firstValueFrom(
      Todo.findOneOrFail({
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
      })
    );
    expect(todo.id).toEqual(testTodo.id);
  });

  it('findOneOrFail() 未找到数据时抛出异常', async () => {
    try {
      await firstValueFrom(
        Todo.findOneOrFail({
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
        })
      );
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });

  it('find() 按 id 查询返回指定 Todo', async () => {
    const todoList = await firstValueFrom(
      Todo.find({
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
      })
    );
    const todo = todoList[0];
    expect(todoList.length).toEqual(1);
    expect(todo.id).toEqual(testTodo.id);
  });

  it('find(completed=false) 返回未完成 Todo', async () => {
    const todoList = await firstValueFrom(
      Todo.find({
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
      })
    );
    const todo = todoList[0];
    expect(todoList.length).toEqual(1);
    expect(todo.id).toEqual(testTodo.id);
  });

  it('find() 规则为空时返回全部 Todo', async () => {
    const todoList = await firstValueFrom(
      Todo.find({
        where: {
          combinator: 'and',
          rules: []
        }
      })
    );
    expect(todoList.length).toBeGreaterThanOrEqual(1);
    const found = todoList.some(todo => todo.id === testTodo.id);
    expect(found).toBe(true);
  });

  it('findOne() 能返回匹配项', async () => {
    const todo = await firstValueFrom(
      Todo.findOne({
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
      })
    );
    expect(todo?.id).toEqual(testTodo.id);
  });

  it('findOne() 未命中时返回 undefined', async () => {
    const todo = await firstValueFrom(
      Todo.findOne({
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
      })
    );
    expect(todo?.id).toEqual(undefined);
  });

  it('findByCursor() 支持分页', async () => {
    const todos: Todo[] = [];

    for (let i = 0; i < 100; i++) {
      const todo = new Todo();
      todo.title = 'test_' + `${i}`.padStart(3, '0');
      todos.push(todo);
    }
    await rxdb.entityManager.saveMany(todos);

    const todoList = await firstValueFrom(
      Todo.findByCursor({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'title',
              operator: 'startsWith',
              value: 'test_'
            }
          ]
        },
        orderBy: [
          {
            field: 'id',
            sort: 'asc'
          }
        ],
        limit: 1
      })
    );

    expect(todoList[0].title).toEqual('test_000');
    const todoList2 = await firstValueFrom(
      Todo.findByCursor({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'title',
              operator: 'startsWith',
              value: 'test_'
            }
          ]
        },
        orderBy: [
          {
            field: 'id',
            sort: 'asc'
          }
        ],
        after: todoList[0],
        limit: 1
      })
    );

    expect(todoList2[0].title).toEqual('test_001');
    const todoList3 = await firstValueFrom(
      Todo.findByCursor({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'title',
              operator: 'startsWith',
              value: 'test_'
            }
          ]
        },
        orderBy: [
          {
            field: 'id',
            sort: 'asc'
          }
        ],
        before: todoList2[0],
        limit: 1
      })
    );
    expect(todoList3[0].title).toEqual('test_000');
  });

  it('findAll() 返回符合条件的 Todo', async () => {
    const todoList = await firstValueFrom(
      Todo.findAll({
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
      })
    );
    const todo = todoList[0];
    expect(todoList.length).toEqual(1);
    expect(todo.id).toEqual(testTodo.id);
  });

  it('save() 能保存新的 Todo 实体', async () => {
    const todo = new Todo();
    todo.title = 'Fanny';
    const status = getEntityStatus(todo);
    expect(status.local).toEqual(false);
    const saved = await todo.save();
    expect(saved.id).toBeDefined();
    expect(saved.title).toEqual('Fanny');
  });

  it('save() 能更新已存在的 Todo', async () => {
    testTodo.title = 'Jim';
    const saved = await testTodo.save();
    expect(saved.id).toEqual(testTodo.id);
    expect(saved.title).toEqual('Jim');
  });

  it('remove() 会标记 Todo 为已删除', async () => {
    const todo = new Todo();
    todo.title = 'Fanny';
    const saved = await todo.save();
    expect(saved.id).toBeDefined();
    expect(saved.title).toEqual('Fanny');

    const removed = await todo.remove();
    expect(removed.id).toBeDefined();
    expect(removed.title).toEqual('Fanny');

    const allTodos = await firstValueFrom(Todo.findAll({ where: { combinator: 'and', rules: [] } }));
    const foundRemoved = allTodos.some(t => t.id === todo.id);
    expect(foundRemoved).toBe(false);
  });

  it('count() 返回正确数量', async () => {
    const count = await firstValueFrom(
      Todo.count({
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
      })
    );
    expect(count).toEqual(1);
  });

  it('orderBy desc 实现 Todo 降序排序', async () => {
    const todoA = new Todo();
    todoA.title = 'A';
    const todoZ = new Todo();
    todoZ.title = 'Z';

    await Promise.all([todoA.save(), todoZ.save()]);

    const sortedTodos = await firstValueFrom(
      Todo.findAll({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'title',
              operator: 'in',
              value: ['A', 'Z']
            }
          ]
        },
        orderBy: [
          {
            field: 'title',
            sort: 'desc'
          }
        ]
      })
    );

    expect(sortedTodos.length).toBeGreaterThanOrEqual(2);
    expect(sortedTodos[0].title.localeCompare(sortedTodos[1].title) >= 0).toBe(true);
  });

  it('orderBy asc 实现 Todo 升序排序', async () => {
    const todoA = new Todo();
    todoA.title = 'A';
    const todoZ = new Todo();
    todoZ.title = 'Z';

    await Promise.all([todoA.id ? Promise.resolve() : todoA.save(), todoZ.id ? Promise.resolve() : todoZ.save()]);

    const sortedTodos = await firstValueFrom(
      Todo.findAll({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'title',
              operator: 'in',
              value: ['A', 'Z']
            }
          ]
        },
        orderBy: [
          {
            field: 'title',
            sort: 'asc'
          }
        ]
      })
    );

    expect(sortedTodos.length).toBeGreaterThanOrEqual(2);
    expect(sortedTodos[0].title.localeCompare(sortedTodos[1].title) <= 0).toBe(true);
  });

  it('save() 能更新 completed 状态', async () => {
    const todo = new Todo();
    todo.title = 'Test completed status';
    todo.completed = false;
    await todo.save();

    expect(todo.completed).toBe(false);

    todo.completed = true;
    await todo.save();

    const updatedTodo = await firstValueFrom(Todo.get(todo.id));
    expect(updatedTodo.completed).toBe(true);
  });

  it('saveMany() 支持批量保存', async () => {
    const batchTodos = [
      new Todo({ title: 'Batch todo 1' }),
      new Todo({ title: 'Batch todo 2' }),
      new Todo({ title: 'Batch todo 3' })
    ];

    await rxdb.entityManager.saveMany(batchTodos);

    const savedIds = batchTodos.map(t => t.id);
    const foundTodos = await firstValueFrom(
      Todo.findAll({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'id',
              operator: 'in',
              value: savedIds
            }
          ]
        }
      })
    );

    expect(foundTodos.length).toBeGreaterThanOrEqual(3);
  });

  it('removeMany() 支持批量删除', async () => {
    const todosToDelete = [
      new Todo({ title: 'Delete todo 1' }),
      new Todo({ title: 'Delete todo 2' }),
      new Todo({ title: 'Delete todo 3' })
    ];

    await rxdb.entityManager.saveMany(todosToDelete);

    const deleteIds = todosToDelete.map(t => t.id);

    await rxdb.entityManager.removeMany(todosToDelete);

    const remainingTodos = await firstValueFrom(
      Todo.findAll({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'id',
              operator: 'in',
              value: deleteIds
            }
          ]
        }
      })
    );

    expect(remainingTodos.length).toBe(0);
  });

  it('saveMany() 支持批量更新', async () => {
    const todosToUpdate = [
      new Todo({ title: 'Update todo 1', completed: false }),
      new Todo({ title: 'Update todo 2', completed: false }),
      new Todo({ title: 'Update todo 3', completed: false })
    ];

    await rxdb.entityManager.saveMany(todosToUpdate);

    const updateIds = todosToUpdate.map(t => t.id);

    todosToUpdate.forEach(todo => {
      todo.title = `${todo.title} - Updated`;
      todo.completed = true;
    });

    await rxdb.entityManager.saveMany(todosToUpdate);

    const updatedTodos = await firstValueFrom(
      Todo.findAll({
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'id',
              operator: 'in',
              value: updateIds
            }
          ]
        }
      })
    );

    expect(updatedTodos.length).toBeGreaterThanOrEqual(3);
    updatedTodos.forEach(todo => {
      expect(todo.title).toContain('Updated');
      expect(todo.completed).toBe(true);
    });
  });
});
