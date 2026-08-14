import { Entity, EntityBase, getEntityMetadata, getEntityStatus, PropertyType, RelationKind, uuid } from '@aiao/rxdb';
import { Todo, TypeDemo } from '@aiao/rxdb-test/entities';
import {
  Attribute,
  AttributeValue,
  Category,
  ENTITIES,
  IdCard,
  Order,
  OrderItem,
  Product,
  SKU,
  SKUAttributes,
  User
} from '@aiao/rxdb-test/shop';
import { firstValueFrom } from 'rxjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  create_table_sql,
  getEntityObjectFromResult,
  normalizeCreateEntity,
  normalizeUpdateEntity,
  transformEntityValueToSql
} from '../index.js';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { AdapterFactory } from './adapter-factory.js';
import { cleanup_db } from './test-utils.js';

// -- columnName 测试实体定义 --

@Entity({
  name: 'CnDepartment',
  properties: [
    { name: 'deptName', type: PropertyType.string, columnName: 'dept_name' },
    { name: 'deptCode', type: PropertyType.string, columnName: 'dept_code', unique: true }
  ]
})
class CnDepartment extends EntityBase {
  deptName!: string;
  deptCode!: string;
}

@Entity({
  name: 'CnEmployee',
  properties: [
    { name: 'firstName', type: PropertyType.string, columnName: 'first_name' },
    { name: 'lastName', type: PropertyType.string, columnName: 'last_name' },
    { name: 'hireDate', type: PropertyType.date, columnName: 'hire_date' },
    { name: 'isActive', type: PropertyType.boolean, columnName: 'is_active', default: true },
    { name: 'salary', type: PropertyType.number, columnName: 'base_salary' },
    { name: 'level', type: PropertyType.integer, columnName: 'job_level', default: 1 }
  ],
  relations: [
    {
      name: 'department',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'CnDepartment',
      mappedProperty: 'employees',
      columnName: 'dept_id'
    }
  ]
})
class CnEmployee extends EntityBase {
  firstName!: string;
  lastName!: string;
  hireDate!: Date;
  isActive!: boolean;
  salary!: number;
  level!: number;
  departmentId!: string;
}

@Entity({
  name: 'CnProfile',
  properties: [{ name: 'bio', type: PropertyType.string, columnName: 'biography' }],
  relations: [
    {
      name: 'employee',
      kind: RelationKind.ONE_TO_ONE,
      mappedEntity: 'CnEmployee',
      mappedProperty: 'profile',
      columnName: 'emp_id'
    }
  ]
})
class CnProfile extends EntityBase {
  bio!: string;
  employeeId!: string;
}

// -- enum 枚举类型 --

enum TypeDemoEnum {
  Active = 'active',
  Inactive = 'inactive',
  Pending = 'pending'
}

