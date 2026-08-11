import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../index.js';
import { cleanup_db, generateDbName } from './test-utils.js';

describe('findByCursor 增量算法测试', () => {
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
    db.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    rxdb = db;
    adapter = await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');
  });

  afterEach(async () => await cleanup_db(adapter));

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  it('场景1: after 游标 + 创建新实体 - 新实体应该出现在结果集中', async () => {
    const initialTodos: Todo[] = [];
    for (let i = 0; i < 5; i++) {
      const todo = new Todo();
      todo.title = `cursor_test_1_${i.toString().padStart(2, '0')}`;
      initialTodos.push(todo);
    }
    await rxdb.entityManager.saveMany(initialTodos);

    await new Promise(resolve => setTimeout(resolve, 100));

    let index = 0;
    const actions = [
      {
        validate: (todos: Todo[]) => {
          expect(todos.length).toBe(3);
          expect(todos.map(t => t.title)).toEqual(['cursor_test_1_02', 'cursor_test_1_03', 'cursor_test_1_04']);
        },
        run: async () => {
          const newTodo = new Todo();
          newTodo.title = 'cursor_test_1_02_5';
          await newTodo.save();
        }
      },
      {
        validate: (todos: Todo[]) => {
          expect(todos.length).toBe(4);
          expect(todos.map(t => t.title)).toEqual([
            'cursor_test_1_02',
            'cursor_test_1_02_5',
            'cursor_test_1_03',
            'cursor_test_1_04'
          ]);
        }
      }
    ];

    return new Promise<void>((resolve, reject) => {
      const subscription = Todo.findByCursor({
        where: {
          combinator: 'and',
          rules: [{ field: 'title', operator: 'startsWith', value: 'cursor_test_1_' }]
        },
        orderBy: [
          { field: 'title', sort: 'asc' },
          { field: 'id', sort: 'asc' }
        ],
        after: initialTodos[1],
        limit: 10
      }).subscribe({
        next: todos => {
          try {
            const action = actions[index];
            action.validate(todos);
            if (action.run) {
              action.run().catch(reject);
            }
            index++;
            if (index >= actions.length) {
              subscription.unsubscribe();
              setTimeout(resolve, 50);
            }
          } catch (error) {
            subscription.unsubscribe();
            reject(error);
          }
        },
        error: err => {
          subscription.unsubscribe();
          reject(err);
        }
      });
    });
  });

  it('场景2: before 游标 + 创建新实体 - 新实体应该出现在结果集中', { timeout: 10000 }, async () => {
    const initialTodos: Todo[] = [];
    for (let i = 0; i < 5; i++) {
      const todo = new Todo();
      todo.title = `cursor_test_2_${i.toString().padStart(2, '0')}`;
      initialTodos.push(todo);
    }
    await rxdb.entityManager.saveMany(initialTodos);

    await new Promise(resolve => setTimeout(resolve, 100));

    let index = 0;
    const actions = [
      {
        validate: (todos: Todo[]) => {
          expect(todos.length).toBe(3);
          expect(todos.map(t => t.title)).toEqual(['cursor_test_2_00', 'cursor_test_2_01', 'cursor_test_2_02']);
        },
        run: async () => {
          const newTodo = new Todo();
          newTodo.title = 'cursor_test_2_01_5';
          await newTodo.save();
        }
      },
      {
        validate: (todos: Todo[]) => {
          expect(todos.length).toBe(4);
          expect(todos.map(t => t.title)).toEqual([
            'cursor_test_2_00',
            'cursor_test_2_01',
            'cursor_test_2_01_5',
            'cursor_test_2_02'
          ]);
        }
      }
    ];

    return new Promise<void>((resolve, reject) => {
      const subscription = Todo.findByCursor({
        where: {
          combinator: 'and',
          rules: [{ field: 'title', operator: 'startsWith', value: 'cursor_test_2_' }]
        },
        orderBy: [
          { field: 'title', sort: 'asc' },
          { field: 'id', sort: 'asc' }
        ],
        before: initialTodos[3],
        limit: 10
      }).subscribe({
        next: todos => {
          try {
            const action = actions[index];
            action.validate(todos);
            if (action.run) {
              action.run().catch(reject);
            }
            index++;
            if (index >= actions.length) {
              subscription.unsubscribe();
              setTimeout(resolve, 50);
            }
          } catch (error) {
            subscription.unsubscribe();
            reject(error);
          }
        },
        error: err => {
          subscription.unsubscribe();
          reject(err);
        }
      });
    });
  });

  it('场景3: 无游标 + 创建新实体 - 新实体应该按排序插入', async () => {
    const initialTodos: Todo[] = [];
    for (let i = 0; i < 3; i++) {
      const todo = new Todo();
      todo.title = `cursor_test_3_${i.toString().padStart(2, '0')}`;
      initialTodos.push(todo);
    }
    await rxdb.entityManager.saveMany(initialTodos);

    await new Promise(resolve => setTimeout(resolve, 100));

    let index = 0;
    const actions = [
      {
        validate: (todos: Todo[]) => {
          expect(todos.length).toBe(3);
        },
        run: async () => {
          const newTodo = new Todo();
          newTodo.title = 'cursor_test_3_01_5';
          await newTodo.save();
        }
      },
      {
        validate: (todos: Todo[]) => {
          expect(todos.length).toBe(4);
          expect(todos.map(t => t.title)).toEqual([
            'cursor_test_3_00',
            'cursor_test_3_01',
            'cursor_test_3_01_5',
            'cursor_test_3_02'
          ]);
        }
      }
    ];

    return new Promise<void>((resolve, reject) => {
      const subscription = Todo.findByCursor({
        where: {
          combinator: 'and',
          rules: [{ field: 'title', operator: 'startsWith', value: 'cursor_test_3_' }]
        },
        orderBy: [
          { field: 'title', sort: 'asc' },
          { field: 'id', sort: 'asc' }
        ],
        limit: 10
      }).subscribe({
        next: todos => {
          try {
            const action = actions[index];
            action.validate(todos);
            if (action.run) {
              action.run().catch(reject);
            }
            index++;
            if (index >= actions.length) {
              subscription.unsubscribe();
              setTimeout(resolve, 50);
            }
          } catch (error) {
            subscription.unsubscribe();
            reject(error);
          }
        },
        error: err => {
          subscription.unsubscribe();
          reject(err);
        }
      });
    });
  });

  it('场景4: 创建不匹配 where 条件的实体 - 不应该出现在结果中', async () => {
    const initialTodos: Todo[] = [];
    for (let i = 0; i < 3; i++) {
      const todo = new Todo();
      todo.title = `cursor_test_4_${i.toString().padStart(2, '0')}`;
      initialTodos.push(todo);
    }
    await rxdb.entityManager.saveMany(initialTodos);

    await new Promise(resolve => setTimeout(resolve, 100));

    let callCount = 0;

    return new Promise<void>((resolve, reject) => {
      const subscription = Todo.findByCursor({
        where: {
          combinator: 'and',
          rules: [{ field: 'title', operator: 'startsWith', value: 'cursor_test_4_' }]
        },
        orderBy: [
          { field: 'title', sort: 'asc' },
          { field: 'id', sort: 'asc' }
        ],
        limit: 10
      }).subscribe({
        next: todos => {
          try {
            callCount++;
            expect(todos.length).toBe(3);
            expect(todos.map(t => t.title)).toEqual(['cursor_test_4_00', 'cursor_test_4_01', 'cursor_test_4_02']);

            if (callCount === 1) {
              const newTodo = new Todo();
              newTodo.title = 'other_prefix_01';
              newTodo.save().catch(reject);
              setTimeout(() => {
                subscription.unsubscribe();
                expect(callCount).toBe(1);
                resolve();
              }, 300);
            }
          } catch (error) {
            subscription.unsubscribe();
            reject(error);
          }
        },
        error: err => {
          subscription.unsubscribe();
          reject(err);
        }
      });
    });
  });

  it('场景5: 批量创建多个实体 - 应该全部正确插入', async () => {
    const initialTodos: Todo[] = [];
    for (let i = 0; i < 3; i++) {
      const todo = new Todo();
      todo.title = `cursor_test_5_${(i * 10).toString().padStart(2, '0')}`;
      initialTodos.push(todo);
    }
    await rxdb.entityManager.saveMany(initialTodos);

    await new Promise(resolve => setTimeout(resolve, 100));

    let index = 0;
    const actions = [
      {
        validate: (todos: Todo[]) => {
          expect(todos.length).toBe(3);
        },
        run: async () => {
          const newTodos: Todo[] = [];
          for (const num of [5, 15, 25]) {
            const todo = new Todo();
            todo.title = `cursor_test_5_${num.toString().padStart(2, '0')}`;
            newTodos.push(todo);
          }
          await rxdb.entityManager.saveMany(newTodos);
        }
      },
      {
        validate: (todos: Todo[]) => {
          expect(todos.length).toBe(6);
          expect(todos.map(t => t.title)).toEqual([
            'cursor_test_5_00',
            'cursor_test_5_05',
            'cursor_test_5_10',
            'cursor_test_5_15',
            'cursor_test_5_20',
            'cursor_test_5_25'
          ]);
        }
      }
    ];

    return new Promise<void>((resolve, reject) => {
      const subscription = Todo.findByCursor({
        where: {
          combinator: 'and',
          rules: [{ field: 'title', operator: 'startsWith', value: 'cursor_test_5_' }]
        },
        orderBy: [
          { field: 'title', sort: 'asc' },
          { field: 'id', sort: 'asc' }
        ],
        limit: 20
      }).subscribe({
        next: todos => {
          try {
            const action = actions[index];
            action.validate(todos);
            if (action.run) {
              action.run().catch(reject);
            }
            index++;
            if (index >= actions.length) {
              subscription.unsubscribe();
              setTimeout(resolve, 50);
            }
          } catch (error) {
            subscription.unsubscribe();
            reject(error);
          }
        },
        error: err => {
          subscription.unsubscribe();
          reject(err);
        }
      });
    });
  });

  it('场景6: after 游标外的新实体 - 不应该出现在结果中', async () => {
    const initialTodos: Todo[] = [];
    for (let i = 0; i < 5; i++) {
      const todo = new Todo();
      todo.title = `cursor_test_6_${i.toString().padStart(2, '0')}`;
      initialTodos.push(todo);
    }
    await rxdb.entityManager.saveMany(initialTodos);

    await new Promise(resolve => setTimeout(resolve, 100));

    let callCount = 0;

    return new Promise<void>((resolve, reject) => {
      const subscription = Todo.findByCursor({
        where: {
          combinator: 'and',
          rules: [{ field: 'title', operator: 'startsWith', value: 'cursor_test_6_' }]
        },
        orderBy: [
          { field: 'title', sort: 'asc' },
          { field: 'id', sort: 'asc' }
        ],
        after: initialTodos[2],
        limit: 2
      }).subscribe({
        next: todos => {
          try {
            callCount++;
            expect(todos.length).toBe(2);
            expect(todos.map(t => t.title)).toEqual(['cursor_test_6_03', 'cursor_test_6_04']);
            expect(todos.some(t => t.title === 'cursor_test_6_01_5')).toBe(false);

            if (callCount === 1) {
              const newTodo = new Todo();
              newTodo.title = 'cursor_test_6_01_5';
              newTodo.save().catch(reject);
              setTimeout(() => {
                subscription.unsubscribe();
                expect(callCount).toBe(1);
                resolve();
              }, 300);
            }
          } catch (error) {
            subscription.unsubscribe();
            reject(error);
          }
        },
        error: err => {
          subscription.unsubscribe();
          reject(err);
        }
      });
    });
  });

  it('场景7: 降序排序 + after 游标 + 创建新实体', { timeout: 1000 }, async () => {
    const initialTodos: Todo[] = [];
    for (let i = 0; i < 5; i++) {
      const todo = new Todo();
      todo.title = `cursor_test_7_${i.toString().padStart(2, '0')}`;
      initialTodos.push(todo);
    }
    await rxdb.entityManager.saveMany(initialTodos);

    await new Promise(resolve => setTimeout(resolve, 100));

    let index = 0;
    const actions = [
      {
        validate: (todos: Todo[]) => {
          expect(todos.length).toBe(3);
          expect(todos.map(t => t.title)).toEqual(['cursor_test_7_02', 'cursor_test_7_01', 'cursor_test_7_00']);
        },
        run: async () => {
          const newTodo = new Todo();
          newTodo.title = 'cursor_test_7_01_5';
          await newTodo.save();
        }
      },
      {
        validate: (todos: Todo[]) => {
          expect(todos.length).toBe(4);
          expect(todos.map(t => t.title)).toEqual([
            'cursor_test_7_02',
            'cursor_test_7_01_5',
            'cursor_test_7_01',
            'cursor_test_7_00'
          ]);
        }
      }
    ];

    return new Promise<void>((resolve, reject) => {
      const subscription = Todo.findByCursor({
        where: {
          combinator: 'and',
          rules: [{ field: 'title', operator: 'startsWith', value: 'cursor_test_7_' }]
        },
        orderBy: [
          { field: 'title', sort: 'desc' },
          { field: 'id', sort: 'desc' }
        ],
        after: initialTodos[3],
        limit: 10
      }).subscribe({
        next: todos => {
          try {
            const action = actions[index];
            action.validate(todos);
            if (action.run) {
              action.run().catch(reject);
            }
            index++;
            if (index >= actions.length) {
              subscription.unsubscribe();
              setTimeout(resolve, 50);
            }
          } catch (error) {
            subscription.unsubscribe();
            reject(error);
          }
        },
        error: err => {
          subscription.unsubscribe();
          reject(err);
        }
      });
    });
  });

  it('调试1: 降序排序 - 验证基础排序是否正确', async () => {
    const todos: Todo[] = [];
    for (let i = 0; i < 5; i++) {
      const todo = new Todo();
      todo.title = `debug_desc_${i.toString().padStart(2, '0')}`;
      todos.push(todo);
    }
    await rxdb.entityManager.saveMany(todos);
    await new Promise(resolve => setTimeout(resolve, 100));

    return new Promise<void>((resolve, reject) => {
      const subscription = Todo.findByCursor({
        where: {
          combinator: 'and',
          rules: [{ field: 'title', operator: 'startsWith', value: 'debug_desc_' }]
        },
        orderBy: [
          { field: 'title', sort: 'desc' },
          { field: 'id', sort: 'desc' }
        ],
        limit: 10
      }).subscribe({
        next: result => {
          subscription.unsubscribe();
          try {
            expect(result.map(t => t.title)).toEqual([
              'debug_desc_04',
              'debug_desc_03',
              'debug_desc_02',
              'debug_desc_01',
              'debug_desc_00'
            ]);
            resolve();
          } catch (error) {
            reject(error);
          }
        },
        error: reject
      });
    });
  });

  it('调试2: 降序 + after 游标 - 验证游标是否正确定位', async () => {
    const todos: Todo[] = [];
    for (let i = 0; i < 5; i++) {
      const todo = new Todo();
      todo.title = `debug_after_${i.toString().padStart(2, '0')}`;
      todos.push(todo);
    }
    await rxdb.entityManager.saveMany(todos);
    await new Promise(resolve => setTimeout(resolve, 100));

    return new Promise<void>((resolve, reject) => {
      const subscription = Todo.findByCursor({
        where: {
          combinator: 'and',
          rules: [{ field: 'title', operator: 'startsWith', value: 'debug_after_' }]
        },
        orderBy: [
          { field: 'title', sort: 'desc' },
          { field: 'id', sort: 'desc' }
        ],
        after: todos[3],
        limit: 10
      }).subscribe({
        next: result => {
          subscription.unsubscribe();
          try {
            expect(result.map(t => t.title)).toEqual(['debug_after_02', 'debug_after_01', 'debug_after_00']);
            resolve();
          } catch (error) {
            reject(error);
          }
        },
        error: reject
      });
    });
  });

  it('调试3: 降序 + after 游标 - 创建新实体(不在订阅中)', async () => {
    const todos: Todo[] = [];
    for (let i = 0; i < 5; i++) {
      const todo = new Todo();
      todo.title = `debug_create_${i.toString().padStart(2, '0')}`;
      todos.push(todo);
    }
    await rxdb.entityManager.saveMany(todos);
    await new Promise(resolve => setTimeout(resolve, 100));

    const newTodo = new Todo();
    newTodo.title = 'debug_create_01_5';
    await newTodo.save();
    await new Promise(resolve => setTimeout(resolve, 100));

    return new Promise<void>((resolve, reject) => {
      const subscription = Todo.findByCursor({
        where: {
          combinator: 'and',
          rules: [{ field: 'title', operator: 'startsWith', value: 'debug_create_' }]
        },
        orderBy: [
          { field: 'title', sort: 'desc' },
          { field: 'id', sort: 'desc' }
        ],
        after: todos[3],
        limit: 10
      }).subscribe({
        next: result => {
          subscription.unsubscribe();
          try {
            expect(result.map(t => t.title)).toEqual([
              'debug_create_02',
              'debug_create_01_5',
              'debug_create_01',
              'debug_create_00'
            ]);
            resolve();
          } catch (error) {
            reject(error);
          }
        },
        error: reject
      });
    });
  });

  it('调试4: 降序 + after 游标 + 订阅中创建新实体 - 单次回调', { timeout: 2000 }, async () => {
    const todos: Todo[] = [];
    for (let i = 0; i < 5; i++) {
      const todo = new Todo();
      todo.title = `debug_reactive_${i.toString().padStart(2, '0')}`;
      todos.push(todo);
    }
    await rxdb.entityManager.saveMany(todos);
    await new Promise(resolve => setTimeout(resolve, 100));

    let callCount = 0;
    const receivedResults: string[][] = [];

    return new Promise<void>((resolve, reject) => {
      const subscription = Todo.findByCursor({
        where: {
          combinator: 'and',
          rules: [{ field: 'title', operator: 'startsWith', value: 'debug_reactive_' }]
        },
        orderBy: [
          { field: 'title', sort: 'desc' },
          { field: 'id', sort: 'desc' }
        ],
        after: todos[3],
        limit: 10
      }).subscribe({
        next: result => {
          callCount++;
          const titles = result.map(t => t.title);
          receivedResults.push(titles);

          if (callCount === 1) {
            try {
              expect(titles).toEqual(['debug_reactive_02', 'debug_reactive_01', 'debug_reactive_00']);
            } catch (error) {
              subscription.unsubscribe();
              reject(error);
              return;
            }

            const newTodo = new Todo();
            newTodo.title = 'debug_reactive_01_5';
            newTodo.save().catch(reject);
          } else if (callCount === 2) {
            subscription.unsubscribe();
            try {
              expect(titles).toEqual([
                'debug_reactive_02',
                'debug_reactive_01_5',
                'debug_reactive_01',
                'debug_reactive_00'
              ]);
              resolve();
            } catch (error) {
              reject(error);
            }
          } else {
            subscription.unsubscribe();
            reject(new Error(`意外的第${callCount}次回调`));
          }
        },
        error: err => {
          subscription.unsubscribe();
          reject(err);
        }
      });

      setTimeout(() => {
        subscription.unsubscribe();
        reject(new Error(`超时: 只收到${callCount}次回调, 期望2次。结果: ${JSON.stringify(receivedResults)}`));
      }, 1500);
    });
  });
});