/** Todo 实体 CRUD 集成测试：create/update/delete 及查询缓存行为。 */
export function crudIntegrationSuite(factory: AdapterFactory) {
  // ========== test-todo.spec.ts ==========
  describe(`Todo 实体 CRUD [${factory.name}]`, () => {
    let testTodo: Todo;
    let adapter: RxDBAdapterSqliteBase;

    beforeAll(async () => {
      adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });

      testTodo = new Todo();
      testTodo.title = 'do1';
      const status = getEntityStatus(testTodo);
      expect(status.local).toEqual(false);
      expect(status.remote).toEqual(false);
      await testTodo.save();
    });

    afterAll(async () => {
      if (adapter) {
        await adapter.rxdb.disconnectAll();
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
      await adapter.rxdb.entityManager.saveMany(todos);

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

      await adapter.rxdb.entityManager.saveMany(batchTodos);

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

    it('saveMany() 在超过 SQLite 变量上限时会自动分批', async () => {
      const batchTodos = Array.from(
        { length: 160 },
        (_, index) =>
          new Todo({
            title: `Chunked todo ${index}`,
            completed: index % 2 === 0
          })
      );

      await adapter.rxdb.entityManager.saveMany(batchTodos);

      const savedIds = batchTodos.map(todo => todo.id);
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

      expect(foundTodos.length).toBeGreaterThanOrEqual(batchTodos.length);
    });

    it('removeMany() 支持批量删除', async () => {
      const todosToDelete = [
        new Todo({ title: 'Delete todo 1' }),
        new Todo({ title: 'Delete todo 2' }),
        new Todo({ title: 'Delete todo 3' })
      ];

      await adapter.rxdb.entityManager.saveMany(todosToDelete);

      const deleteIds = todosToDelete.map(t => t.id);

      await adapter.rxdb.entityManager.removeMany(todosToDelete);

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

      await adapter.rxdb.entityManager.saveMany(todosToUpdate);

      const updateIds = todosToUpdate.map(t => t.id);

      todosToUpdate.forEach(todo => {
        todo.title = `${todo.title} - Updated`;
        todo.completed = true;
      });

      await adapter.rxdb.entityManager.saveMany(todosToUpdate);

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

  // ========== test-shop.spec.ts ==========
  describe(`Shop 实体 CRUD [${factory.name}]`, () => {
    let adapter: RxDBAdapterSqliteBase;

    beforeAll(async () => {
      adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [...ENTITIES] });
    });

    afterAll(async () => {
      if (adapter) {
        await adapter.rxdb.disconnectAll();
      }
    });

    describe('一对一关系查询', () => {
      let user: User;

      beforeAll(async () => {
        user = new User();
        user.name = 'Jimmy';
        const idCard = new IdCard();
        idCard.code = '111';
        idCard.owner$.set(user);
        user.idCard$.set(idCard);
        await user.save();
      });

      it('count() 统计绑定身份证的用户', async () => {
        const count = await firstValueFrom(
          User.count({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'idCard.code',
                  operator: '=',
                  value: '111'
                }
              ]
            }
          })
        );
        expect(count).toEqual(1);
      });

      it('find() 查询关联身份证的用户', async () => {
        const findUser = await firstValueFrom(
          User.find({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'idCard.code',
                  operator: '=',
                  value: '111'
                }
              ]
            }
          })
        );
        expect(findUser.length).toBeGreaterThan(0);
        const foundUser = findUser[0];
        expect(foundUser.id).toEqual(user.id);
      });

      it('findAll() 查询所有关联身份证的用户', async () => {
        const findUser = await firstValueFrom(
          User.findAll({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'idCard.code',
                  operator: '=',
                  value: '111'
                }
              ]
            }
          })
        );
        expect(findUser[0]).toEqual(user);
      });

      it('findOne() 查询单个关联身份证的用户', async () => {
        const findUser = await firstValueFrom(
          User.findOne({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'idCard.code',
                  operator: '=',
                  value: '111'
                }
              ]
            }
          })
        );
        if (!findUser) throw new Error('Expected to find the user by idCard.code');
        expect(findUser.id).toEqual(user.id);
      });

      it('findOneOrFail() 查询关联身份证的用户', async () => {
        const findUser = await firstValueFrom(
          User.findOneOrFail({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'idCard.code',
                  operator: '=',
                  value: '111'
                }
              ]
            }
          })
        );
        expect(findUser).toEqual(user);
      });

      it('查询身份证号码为空的用户', async () => {
        const userWithoutIdCard = new User();
        userWithoutIdCard.name = 'NoIdCard';
        await userWithoutIdCard.save();

        const findUser = await firstValueFrom(
          User.find({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'name',
                  operator: '=',
                  value: 'NoIdCard'
                }
              ]
            }
          })
        );
        expect(findUser.length).toBeGreaterThan(0);
        expect(findUser.some(u => u.name === 'NoIdCard')).toBe(true);
      });

      it('find() 支持 contains 模糊匹配', async () => {
        const findUser = await firstValueFrom(
          User.find({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'idCard.code',
                  operator: 'contains',
                  value: '11'
                }
              ]
            }
          })
        );
        expect(findUser.length).toBeGreaterThan(0);
        expect(findUser.some(u => u.name === 'Jimmy')).toBe(true);
      });
    });

    describe('一对多关系查询', () => {
      let order1: Order;
      let order2: Order;
      let user: User;
      beforeAll(async () => {
        user = new User();
        user.name = 'Jimmy';
        order1 = new Order();
        order1.number = '111';
        order1.amount = 111;
        order1.owner$.set(user);

        order2 = new Order();
        order2.number = '222';
        order2.amount = 222;
        order2.owner$.set(user);

        await order1.save();
        await order2.save();
      });

      it('find() 查询拥有指定订单的用户', async () => {
        const findUser = await firstValueFrom(
          User.find({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'orders.number',
                  operator: '=',
                  value: '111'
                }
              ]
            }
          })
        );
        expect(findUser[0]).toEqual(user);
      });

      it('find() 支持 orders.number in 多值匹配', async () => {
        const findUser = await firstValueFrom(
          User.find({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'orders.number',
                  operator: 'in',
                  value: ['111', '222']
                }
              ]
            }
          })
        );
        expect(findUser.length).toBeGreaterThan(0);
        expect(findUser.some(u => u.name === 'Jimmy')).toBe(true);
      });

      it('find() 支持 orders.amount 大于条件', async () => {
        const findUser = await firstValueFrom(
          User.find({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'orders.amount',
                  operator: '>',
                  value: 100
                }
              ]
            }
          })
        );
        expect(findUser.length).toBeGreaterThan(0);
        expect(findUser.some(u => u.name === 'Jimmy')).toBe(true);
      });

      it('find() 支持多订单号组合查询', async () => {
        const findUser = await firstValueFrom(
          User.find({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'orders.number',
                  operator: 'in',
                  value: ['111', '222']
                }
              ]
            }
          })
        );
        expect(findUser.length).toBeGreaterThan(0);
        expect(findUser.some(u => u.name === 'Jimmy')).toBe(true);
      });
    });

    describe('多对一关系查询', () => {
      let order: Order;
      let user: User;

      beforeAll(async () => {
        user = new User();
        user.name = 'Jim';
        order = new Order();
        order.number = '333';
        order.amount = 222;
        order.owner$.set(user);
        await order.save();
      });

      it('find() 查询拥有指定用户的订单', async () => {
        const findOrders = await firstValueFrom(
          Order.find({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'owner.name',
                  operator: '=',
                  value: 'Jim'
                }
              ]
            }
          })
        );
        expect(findOrders[0]).toEqual(order);
      });

      it('find() 支持金额大于条件', async () => {
        const findOrders = await firstValueFrom(
          Order.find({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'amount',
                  operator: '>',
                  value: 200
                }
              ]
            }
          })
        );
        expect(findOrders.length).toBeGreaterThan(0);
        expect(findOrders.some(o => o.number === '333')).toBe(true);
      });

      it('find() 支持组合条件查询', async () => {
        const findOrders = await firstValueFrom(
          Order.find({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'owner.name',
                  operator: '=',
                  value: 'Jim'
                },
                {
                  field: 'amount',
                  operator: '>=',
                  value: 200
                }
              ]
            }
          })
        );
        expect(findOrders.length).toBeGreaterThan(0);
        expect(findOrders.some(o => o.number === '333')).toBe(true);
      });
    });

    describe('多对多关系查询', () => {
      let order: Order;
      let orderItem: OrderItem;
      let user: User;
      let category: Category;
      let category2: Category;

      beforeAll(async () => {
        user = new User();
        user.name = 'Jim';
        order = new Order();
        order.number = '444';
        order.amount = 333;
        order.owner$.set(user);
        orderItem = new OrderItem();
        orderItem.productName = '牙刷';
        orderItem.quantity = 1;
        orderItem.price = 100;
        orderItem.order$.set(order);
        order.items$.add(orderItem);
        category = new Category();
        category.name = '日用品';
        orderItem.categories$.add(category);

        category2 = new Category();
        category2.name = '电子产品';
        orderItem.categories$.add(category2);

        await user.save();
        await order.save();
        await orderItem.save();
        await category.save();
        await category2.save();
      });

      it('find() 查询属于指定分类的订单项', async () => {
        const findOrderItems = await firstValueFrom(
          OrderItem.find({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'categories.name',
                  operator: '=',
                  value: '日用品'
                }
              ]
            }
          })
        );
        expect(findOrderItems[0]).toEqual(orderItem);
      });

      it('find() 查询包含指定分类订单项的订单', async () => {
        const findOrders = await firstValueFrom(
          Order.find({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'items.categories.name',
                  operator: '=',
                  value: '日用品'
                }
              ]
            }
          })
        );
        expect(findOrders[0]).toEqual(order);
      });

      it('find() 查询购买特定分类商品的用户', async () => {
        const findUser = await firstValueFrom(
          User.find({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'orders.items.categories.name',
                  operator: '=',
                  value: '日用品'
                }
              ]
            }
          })
        );
        expect(findUser[0]).toEqual(user);
      });

      it('find() 查询用户购买的分类', async () => {
        const findCategories = await firstValueFrom(
          Category.find({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'orderItems.order.owner.name',
                  operator: '=',
                  value: 'Jim'
                }
              ]
            }
          })
        );
        expect(findCategories.length).toBeGreaterThan(0);
        expect(findCategories.some(c => c.name === '日用品')).toBe(true);
      });

      it('find() 支持分类 in 查询', async () => {
        const findOrderItems = await firstValueFrom(
          OrderItem.find({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'categories.name',
                  operator: 'in',
                  value: ['日用品', '电子产品']
                }
              ]
            }
          })
        );
        expect(findOrderItems.length).toBeGreaterThan(0);
        expect(findOrderItems.some(item => item.productName === '牙刷')).toBe(true);
      });

      it('find() 支持价格大于条件', async () => {
        const findOrderItems = await firstValueFrom(
          OrderItem.find({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'price',
                  operator: '>',
                  value: 50
                }
              ]
            }
          })
        );
        expect(findOrderItems.length).toBeGreaterThan(0);
        expect(findOrderItems.some(item => item.productName === '牙刷')).toBe(true);
      });

      it('find() 支持分类与价格组合条件', async () => {
        const findOrderItems = await firstValueFrom(
          OrderItem.find({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'categories.name',
                  operator: '=',
                  value: '日用品'
                },
                {
                  field: 'price',
                  operator: '>=',
                  value: 100
                }
              ]
            }
          })
        );
        expect(findOrderItems.length).toBeGreaterThan(0);
        expect(findOrderItems.some(item => item.productName === '牙刷')).toBe(true);
      });
    });

    describe('复杂查询条件测试', () => {
      let user1: User;
      let user2: User;
      let order1: Order;
      let order2: Order;
      let orderItem1: OrderItem;
      let orderItem2: OrderItem;
      let category1: Category;
      let category2: Category;

      beforeAll(async () => {
        user1 = new User();
        user1.name = 'Alice';
        user1.age = 25;

        user2 = new User();
        user2.name = 'Bob';
        user2.age = 30;

        order1 = new Order();
        order1.number = 'ORDER001';
        order1.amount = 500;
        order1.owner$.set(user1);

        order2 = new Order();
        order2.number = 'ORDER002';
        order2.amount = 300;
        order2.owner$.set(user2);

        orderItem1 = new OrderItem();
        orderItem1.productName = '手机';
        orderItem1.quantity = 1;
        orderItem1.price = 500;
        orderItem1.order$.set(order1);

        orderItem2 = new OrderItem();
        orderItem2.productName = '耳机';
        orderItem2.quantity = 2;
        orderItem2.price = 150;
        orderItem2.order$.set(order2);

        category1 = new Category();
        category1.name = '电子产品';
        orderItem1.categories$.add(category1);

        category2 = new Category();
        category2.name = '配件';
        orderItem2.categories$.add(category2);

        order1.items$.add(orderItem1);
        order2.items$.add(orderItem2);

        await user1.save();
        await user2.save();
        await order1.save();
        await order2.save();
        await orderItem1.save();
        await orderItem2.save();
        await category1.save();
        await category2.save();
      });

      it('find() 支持 AND/OR 组合器', async () => {
        const findUsers = await firstValueFrom(
          User.find({
            where: {
              combinator: 'or',
              rules: [
                {
                  field: 'name',
                  operator: '=',
                  value: 'Alice'
                },
                {
                  field: 'orders.amount',
                  operator: '>',
                  value: 400
                }
              ]
            }
          })
        );
        expect(findUsers.length).toBeGreaterThan(0);
        expect(findUsers.some(u => u.name === 'Alice')).toBe(true);
      });

      it('find() 支持嵌套关联字段查询', async () => {
        const findUsers = await firstValueFrom(
          User.find({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'age',
                  operator: '>=',
                  value: 25
                },
                {
                  field: 'orders.items.categories.name',
                  operator: 'in',
                  value: ['电子产品', '配件']
                }
              ]
            }
          })
        );
        expect(findUsers.length).toBeGreaterThan(0);
      });

      it('使用LIKE操作符查询', async () => {
        const findUsers = await firstValueFrom(
          User.find({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'name',
                  operator: 'startsWith',
                  value: 'A'
                }
              ]
            }
          })
        );
        expect(findUsers.length).toBeGreaterThan(0);
        expect(findUsers.some(u => u.name === 'Alice')).toBe(true);
      });

      it('find() 支持 between 区间查询', async () => {
        const findOrders = await firstValueFrom(
          Order.find({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'amount',
                  operator: 'between',
                  value: [200, 600]
                }
              ]
            }
          })
        );
        expect(findOrders.length).toBeGreaterThan(0);
        const orderNumbers = findOrders.map(o => o.number);
        expect(orderNumbers).toContain('ORDER001');
        expect(orderNumbers).toContain('ORDER002');
      });
    });

    describe('边界情况测试', () => {
      it('find() 查询不存在的用户返回空数组', async () => {
        const findUsers = await firstValueFrom(
          User.find({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'name',
                  operator: '=',
                  value: 'NonExistentUser'
                }
              ]
            }
          })
        );
        expect(findUsers.length).toEqual(0);
      });

      it('find() 条件为空时返回全部用户', async () => {
        const findUsers = await firstValueFrom(
          User.find({
            where: {
              combinator: 'and',
              rules: []
            }
          })
        );
        expect(findUsers.length).toBeGreaterThan(0);
      });

      it('find() IN 条件为空时返回空数组', async () => {
        const findUsers = await firstValueFrom(
          User.find({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'name',
                  operator: 'in',
                  value: []
                }
              ]
            }
          })
        );
        expect(findUsers.length).toEqual(0);
      });
    });

    describe('分组查询示例', () => {
      beforeAll(async () => {
        const product = new Product({
          name: '男士T恤',
          description: '优质棉质男士T恤'
        });
        await product.save();

        const color = new Attribute({ name: '颜色' });
        const size = new Attribute({ name: '尺寸' });
        await color.save();
        await size.save();

        const color_w = new AttributeValue({ name: '白色' });
        const color_b = new AttributeValue({ name: '黑色' });
        color_w.attribute$.set(color);
        color_b.attribute$.set(color);
        await color_w.save();
        await color_b.save();

        const size_s = new AttributeValue({ name: 'S' });
        const size_m = new AttributeValue({ name: 'M' });
        const size_l = new AttributeValue({ name: 'L' });
        size_s.attribute$.set(size);
        size_m.attribute$.set(size);
        size_l.attribute$.set(size);
        await size_s.save();
        await size_m.save();
        await size_l.save();

        {
          const sku = new SKU({ code: 'T001-W-S', price: 99, stock: 100 });
          sku.product$.set(product);
          const sku_attr_c = new SKUAttributes();
          sku_attr_c.attribute$.set(color);
          sku_attr_c.value$.set(color_w);
          const sku_attr_s = new SKUAttributes();
          sku_attr_s.attribute$.set(size);
          sku_attr_s.value$.set(size_s);
          sku.attributes$.add(sku_attr_c);
          sku.attributes$.add(sku_attr_s);
          await sku.save();
        }
        {
          const sku = new SKU({ code: 'T001-W-M', price: 99, stock: 80 });
          sku.product$.set(product);
          const sku_attr_c = new SKUAttributes();
          sku_attr_c.attribute$.set(color);
          sku_attr_c.value$.set(color_w);
          const sku_attr_m = new SKUAttributes();
          sku_attr_m.attribute$.set(size);
          sku_attr_m.value$.set(size_m);
          sku.attributes$.add(sku_attr_c);
          sku.attributes$.add(sku_attr_m);
          await sku.save();
        }
        {
          const sku = new SKU({ code: 'T001-W-L', price: 99, stock: 50 });
          sku.product$.set(product);
          const sku_attr_c = new SKUAttributes();
          sku_attr_c.attribute$.set(color);
          sku_attr_c.value$.set(color_w);
          const sku_attr_l = new SKUAttributes();
          sku_attr_l.attribute$.set(size);
          sku_attr_l.value$.set(size_l);
          sku.attributes$.add(sku_attr_c);
          sku.attributes$.add(sku_attr_l);
          await sku.save();
        }
        {
          const sku = new SKU({ code: 'T001-B-S', price: 99, stock: 40 });
          sku.product$.set(product);
          const sku_attr_b = new SKUAttributes();
          sku_attr_b.attribute$.set(color);
          sku_attr_b.value$.set(color_b);
          const sku_attr_s = new SKUAttributes();
          sku_attr_s.attribute$.set(size);
          sku_attr_s.value$.set(size_s);
          sku.attributes$.add(sku_attr_b);
          sku.attributes$.add(sku_attr_s);
          await sku.save();
        }
        {
          const sku = new SKU({ code: 'T001-B-M', price: 99, stock: 20 });
          sku.product$.set(product);
          const sku_attr_b = new SKUAttributes();
          sku_attr_b.attribute$.set(color);
          sku_attr_b.value$.set(color_b);
          const sku_attr_m = new SKUAttributes();
          sku_attr_m.attribute$.set(size);
          sku_attr_m.value$.set(size_m);
          sku.attributes$.add(sku_attr_b);
          sku.attributes$.add(sku_attr_m);
          await sku.save();
        }
        {
          const sku = new SKU({ code: 'T001-B-L', price: 99, stock: 0 });
          sku.product$.set(product);
          const sku_attr_b = new SKUAttributes();
          sku_attr_b.attribute$.set(color);
          sku_attr_b.value$.set(color_b);
          const sku_attr_l = new SKUAttributes();
          sku_attr_l.attribute$.set(size);
          sku_attr_l.value$.set(size_l);
          sku.attributes$.add(sku_attr_b);
          sku.attributes$.add(sku_attr_l);
          await sku.save();
        }
      });
      it('查询商品 SKU 结构成功', async () => {
        const product = await firstValueFrom(
          Product.findOne({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'name',
                  operator: '=',
                  value: '男士T恤'
                }
              ]
            }
          })
        );
        expect(product?.name).toEqual('男士T恤');
      });
    });

    describe('EXISTS 查询操作符', () => {
      let userWithCard: User;
      let userWithoutCard: User;
      let userWithOrders: User;
      let userWithoutOrders: User;

      beforeAll(async () => {
        userWithCard = new User();
        userWithCard.name = 'EXISTS_Alice';
        userWithCard.age = 30;
        const idCard1 = new IdCard();
        idCard1.code = 'EXISTS-ID-001';
        idCard1.owner$.set(userWithCard);
        userWithCard.idCard$.set(idCard1);
        await userWithCard.save();

        userWithoutCard = new User();
        userWithoutCard.name = 'EXISTS_Bob';
        userWithoutCard.age = 25;
        await userWithoutCard.save();

        userWithOrders = new User();
        userWithOrders.name = 'EXISTS_Charlie';
        userWithOrders.age = 35;
        const order1 = new Order();
        order1.number = 'EXISTS-ORD-001';
        order1.amount = 100;
        order1.owner$.set(userWithOrders);
        await order1.save();

        userWithoutOrders = new User();
        userWithoutOrders.name = 'EXISTS_David';
        userWithoutOrders.age = 28;
        await userWithoutOrders.save();
      });

      describe('ONE_TO_ONE 关系', () => {
        it('应该查询有 IdCard 的 User (exists)', async () => {
          const result = await firstValueFrom(
            User.find({
              where: {
                combinator: 'and',
                rules: [
                  { field: 'idCard', operator: 'exists' },
                  { field: 'name', operator: '=', value: 'EXISTS_Alice' }
                ]
              }
            })
          );

          expect(result).toHaveLength(1);
          expect(result[0].name).toBe('EXISTS_Alice');
          expect(result[0].id).toBe(userWithCard.id);
        });

        it('应该查询没有 IdCard 的 User (notExists)', async () => {
          const result = await firstValueFrom(
            User.find({
              where: {
                combinator: 'and',
                rules: [
                  { field: 'idCard', operator: 'notExists' },
                  { field: 'name', operator: 'in', value: ['EXISTS_Bob', 'EXISTS_Charlie', 'EXISTS_David'] }
                ]
              }
            })
          );

          expect(result).toHaveLength(3);
          const names = result.map(u => u.name).sort();
          expect(names).toEqual(['EXISTS_Bob', 'EXISTS_Charlie', 'EXISTS_David']);
        });
      });

      describe('ONE_TO_MANY 关系', () => {
        it('应该查询有订单的 User (exists)', async () => {
          const result = await firstValueFrom(
            User.find({
              where: {
                combinator: 'and',
                rules: [
                  { field: 'orders', operator: 'exists' },
                  { field: 'name', operator: '=', value: 'EXISTS_Charlie' }
                ]
              }
            })
          );

          expect(result).toHaveLength(1);
          expect(result[0].name).toBe('EXISTS_Charlie');
          expect(result[0].id).toBe(userWithOrders.id);
        });

        it('应该查询没有订单的 User (notExists)', async () => {
          const result = await firstValueFrom(
            User.find({
              where: {
                combinator: 'and',
                rules: [
                  { field: 'orders', operator: 'notExists' },
                  { field: 'name', operator: 'in', value: ['EXISTS_Alice', 'EXISTS_Bob', 'EXISTS_David'] }
                ]
              }
            })
          );

          expect(result).toHaveLength(3);
          const names = result.map(u => u.name).sort();
          expect(names).toEqual(['EXISTS_Alice', 'EXISTS_Bob', 'EXISTS_David']);
        });
      });

      describe('带条件的 EXISTS 查询', () => {
        it('应该支持在 EXISTS 子查询中使用 where 条件', async () => {
          const userWithHighOrder = new User();
          userWithHighOrder.name = 'EXISTS_HighSpender';
          userWithHighOrder.age = 40;
          const highOrder = new Order();
          highOrder.number = 'EXISTS-ORD-HIGH';
          highOrder.amount = 1000;
          highOrder.owner$.set(userWithHighOrder);
          await highOrder.save();

          const result = await firstValueFrom(
            User.find({
              where: {
                combinator: 'and',
                rules: [
                  {
                    field: 'orders',
                    operator: 'exists',
                    where: {
                      combinator: 'and',
                      rules: [{ field: 'amount', operator: '>=', value: 500 }]
                    }
                  }
                ]
              }
            })
          );

          expect(result.length).toBeGreaterThanOrEqual(1);
          const hasHighSpender = result.some(u => u.name === 'EXISTS_HighSpender');
          expect(hasHighSpender).toBe(true);
        });

        it('应该支持在 NOT EXISTS 子查询中使用 where 条件', async () => {
          const result = await firstValueFrom(
            User.find({
              where: {
                combinator: 'and',
                rules: [
                  {
                    field: 'orders',
                    operator: 'notExists',
                    where: {
                      combinator: 'and',
                      rules: [{ field: 'amount', operator: '<', value: 50 }]
                    }
                  },
                  {
                    field: 'name',
                    operator: 'in',
                    value: ['EXISTS_Alice', 'EXISTS_Bob', 'EXISTS_Charlie', 'EXISTS_David', 'EXISTS_HighSpender']
                  }
                ]
              }
            })
          );

          expect(result.length).toBeGreaterThanOrEqual(4);
        });

        it('应该支持复杂的 where 条件组合', async () => {
          const userWithMultiOrders = new User();
          userWithMultiOrders.name = 'EXISTS_MultiOrder';
          userWithMultiOrders.age = 45;
          await userWithMultiOrders.save();

          const order1 = new Order();
          order1.number = 'EXISTS-ORD-M1';
          order1.amount = 200;
          order1.owner$.set(userWithMultiOrders);
          await order1.save();

          const order2 = new Order();
          order2.number = 'EXISTS-ORD-M2';
          order2.amount = 300;
          order2.owner$.set(userWithMultiOrders);
          await order2.save();

          const result = await firstValueFrom(
            User.find({
              where: {
                combinator: 'and',
                rules: [
                  {
                    field: 'orders',
                    operator: 'exists',
                    where: {
                      combinator: 'and',
                      rules: [
                        { field: 'amount', operator: '>=', value: 100 },
                        { field: 'amount', operator: '<=', value: 500 }
                      ]
                    }
                  },
                  { field: 'name', operator: '=', value: 'EXISTS_MultiOrder' }
                ]
              }
            })
          );

          expect(result).toHaveLength(1);
          expect(result[0].name).toBe('EXISTS_MultiOrder');
        });
      });

      describe('COUNT 查询', () => {
        it('应该正确统计满足 EXISTS 条件的记录数', async () => {
          const count = await firstValueFrom(
            User.count({
              where: {
                combinator: 'and',
                rules: [
                  { field: 'orders', operator: 'exists' },
                  { field: 'name', operator: '=', value: 'EXISTS_Charlie' }
                ]
              }
            })
          );

          expect(count).toBe(1);
        });

        it('应该正确统计满足 NOT EXISTS 条件的记录数', async () => {
          const count = await firstValueFrom(
            User.count({
              where: {
                combinator: 'and',
                rules: [
                  { field: 'orders', operator: 'notExists' },
                  { field: 'name', operator: 'in', value: ['EXISTS_Alice', 'EXISTS_Bob', 'EXISTS_David'] }
                ]
              }
            })
          );

          expect(count).toBe(3);
        });
      });

      describe('MANY_TO_MANY 关系 (Category-OrderItem)', () => {
        let categoryWithItems: Category;
        let categoryWithoutItems: Category;
        let orderItemWithCategories: OrderItem;
        let orderItemWithoutCategories: OrderItem;

        beforeAll(async () => {
          categoryWithItems = new Category();
          categoryWithItems.name = 'EXISTS_Electronics';
          await categoryWithItems.save();

          categoryWithoutItems = new Category();
          categoryWithoutItems.name = 'EXISTS_Empty';
          await categoryWithoutItems.save();

          const order = new Order();
          order.number = 'EXISTS-M2M-001';
          order.amount = 500;
          order.owner$.set(userWithOrders);
          await order.save();

          orderItemWithCategories = new OrderItem();
          orderItemWithCategories.productName = 'EXISTS_Laptop';
          orderItemWithCategories.quantity = 1;
          orderItemWithCategories.price = 1000;
          orderItemWithCategories.order$.set(order);
          await orderItemWithCategories.save();

          await orderItemWithCategories.categories$.add(categoryWithItems);
          await orderItemWithCategories.save();

          orderItemWithoutCategories = new OrderItem();
          orderItemWithoutCategories.productName = 'EXISTS_Mouse';
          orderItemWithoutCategories.quantity = 2;
          orderItemWithoutCategories.price = 50;
          orderItemWithoutCategories.order$.set(order);
          await orderItemWithoutCategories.save();
        });

        it('应该查询有订单项的分类 (MANY_TO_MANY exists)', async () => {
          const result = await firstValueFrom(
            Category.find({
              where: {
                combinator: 'and',
                rules: [
                  { field: 'orderItems', operator: 'exists' },
                  { field: 'name', operator: '=', value: 'EXISTS_Electronics' }
                ]
              }
            })
          );

          expect(result.length).toBe(1);
          expect(result[0].id).toBe(categoryWithItems.id);
          expect(result[0].name).toBe('EXISTS_Electronics');
        });

        it('应该查询没有订单项的分类 (MANY_TO_MANY notExists)', async () => {
          const result = await firstValueFrom(
            Category.find({
              where: {
                combinator: 'and',
                rules: [
                  { field: 'orderItems', operator: 'notExists' },
                  { field: 'name', operator: '=', value: 'EXISTS_Empty' }
                ]
              }
            })
          );

          expect(result.length).toBe(1);
          expect(result[0].id).toBe(categoryWithoutItems.id);
          expect(result[0].name).toBe('EXISTS_Empty');
        });

        it('应该查询有特定产品名称的分类 (WHERE 条件)', async () => {
          const result = await firstValueFrom(
            Category.find({
              where: {
                combinator: 'and',
                rules: [
                  {
                    field: 'orderItems',
                    operator: 'exists',
                    where: {
                      combinator: 'and',
                      rules: [{ field: 'productName', operator: '=', value: 'EXISTS_Laptop' }]
                    }
                  }
                ]
              }
            })
          );

          expect(result.length).toBe(1);
          expect(result[0].id).toBe(categoryWithItems.id);
        });

        it('应该支持复杂 WHERE 条件 (AND)', async () => {
          const result = await firstValueFrom(
            Category.find({
              where: {
                combinator: 'and',
                rules: [
                  {
                    field: 'orderItems',
                    operator: 'exists',
                    where: {
                      combinator: 'and',
                      rules: [
                        { field: 'productName', operator: '=', value: 'EXISTS_Laptop' },
                        { field: 'price', operator: '>=', value: 500 }
                      ]
                    }
                  }
                ]
              }
            })
          );

          expect(result.length).toBe(1);
          expect(result[0].id).toBe(categoryWithItems.id);
        });

        it('应该支持 NOT EXISTS 带 WHERE', async () => {
          const result = await firstValueFrom(
            Category.find({
              where: {
                combinator: 'and',
                rules: [
                  {
                    field: 'orderItems',
                    operator: 'notExists',
                    where: {
                      combinator: 'and',
                      rules: [{ field: 'price', operator: '>=', value: 2000 }]
                    }
                  },
                  { field: 'name', operator: 'in', value: ['EXISTS_Electronics', 'EXISTS_Empty'] }
                ]
              }
            })
          );

          expect(result.length).toBe(2);
        });

        it('应该支持 COUNT 查询 (MANY_TO_MANY)', async () => {
          const count = await firstValueFrom(
            Category.count({
              where: {
                combinator: 'and',
                rules: [
                  { field: 'orderItems', operator: 'exists' },
                  { field: 'name', operator: 'in', value: ['EXISTS_Electronics', 'EXISTS_Empty'] }
                ]
              }
            })
          );

          expect(count).toBe(1);
        });

        it('应该支持反向关系查询 (OrderItem.categories exists)', async () => {
          const result = await firstValueFrom(
            OrderItem.find({
              where: {
                combinator: 'and',
                rules: [
                  { field: 'categories', operator: 'exists' },
                  { field: 'productName', operator: '=', value: 'EXISTS_Laptop' }
                ]
              }
            })
          );

          expect(result.length).toBe(1);
          expect(result[0].id).toBe(orderItemWithCategories.id);
        });

        it('应该支持反向关系 NOT EXISTS', async () => {
          const result = await firstValueFrom(
            OrderItem.find({
              where: {
                combinator: 'and',
                rules: [
                  { field: 'categories', operator: 'notExists' },
                  { field: 'productName', operator: '=', value: 'EXISTS_Mouse' }
                ]
              }
            })
          );

          expect(result.length).toBe(1);
          expect(result[0].id).toBe(orderItemWithoutCategories.id);
        });
      });
    });
  });

  // ========== test-shop-sort.spec.ts ==========
  describe(`Shop 排序 CRUD [${factory.name}]`, () => {
    let adapter: RxDBAdapterSqliteBase;

    beforeAll(async () => {
      adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [...ENTITIES] });
    });

    afterAll(async () => {
      if (adapter) {
        await adapter.rxdb.disconnectAll();
      }
    });

    beforeEach(async () => {
      const user1 = new User();
      user1.name = 'Charlie';
      user1.age = 20;

      const user2 = new User();
      user2.name = 'David';
      user2.age = 35;

      const user3 = new User();
      user3.name = 'Eve';
      user3.age = 28;

      await user1.save();
      await user2.save();
      await user3.save();
    });

    afterEach(async () => {
      await adapter.cleanAllCache();
    });

    it('按年龄排序查询用户', async () => {
      const findUsers = await firstValueFrom(
        User.find({
          where: {
            combinator: 'and',
            rules: []
          },
          orderBy: [
            {
              field: 'age',
              sort: 'asc'
            }
          ]
        })
      );
      expect(findUsers.length).toBeGreaterThan(0);
      for (let i = 1; i < findUsers.length; i++) {
        expect(findUsers[i].age).toBeGreaterThanOrEqual(findUsers[i - 1].age);
      }
    });

    it('按姓名降序排序查询用户', async () => {
      const findUsers = await firstValueFrom(
        User.find({
          where: {
            combinator: 'and',
            rules: []
          },
          orderBy: [
            {
              field: 'name',
              sort: 'desc'
            }
          ]
        })
      );
      expect(findUsers.length).toBeGreaterThan(0);
      for (let i = 1; i < findUsers.length; i++) {
        expect(findUsers[i].name.localeCompare(findUsers[i - 1].name)).toBeLessThanOrEqual(0);
      }
    });

    it('复合排序查询', async () => {
      const findUsers = await firstValueFrom(
        User.find({
          where: {
            combinator: 'and',
            rules: []
          },
          orderBy: [
            {
              field: 'age',
              sort: 'desc'
            },
            {
              field: 'name',
              sort: 'asc'
            }
          ]
        })
      );
      expect(findUsers.length).toBeGreaterThan(0);
    });
  });

  // ========== test-types.spec.ts ==========
  describe(`类型测试 CRUD [${factory.name}]`, () => {
    let testTypeDemo: TypeDemo;
    let adapter: RxDBAdapterSqliteBase;

    beforeAll(async () => {
      adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [TypeDemo] });

      testTypeDemo = new TypeDemo();
      testTypeDemo.string = 'test string';
      testTypeDemo.number = 3.14;
      testTypeDemo.integer = 42;
      testTypeDemo.boolean = true;
      testTypeDemo.date = new Date('2024-01-01T00:00:00Z');
      testTypeDemo.enum = TypeDemoEnum.Active;
      testTypeDemo.stringArray = ['apple', 'banana', 'cherry'];
      testTypeDemo.numberArray = [1, 2, 3, 4.5];
      testTypeDemo.keyValue = {
        string: 'nested string',
        number: 2.71,
        integer: 100,
        boolean: false,
        date: new Date('2024-12-31T23:59:59Z')
      };
      testTypeDemo.json = {
        nested: {
          key: 'value',
          array: [1, 2, 3],
          object: { a: 'b' }
        }
      };

      const status = getEntityStatus(testTypeDemo);
      expect(status.local).toEqual(false);
      expect(status.remote).toEqual(false);
      await testTypeDemo.save();
    });

    afterAll(async () => {
      await cleanup_db(adapter);
      if (adapter) {
        await adapter.rxdb.disconnectAll();
      }
    });

    it('创建并保存 TypeDemo 实体', async () => {
      const typeDemo = new TypeDemo();
      typeDemo.string = 'new test';
      typeDemo.number = 1.23;
      typeDemo.integer = 10;
      typeDemo.boolean = false;
      typeDemo.date = new Date();
      typeDemo.stringArray = ['test'];
      typeDemo.numberArray = [1];
      typeDemo.keyValue = { string: 'kv', number: 1, integer: 1, boolean: true, date: new Date() };
      typeDemo.json = { test: true };

      const status = getEntityStatus(typeDemo);
      expect(status.local).toEqual(false);

      const saved = await typeDemo.save();
      expect(saved.id).toBeDefined();
      expect(saved.string).toEqual('new test');
    });

    it('get() 能查询到指定 TypeDemo', async () => {
      const typeDemo = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
      const status = getEntityStatus(typeDemo);
      expect(status.local).toEqual(true);
      expect(typeDemo.id).toEqual(testTypeDemo.id);
    });

    it('string 属性能正确保存和查询', async () => {
      const typeDemo = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
      expect(typeDemo.string).toEqual('test string');

      const found = await firstValueFrom(
        TypeDemo.findOne({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'string',
                operator: '=',
                value: 'test string'
              }
            ]
          }
        })
      );
      expect(found?.id).toEqual(testTypeDemo.id);
    });

    it('number 属性能正确保存和查询', async () => {
      const typeDemo = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
      expect(typeDemo.number).toEqual(3.14);

      const found = await firstValueFrom(
        TypeDemo.findOne({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'number',
                operator: '=',
                value: 3.14
              }
            ]
          }
        })
      );
      expect(found?.id).toEqual(testTypeDemo.id);
    });

    it('integer 属性能正确保存和查询', async () => {
      const typeDemo = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
      expect(typeDemo.integer).toEqual(42);

      const found = await firstValueFrom(
        TypeDemo.findOne({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'integer',
                operator: '=',
                value: 42
              }
            ]
          }
        })
      );
      expect(found?.id).toEqual(testTypeDemo.id);
    });

    it('boolean 属性能正确保存和查询', async () => {
      const typeDemo = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
      expect(typeDemo.boolean).toEqual(true);

      const found = await firstValueFrom(
        TypeDemo.findOne({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'boolean',
                operator: '=',
                value: true
              }
            ]
          }
        })
      );
      expect(found?.id).toEqual(testTypeDemo.id);
    });

    it('date 属性能正确保存和查询', async () => {
      const typeDemo = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
      expect(typeDemo.date).toBeInstanceOf(Date);
      expect(typeDemo.date!.toISOString()).toEqual('2024-01-01T00:00:00.000Z');

      const found = await firstValueFrom(
        TypeDemo.findOne({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'date',
                operator: '>=',
                value: new Date('2023-12-31')
              },
              {
                field: 'date',
                operator: '<=',
                value: new Date('2024-01-02')
              }
            ]
          }
        })
      );
      expect(found?.id).toEqual(testTypeDemo.id);
    });

    it('stringArray 属性能正确保存和查询', async () => {
      const typeDemo = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
      expect(typeDemo.stringArray).toEqual(['apple', 'banana', 'cherry']);
      expect(Array.isArray(typeDemo.stringArray)).toBe(true);
      expect(typeDemo.stringArray?.length).toEqual(3);
    });

    it('numberArray 属性能正确保存和查询', async () => {
      const typeDemo = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
      expect(typeDemo.numberArray).toEqual([1, 2, 3, 4.5]);
      expect(Array.isArray(typeDemo.numberArray)).toBe(true);
      expect(typeDemo.numberArray?.length).toEqual(4);
    });

    it('keyValue 属性能正确保存和查询', async () => {
      const typeDemo = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
      expect(typeDemo.keyValue).toBeDefined();
      expect(typeDemo.keyValue!.string).toEqual('nested string');
      expect(typeDemo.keyValue!.number).toEqual(2.71);
      expect(typeDemo.keyValue!.integer).toEqual(100);
      expect(typeDemo.keyValue!.boolean).toEqual(false);
      expect(typeDemo.keyValue!.date).toBeInstanceOf(Date);
      expect(typeDemo.keyValue!.date!.toISOString()).toEqual('2024-12-31T23:59:59.000Z');
    });

    it('json 属性能正确保存和查询', async () => {
      const typeDemo = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
      expect(typeDemo.json).toBeDefined();
      expect(typeDemo.json!.nested).toBeDefined();
      expect(typeDemo.json!.nested.key).toEqual('value');
      expect(typeDemo.json!.nested.array).toEqual([1, 2, 3]);
      expect(typeDemo.json!.nested.object).toEqual({ a: 'b' });
    });

    it('enum 属性能正确保存和查询', async () => {
      const typeDemo = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
      expect(typeDemo.enum).toEqual('active');

      typeDemo.enum = TypeDemoEnum.Inactive;
      await typeDemo.save();

      const updated = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
      expect(updated.enum).toEqual('inactive');

      updated.enum = null;
      await updated.save();

      const nulled = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
      expect(nulled.enum).toBeNull();
    });

    describe('enum 类型查询', () => {
      let activeDemo: TypeDemo;
      let inactiveDemo: TypeDemo;
      let pendingDemo: TypeDemo;
      let nullEnumDemo: TypeDemo;

      const makeDemo = (enumVal: TypeDemo['enum']): TypeDemo => {
        const d = new TypeDemo();
        d.string = `enum-test-${enumVal ?? 'null'}`;
        d.number = 0;
        d.integer = 0;
        d.boolean = false;
        d.date = new Date();
        d.stringArray = [];
        d.numberArray = [];
        d.keyValue = { string: '', number: 0, integer: 0, boolean: false, date: new Date() };
        d.json = {};
        d.enum = enumVal;
        return d;
      };

      beforeAll(async () => {
        activeDemo = makeDemo('active');
        inactiveDemo = makeDemo('inactive');
        pendingDemo = makeDemo('pending');
        nullEnumDemo = makeDemo(null);
        await Promise.all([activeDemo.save(), inactiveDemo.save(), pendingDemo.save(), nullEnumDemo.save()]);
      });

      it('= 等于查询', async () => {
        const found = await firstValueFrom(
          TypeDemo.findAll({
            where: {
              combinator: 'and',
              rules: [{ field: 'enum', operator: '=', value: TypeDemoEnum.Active }]
            }
          })
        );
        expect(found.some(d => d.id === activeDemo.id)).toBe(true);
        expect(found.every(d => d.enum === TypeDemoEnum.Active)).toBe(true);
      });

      it('!= 不等于查询', async () => {
        const found = await firstValueFrom(
          TypeDemo.findAll({
            where: {
              combinator: 'and',
              rules: [
                { field: 'id', operator: 'in', value: [activeDemo.id, inactiveDemo.id, pendingDemo.id] },
                { field: 'enum', operator: '!=', value: TypeDemoEnum.Active }
              ]
            }
          })
        );
        expect(found.some(d => d.id === activeDemo.id)).toBe(false);
        expect(found.some(d => d.id === inactiveDemo.id)).toBe(true);
        expect(found.some(d => d.id === pendingDemo.id)).toBe(true);
      });

      it('null 为空查询', async () => {
        const found = await firstValueFrom(
          TypeDemo.findAll({
            where: {
              combinator: 'and',
              rules: [
                { field: 'id', operator: 'in', value: [activeDemo.id, nullEnumDemo.id] },
                { field: 'enum', operator: 'null' }
              ]
            }
          })
        );
        expect(found.some(d => d.id === nullEnumDemo.id)).toBe(true);
        expect(found.some(d => d.id === activeDemo.id)).toBe(false);
        expect(found.every(d => d.enum === null || d.enum === undefined)).toBe(true);
      });

      it('notNull 不为空查询', async () => {
        const found = await firstValueFrom(
          TypeDemo.findAll({
            where: {
              combinator: 'and',
              rules: [
                { field: 'id', operator: 'in', value: [activeDemo.id, nullEnumDemo.id] },
                { field: 'enum', operator: 'notNull' }
              ]
            }
          })
        );
        expect(found.some(d => d.id === activeDemo.id)).toBe(true);
        expect(found.some(d => d.id === nullEnumDemo.id)).toBe(false);
      });

      it('in 在列表中查询', async () => {
        const found = await firstValueFrom(
          TypeDemo.findAll({
            where: {
              combinator: 'and',
              rules: [
                { field: 'id', operator: 'in', value: [activeDemo.id, inactiveDemo.id, pendingDemo.id] },
                { field: 'enum', operator: 'in', value: [TypeDemoEnum.Active, TypeDemoEnum.Pending] }
              ]
            }
          })
        );
        expect(found.some(d => d.id === activeDemo.id)).toBe(true);
        expect(found.some(d => d.id === pendingDemo.id)).toBe(true);
        expect(found.some(d => d.id === inactiveDemo.id)).toBe(false);
      });

      it('notIn 不在列表中查询', async () => {
        const found = await firstValueFrom(
          TypeDemo.findAll({
            where: {
              combinator: 'and',
              rules: [
                { field: 'id', operator: 'in', value: [activeDemo.id, inactiveDemo.id, pendingDemo.id] },
                { field: 'enum', operator: 'notIn', value: [TypeDemoEnum.Active, TypeDemoEnum.Pending] }
              ]
            }
          })
        );
        expect(found.some(d => d.id === inactiveDemo.id)).toBe(true);
        expect(found.some(d => d.id === activeDemo.id)).toBe(false);
        expect(found.some(d => d.id === pendingDemo.id)).toBe(false);
      });
    });

    it('更新各种类型属性', async () => {
      const typeDemo = await firstValueFrom(TypeDemo.get(testTypeDemo.id));

      typeDemo.string = 'updated string';
      typeDemo.number = 9.99;
      typeDemo.integer = 999;
      typeDemo.boolean = false;
      typeDemo.date = new Date('2025-01-01T00:00:00Z');
      typeDemo.stringArray = ['updated', 'array'];
      typeDemo.numberArray = [10, 20, 30];
      typeDemo.keyValue = {
        string: 'updated nested',
        number: 3.33,
        integer: 200,
        boolean: true,
        date: new Date('2025-12-31T23:59:59Z')
      };
      typeDemo.json = { updated: true };

      await typeDemo.save();

      const updated = await firstValueFrom(TypeDemo.get(testTypeDemo.id));
      expect(updated.string).toEqual('updated string');
      expect(updated.number).toEqual(9.99);
      expect(updated.integer).toEqual(999);
      expect(updated.boolean).toEqual(false);
      expect(updated.date!.toISOString()).toEqual('2025-01-01T00:00:00.000Z');
      expect(updated.stringArray).toEqual(['updated', 'array']);
      expect(updated.numberArray).toEqual([10, 20, 30]);
      expect(updated.keyValue!.string).toEqual('updated nested');
      expect(updated.json!.updated).toEqual(true);
    });

    it('findAll() 返回所有 TypeDemo', async () => {
      const list = await firstValueFrom(
        TypeDemo.findAll({
          where: {
            combinator: 'and',
            rules: []
          }
        })
      );
      expect(list.length).toBeGreaterThanOrEqual(1);
      const found = list.some(item => item.id === testTypeDemo.id);
      expect(found).toBe(true);
    });

    it('count() 返回正确数量', async () => {
      const count = await firstValueFrom(
        TypeDemo.count({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'id',
                operator: '=',
                value: testTypeDemo.id
              }
            ]
          }
        })
      );
      expect(count).toEqual(1);
    });

    it('remove() 标记 TypeDemo 为已删除', async () => {
      const typeDemo = new TypeDemo();
      typeDemo.string = 'to be deleted';
      typeDemo.number = 1;
      typeDemo.integer = 1;
      typeDemo.boolean = true;
      typeDemo.date = new Date();
      typeDemo.stringArray = ['del'];
      typeDemo.numberArray = [1];
      typeDemo.keyValue = { string: 'del', number: 1, integer: 1, boolean: true, date: new Date() };
      typeDemo.json = { deleted: true };
      const saved = await typeDemo.save();
      expect(saved.id).toBeDefined();

      await typeDemo.remove();

      const all = await firstValueFrom(TypeDemo.findAll({ where: { combinator: 'and', rules: [] } }));
      const foundRemoved = all.some(t => t.id === typeDemo.id);
      expect(foundRemoved).toBe(false);
    });

    it('批量保存不同类型的数据', async () => {
      const batch = [
        Object.assign(new TypeDemo(), {
          string: 'batch1',
          number: 1.1,
          integer: 1,
          boolean: true,
          date: new Date('2024-01-01'),
          stringArray: ['a'],
          numberArray: [1],
          keyValue: { string: 'kv1', number: 1, integer: 1, boolean: true, date: new Date() },
          json: { data: 1 }
        }),
        Object.assign(new TypeDemo(), {
          string: 'batch2',
          number: 2.2,
          integer: 2,
          boolean: false,
          date: new Date('2024-02-02'),
          stringArray: ['b'],
          numberArray: [2],
          keyValue: { string: 'kv2', number: 2, integer: 2, boolean: false, date: new Date() },
          json: { data: 2 }
        }),
        Object.assign(new TypeDemo(), {
          string: 'batch3',
          number: 3.3,
          integer: 3,
          boolean: true,
          date: new Date('2024-03-03'),
          stringArray: ['c'],
          numberArray: [3],
          keyValue: { string: 'kv3', number: 3, integer: 3, boolean: true, date: new Date() },
          json: { data: 3 }
        })
      ];

      await adapter.rxdb.entityManager.saveMany(batch);

      const savedIds = batch.map(t => t.id);
      const found = await firstValueFrom(
        TypeDemo.findAll({
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

      expect(found.length).toBeGreaterThanOrEqual(3);
      expect(found[0].string).toBeDefined();
      expect(found[0].keyValue).toBeDefined();
      expect(found[0].json).toBeDefined();
    });

    it('字符串操作符 startsWith 查询', async () => {
      const newDemo = new TypeDemo();
      newDemo.string = 'test startsWith';
      newDemo.number = 5.5;
      newDemo.integer = 55;
      newDemo.boolean = true;
      newDemo.date = new Date();
      newDemo.stringArray = ['test'];
      newDemo.numberArray = [5];
      newDemo.keyValue = { string: 'test', number: 5, integer: 5, boolean: true, date: new Date() };
      newDemo.json = { test: true };
      await newDemo.save();

      const found = await firstValueFrom(
        TypeDemo.findAll({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'string',
                operator: 'startsWith',
                value: 'test'
              }
            ]
          }
        })
      );
      expect(found.length).toBeGreaterThanOrEqual(1);
      expect(found.some(item => item.id === newDemo.id)).toBe(true);
    });

    it('数字操作符 > 和 < 查询', async () => {
      const demoForNumber = new TypeDemo();
      demoForNumber.string = 'number test';
      demoForNumber.number = 7.5;
      demoForNumber.integer = 75;
      demoForNumber.boolean = true;
      demoForNumber.date = new Date();
      demoForNumber.stringArray = ['num'];
      demoForNumber.numberArray = [7];
      demoForNumber.keyValue = { string: 'num', number: 7, integer: 7, boolean: true, date: new Date() };
      demoForNumber.json = { num: 7 };
      await demoForNumber.save();

      const foundGreater = await firstValueFrom(
        TypeDemo.findAll({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'number',
                operator: '>',
                value: 7
              }
            ]
          }
        })
      );
      expect(foundGreater.some(item => item.id === demoForNumber.id)).toBe(true);

      const foundLess = await firstValueFrom(
        TypeDemo.findAll({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'number',
                operator: '<',
                value: 8
              }
            ]
          }
        })
      );
      expect(foundLess.some(item => item.id === demoForNumber.id)).toBe(true);
    });

    it('orderBy 按不同字段排序', async () => {
      const byString = await firstValueFrom(
        TypeDemo.findAll({
          where: { combinator: 'and', rules: [] },
          orderBy: [{ field: 'string', sort: 'asc' }]
        })
      );
      expect(byString.length).toBeGreaterThanOrEqual(1);

      const byNumber = await firstValueFrom(
        TypeDemo.findAll({
          where: { combinator: 'and', rules: [] },
          orderBy: [{ field: 'number', sort: 'desc' }]
        })
      );
      expect(byNumber.length).toBeGreaterThanOrEqual(1);

      const byDate = await firstValueFrom(
        TypeDemo.findAll({
          where: { combinator: 'and', rules: [] },
          orderBy: [{ field: 'date', sort: 'asc' }]
        })
      );
      expect(byDate.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ========== test-column-name.spec.ts ==========
  describe(`columnName 支持 CRUD [${factory.name}]`, () => {
    let adapter: RxDBAdapterSqliteBase;

    beforeAll(async () => {
      adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({
        entities: [CnDepartment, CnEmployee, CnProfile]
      });
    });

    afterAll(async () => {
      if (adapter) {
        await adapter.rxdb.disconnectAll();
      }
    });

    describe('CREATE TABLE SQL 生成', () => {
      it('属性 columnName 应出现在 CREATE TABLE 中', () => {
        const metadata = getEntityMetadata(CnEmployee);
        const sql = create_table_sql(adapter, metadata);

        expect(sql).toContain('"first_name"');
        expect(sql).toContain('"last_name"');
        expect(sql).toContain('"hire_date"');
        expect(sql).toContain('"is_active"');
        expect(sql).toContain('"base_salary"');
        expect(sql).toContain('"job_level"');

        expect(sql).not.toMatch(/"firstName"/);
        expect(sql).not.toMatch(/"lastName"/);
        expect(sql).not.toMatch(/"hireDate"/);
        expect(sql).not.toMatch(/"isActive"/);
      });

      it('关系 columnName 应出现在外键列定义中', () => {
        const metadata = getEntityMetadata(CnEmployee);
        const sql = create_table_sql(adapter, metadata);

        expect(sql).toContain('"dept_id"');
        expect(sql).not.toMatch(/"departmentId"/);
      });

      it('ONE_TO_ONE 关系自定义 columnName', () => {
        const metadata = getEntityMetadata(CnProfile);
        const sql = create_table_sql(adapter, metadata);

        expect(sql).toContain('"emp_id"');
        expect(sql).toContain('"biography"');
        expect(sql).not.toMatch(/"employeeId"/);
        expect(sql).not.toMatch(/"bio"/);
      });

      it('唯一索引应使用 columnName', () => {
        const metadata = getEntityMetadata(CnDepartment);
        const sql = create_table_sql(adapter, metadata);

        expect(sql).toContain('"dept_name"');
        expect(sql).toContain('"dept_code"');
        expect(sql).toContain('dept_code');
      });
    });

    describe('transformEntityValueToSql - JS→SQL 转换', () => {
      it('属性应映射到 columnName', async () => {
        const metadata = getEntityMetadata(CnEmployee);
        const entity = {
          firstName: 'John',
          lastName: 'Doe',
          isActive: true,
          salary: 50000,
          level: 3
        };

        const result = await transformEntityValueToSql(metadata, entity);

        expect(result).toHaveProperty('first_name', 'John');
        expect(result).toHaveProperty('last_name', 'Doe');
        expect(result).toHaveProperty('is_active');
        expect(result).toHaveProperty('base_salary');
        expect(result).toHaveProperty('job_level');

        expect(result).not.toHaveProperty('firstName');
        expect(result).not.toHaveProperty('lastName');
        expect(result).not.toHaveProperty('isActive');
        expect(result).not.toHaveProperty('salary');
        expect(result).not.toHaveProperty('level');
      });

      it('外键应映射到 relation.columnName', async () => {
        const metadata = getEntityMetadata(CnEmployee);
        const entity = {
          firstName: 'John',
          departmentId: 'dept-1'
        };

        const result = await transformEntityValueToSql(metadata, entity);

        expect(result).toHaveProperty('dept_id', 'dept-1');
        expect(result).not.toHaveProperty('departmentId');
      });
    });

    describe('normalizeCreateEntity', () => {
      it('创建数据应使用 columnName 作为键', () => {
        const metadata = getEntityMetadata(CnEmployee);
        const entity = {
          firstName: 'Jane',
          lastName: 'Smith',
          departmentId: 'dept-2'
        };

        const result = normalizeCreateEntity(metadata, entity);

        expect(result).toHaveProperty('first_name', 'Jane');
        expect(result).toHaveProperty('last_name', 'Smith');
        expect(result).toHaveProperty('dept_id', 'dept-2');

        expect(result).not.toHaveProperty('firstName');
        expect(result).not.toHaveProperty('lastName');
        expect(result).not.toHaveProperty('departmentId');
      });
    });

    describe('normalizeUpdateEntity', () => {
      it('更新数据应使用 columnName 作为键', () => {
        const metadata = getEntityMetadata(CnEmployee);
        const entity = {
          firstName: 'Updated',
          salary: 60000
        };

        const result = normalizeUpdateEntity(metadata, entity);

        expect(result).toHaveProperty('first_name', 'Updated');
        expect(result).toHaveProperty('base_salary', 60000);
        expect(result).not.toHaveProperty('firstName');
        expect(result).not.toHaveProperty('salary');
      });
    });

    describe('getEntityObjectFromResult - SQL→JS 反转换', () => {
      it('应将 columnName 映射回 JS 属性名', async () => {
        const metadata = getEntityMetadata(CnEmployee);
        const columns = ['id', 'first_name', 'last_name', 'is_active', 'base_salary', 'job_level', 'dept_id'];
        const rows = ['emp-1', 'John', 'Doe', 1, 50000, 3, 'dept-1'];

        const result = await getEntityObjectFromResult(metadata, columns, rows);

        expect(result).toHaveProperty('id', 'emp-1');
        expect(result).toHaveProperty('firstName', 'John');
        expect(result).toHaveProperty('lastName', 'Doe');
        expect(result).toHaveProperty('isActive', true);
        expect(result).toHaveProperty('salary', 50000);
        expect(result).toHaveProperty('level', 3);
        expect(result).toHaveProperty('departmentId', 'dept-1');

        expect(result).not.toHaveProperty('first_name');
        expect(result).not.toHaveProperty('last_name');
        expect(result).not.toHaveProperty('dept_id');
      });
    });

    describe('端到端 CRUD', () => {
      let dept: CnDepartment;

      it('创建实体应正确使用 columnName', async () => {
        dept = new CnDepartment();
        dept.deptName = '研发部';
        dept.deptCode = 'RD001';
        await dept.save();

        const found = await firstValueFrom(CnDepartment.get(dept.id));
        expect(found.deptName).toBe('研发部');
        expect(found.deptCode).toBe('RD001');
      });

      it('带关系的实体创建', async () => {
        const emp = new CnEmployee();
        emp.firstName = '张';
        emp.lastName = '三';
        emp.hireDate = new Date('2024-01-15');
        emp.isActive = true;
        emp.salary = 15000;
        emp.level = 2;
        emp.departmentId = dept.id;
        await emp.save();

        const found = await firstValueFrom(CnEmployee.get(emp.id));
        expect(found.firstName).toBe('张');
        expect(found.lastName).toBe('三');
        expect(found.isActive).toBe(true);
        expect(found.salary).toBe(15000);
        expect(found.level).toBe(2);
        expect(found.departmentId).toBe(dept.id);
      });

      it('更新实体应正确使用 columnName', async () => {
        const emp = new CnEmployee();
        emp.firstName = '李';
        emp.lastName = '四';
        emp.hireDate = new Date('2024-03-01');
        emp.salary = 12000;
        emp.level = 1;
        emp.departmentId = dept.id;
        await emp.save();

        emp.firstName = '李_updated';
        emp.salary = 15000;
        await emp.save();

        const found = await firstValueFrom(CnEmployee.get(emp.id));
        expect(found.firstName).toBe('李_updated');
        expect(found.salary).toBe(15000);
      });

      it('查询应支持通过自定义 columnName 字段过滤', async () => {
        const found = await firstValueFrom(
          CnEmployee.find({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'firstName',
                  operator: '=',
                  value: '张'
                }
              ]
            }
          })
        );
        expect(found.length).toBe(1);
        expect(found[0].firstName).toBe('张');
      });

      it('count 查询应支持自定义 columnName 字段', async () => {
        const count = await firstValueFrom(
          CnEmployee.count({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'isActive',
                  operator: '=',
                  value: true
                }
              ]
            }
          })
        );
        expect(count).toBeGreaterThanOrEqual(1);
      });

      it('ONE_TO_ONE 关系 CRUD', async () => {
        const emp = new CnEmployee();
        emp.firstName = '王';
        emp.lastName = '五';
        emp.hireDate = new Date('2024-06-01');
        emp.salary = 20000;
        emp.level = 3;
        emp.departmentId = dept.id;
        await emp.save();

        const profile = new CnProfile();
        profile.bio = '资深工程师';
        profile.employeeId = emp.id;
        await profile.save();

        const found = await firstValueFrom(CnProfile.get(profile.id));
        expect(found.bio).toBe('资深工程师');
        expect(found.employeeId).toBe(emp.id);
      });
    });
  });

  // ========== test-entity-id-change.spec.ts ==========
  describe(`entity id 变更行为 [${factory.name}]`, () => {
    let adapter: RxDBAdapterSqliteBase;

    beforeAll(async () => {
      adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
    });

    afterAll(async () => {
      if (adapter) {
        await adapter.rxdb.disconnectAll();
      }
    });

    it('new 出来的 entity 可以改 id', () => {
      const todo = new Todo();
      const originalId = todo.id;
      const customId = uuid();
      (todo as { id: string }).id = customId;
      expect(todo.id).toBe(customId);
      expect(todo.id).not.toBe(originalId);
    });

    it('改了 id 再 save，数据库里存的是改后的 id', async () => {
      const todo = new Todo();
      todo.title = 'test-custom-id';
      const customId = uuid();
      (todo as { id: string }).id = customId;

      const statusBefore = getEntityStatus(todo);
      expect(statusBefore.local).toBe(false);

      await todo.save();

      const statusAfter = getEntityStatus(todo);
      expect(statusAfter.local).toBe(true);
      expect(todo.id).toBe(customId);

      const found = await firstValueFrom(Todo.get(customId));
      expect(found.id).toBe(customId);
      expect(found.title).toBe('test-custom-id');
    });

    it('save 后再改 id，实体 id 在内存里变了但 UPDATE 因 WHERE id = 新id 匹配不到行而无效', async () => {
      const todo = new Todo();
      todo.title = 'before-id-change';
      await todo.save();

      const savedId = todo.id;
      const newId = uuid();

      expect(Reflect.set(todo, 'id', newId)).toBe(true);
      todo.title = 'after-id-change';

      await todo.save();

      expect(todo.id).toBe(newId);

      const foundByOld = await firstValueFrom(
        Todo.findOne({ where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: savedId }] } })
      );
      expect(foundByOld?.title).toBe('after-id-change');
      expect(foundByOld?.id).toBe(newId);

      const foundByNew = await firstValueFrom(
        Todo.findOne({ where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: newId }] } })
      );
      expect(foundByNew).toBeNull();
    });
  });

  // ========== RXT-011：SKU 属性的业务唯一性 ==========
  // `SKUAttributes` 只有三条互不关联的 FK（skuId / attributeId / valueId），
  // 「一个 SKU 上同一个属性出现两次」在库里完全合法 —— 查 `sku.attributes` 会拿到
  // 两条冲突记录，下游按属性取值的逻辑只能靠「谁在前面」这种非确定顺序决定。
  // 这条约束必须由数据库承担：应用层去重挡不住并发双写和批量导入。
  describe(`SKU 属性唯一性 [${factory.name}]`, () => {
    let adapter: RxDBAdapterSqliteBase;
    let sku: SKU;
    let otherSku: SKU;
    let mismatchSku: SKU;
    let color: Attribute;
    let size: Attribute;
    let colorWhite: AttributeValue;
    let colorBlack: AttributeValue;
    let sizeS: AttributeValue;

    beforeAll(async () => {
      adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [...ENTITIES] });

      const product = new Product({ name: 'RXT-011 T恤', description: 'SKU 属性唯一性夹具' });
      await product.save();

      sku = new SKU({ code: 'RXT011-A', price: 10, stock: 1 });
      sku.product$.set(product);
      await sku.save();

      otherSku = new SKU({ code: 'RXT011-B', price: 10, stock: 1 });
      otherSku.product$.set(product);
      await otherSku.save();

      mismatchSku = new SKU({ code: 'RXT011-C', price: 10, stock: 1 });
      mismatchSku.product$.set(product);
      await mismatchSku.save();

      color = new Attribute({ name: 'RXT011-颜色' });
      size = new Attribute({ name: 'RXT011-尺寸' });
      await color.save();
      await size.save();

      colorWhite = new AttributeValue({ name: 'RXT011-白' });
      colorBlack = new AttributeValue({ name: 'RXT011-黑' });
      sizeS = new AttributeValue({ name: 'RXT011-S' });
      colorWhite.attribute$.set(color);
      colorBlack.attribute$.set(color);
      sizeS.attribute$.set(size);
      await colorWhite.save();
      await colorBlack.save();
      await sizeS.save();
    });

    afterAll(async () => {
      if (adapter) {
        await adapter.rxdb.disconnectAll();
      }
    });

    it('属性值不属于声明属性时会被数据库拒绝', async () => {
      const conflict = new SKUAttributes();
      conflict.sku$.set(mismatchSku);
      conflict.attribute$.set(size);
      conflict.value$.set(colorWhite);

      await expect(conflict.save()).rejects.toThrow();
    });

    it('同一 SKU 上同一属性再挂一个值会被数据库拒绝', async () => {
      const first = new SKUAttributes();
      first.sku$.set(sku);
      first.attribute$.set(color);
      first.value$.set(colorWhite);
      await first.save();

      // 同一个 (skuId, attributeId)，换个值 —— 这正是「颜色既是白又是黑」的形态
      const conflict = new SKUAttributes();
      conflict.sku$.set(sku);
      conflict.attribute$.set(color);
      conflict.value$.set(colorBlack);

      await expect(conflict.save()).rejects.toThrow();

      const rows = await firstValueFrom(
        SKUAttributes.findAll({
          where: { combinator: 'and', rules: [{ field: 'skuId', operator: '=', value: sku.id }] }
        })
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].valueId).toBe(colorWhite.id);
    });

    it('同一 SKU 上不同属性、以及不同 SKU 复用同一属性都仍然合法', async () => {
      const anotherAttribute = new SKUAttributes();
      anotherAttribute.sku$.set(sku);
      anotherAttribute.attribute$.set(size);
      anotherAttribute.value$.set(sizeS);
      await anotherAttribute.save();

      const anotherSkuSameAttribute = new SKUAttributes();
      anotherSkuSameAttribute.sku$.set(otherSku);
      anotherSkuSameAttribute.attribute$.set(color);
      anotherSkuSameAttribute.value$.set(colorWhite);
      await anotherSkuSameAttribute.save();

      const rows = await firstValueFrom(
        SKUAttributes.findAll({
          where: { combinator: 'and', rules: [{ field: 'skuId', operator: '=', value: sku.id }] }
        })
      );
      expect(rows.map(row => row.attributeId).sort()).toEqual([color.id, size.id].sort());
    });
  });
}
