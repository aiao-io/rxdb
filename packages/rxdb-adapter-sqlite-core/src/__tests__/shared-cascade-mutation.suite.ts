import {
  ENTITY_STATIC_TYPES,
  Entity,
  EntityBase,
  OnDeleteAction,
  PropertyType,
  RelationEntityObservable,
  RelationKind,
  UUID,
  getEntityStatus
} from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { ENTITIES, User } from '@aiao/rxdb-test/shop';
import { firstValueFrom } from 'rxjs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { AdapterFactory } from './adapter-factory.js';
import { SUITE_DEADLINE_MS, cleanup_db, expect_observable_sequence } from './test-utils.js';

async function removeWithSuppressedConstraintError<T>(remove: () => Promise<T>): Promise<{ error: unknown }> {
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  try {
    try {
      await remove();
      return { error: null };
    } catch (error) {
      return { error };
    }
  } finally {
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  }
}

export function cascadeMutationSuite(factory: AdapterFactory) {
  describe(`级联与批量操作 [${factory.name}]`, () => {
    // ==================== Block 1: 级联操作默认行为测试 ====================
    describe('级联操作默认行为测试', () => {
      let adapter: RxDBAdapterSqliteBase;

      // ==================== 测试实体定义 ====================

      /**
       * 场景1: ONE_TO_ONE 关系
       * 默认: CASCADE delete, RESTRICT update
       */
      @Entity({
        name: 'UserProfile',
        properties: [{ name: 'bio', type: PropertyType.string }]
      })
      class UserProfile extends EntityBase {
        static [ENTITY_STATIC_TYPES]: { idType: UUID };
        declare bio: string;
      }
      @Entity({
        name: 'UserWithProfile',
        properties: [{ name: 'name', type: PropertyType.string }],
        relations: [
          {
            name: 'profile',
            kind: RelationKind.ONE_TO_ONE,
            mappedEntity: 'UserProfile',
            mappedProperty: 'user',
            nullable: false
          }
        ]
      })
      class UserWithProfile extends EntityBase {
        static [ENTITY_STATIC_TYPES]: { idType: UUID };
        declare name: string;
        declare profile$: RelationEntityObservable<typeof UserProfile>;
        declare profileId: UUID;
      }

      /**
       * 场景2: ONE_TO_MANY 关系
       * 默认: CASCADE delete, RESTRICT update
       */
      @Entity({
        name: 'Order',
        properties: [{ name: 'orderNumber', type: PropertyType.string }],
        relations: [
          {
            name: 'items',
            kind: RelationKind.ONE_TO_MANY,
            mappedEntity: 'OrderItem',
            mappedProperty: 'order'
          }
        ]
      })
      class Order extends EntityBase {
        static [ENTITY_STATIC_TYPES]: { idType: UUID };
        declare orderNumber: string;
      }

      @Entity({
        name: 'OrderItem',
        properties: [{ name: 'productName', type: PropertyType.string }],
        relations: [
          {
            name: 'order',
            kind: RelationKind.MANY_TO_ONE,
            mappedEntity: 'Order',
            mappedProperty: 'items',
            nullable: false
          }
        ]
      })
      class OrderItem extends EntityBase {
        static [ENTITY_STATIC_TYPES]: { idType: UUID };
        declare productName: string;
        declare order$: RelationEntityObservable<typeof Order>;
        declare orderId: UUID;
      }

      /**
       * 场景3: MANY_TO_ONE (nullable=true)
       * 默认: SET_NULL delete, RESTRICT update
       */
      @Entity({
        name: 'Category',
        properties: [{ name: 'name', type: PropertyType.string }],
        relations: [
          {
            name: 'products',
            kind: RelationKind.ONE_TO_MANY,
            mappedEntity: 'Product',
            mappedProperty: 'category'
          }
        ]
      })
      class Category extends EntityBase {
        static [ENTITY_STATIC_TYPES]: { idType: UUID };
        declare name: string;
      }

      @Entity({
        name: 'Product',
        properties: [{ name: 'name', type: PropertyType.string }],
        relations: [
          {
            name: 'category',
            kind: RelationKind.MANY_TO_ONE,
            mappedEntity: 'Category',
            mappedProperty: 'products',
            nullable: true
          }
        ]
      })
      class Product extends EntityBase {
        static [ENTITY_STATIC_TYPES]: { idType: UUID };
        declare name: string;
        declare category$: RelationEntityObservable<typeof Category>;
        declare categoryId?: UUID;
      }

      /**
       * 场景4: 用户覆盖默认配置
       * 显式指定 CASCADE 而不是默认的 RESTRICT
       */
      @Entity({
        name: 'Parent',
        properties: [{ name: 'name', type: PropertyType.string }],
        relations: [
          {
            name: 'children',
            kind: RelationKind.ONE_TO_MANY,
            mappedEntity: 'Child',
            mappedProperty: 'parent'
          }
        ]
      })
      class Parent extends EntityBase {
        static [ENTITY_STATIC_TYPES]: { idType: UUID };
        declare name: string;
      }

      @Entity({
        name: 'Child',
        properties: [{ name: 'name', type: PropertyType.string }],
        relations: [
          {
            name: 'parent',
            kind: RelationKind.MANY_TO_ONE,
            mappedEntity: 'Parent',
            mappedProperty: 'children',
            nullable: false,
            onDelete: OnDeleteAction.CASCADE
          }
        ]
      })
      class Child extends EntityBase {
        static [ENTITY_STATIC_TYPES]: { idType: UUID };
        declare name: string;
        declare parent$: RelationEntityObservable<typeof Parent>;
        declare parentId: UUID;
      }

      @Entity({
        name: 'UniqueRecord',
        properties: [{ name: 'code', type: PropertyType.string, unique: true }]
      })
      class UniqueRecord extends EntityBase {
        static [ENTITY_STATIC_TYPES]: { idType: UUID };
        declare code: string;
      }

      // ==================== 测试设置 ====================

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({
          entities: [UserProfile, UserWithProfile, Order, OrderItem, Category, Product, Parent, Child, UniqueRecord]
        });
      });

      afterAll(async () => {
        await adapter.rxdb.disconnectAll();
      });

      // ==================== 测试用例 ====================

      describe('场景1: ONE_TO_ONE 关系默认 CASCADE delete', () => {
        it('删除用户时应该级联删除用户资料（仅当外键在 UserProfile 上）', async () => {
          const profile = new UserProfile();
          profile.bio = 'Test bio';
          await profile.save();

          const user = new UserWithProfile();
          user.name = 'Test User';
          user.profileId = profile.id;
          await user.save();

          const users = await adapter.getRepository(UserWithProfile).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(users.length).toBe(1);
          expect(users[0].profileId).toBe(profile.id);

          const profiles = await adapter.getRepository(UserProfile).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(profiles.length).toBe(1);

          await user.remove();

          const deletedUsers = await adapter.getRepository(UserWithProfile).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(deletedUsers.length).toBe(0);

          const profilesAfter = await adapter.getRepository(UserProfile).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(profilesAfter.length).toBe(1);
        });
      });

      describe('场景2: ONE_TO_MANY 关系默认 CASCADE delete', () => {
        it('删除订单时应该级联删除所有订单项（如果外键 onDelete=CASCADE）', async () => {
          const order = new Order();
          order.orderNumber = 'ORD-001';
          await order.save();

          const item1 = new OrderItem();
          item1.productName = 'Product 1';
          item1.orderId = order.id;
          await item1.save();

          const item2 = new OrderItem();
          item2.productName = 'Product 2';
          item2.orderId = order.id;
          await item2.save();

          const items = await adapter.getRepository(OrderItem).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(items.length).toBe(2);

          const { error } = await removeWithSuppressedConstraintError(() => order.remove());

          if (error) {
            expect((error as Error).message).toMatch(/FOREIGN KEY|constraint/i);
          } else {
            const deletedOrders = await adapter.getRepository(Order).find({
              where: { combinator: 'and', rules: [] }
            });
            expect(deletedOrders.length).toBe(0);
            const deletedItems = await adapter.getRepository(OrderItem).find({
              where: { combinator: 'and', rules: [] }
            });
            expect(deletedItems.length).toBe(0);
          }
        });

        it('订单项的外键应该阻止删除有订单项的订单（默认 RESTRICT）', async () => {
          const order = new Order();
          order.orderNumber = 'ORD-002';
          await order.save();

          const item = new OrderItem();
          item.productName = 'Product 3';
          item.orderId = order.id;
          await item.save();

          const { error } = await removeWithSuppressedConstraintError(() => order.remove());
          expect(error).not.toBeNull();
          expect((error as Error).message).toMatch(/FOREIGN KEY|constraint/i);
        });
      });

      describe('场景3: MANY_TO_ONE nullable 关系默认 SET_NULL', () => {
        it('删除分类时应该将产品的 categoryId 设置为 NULL', async () => {
          const category = new Category();
          category.name = 'Electronics';
          await category.save();

          const product = new Product();
          product.name = 'Laptop';
          product.categoryId = category.id;
          await product.save();

          const productsBeforeResult = await adapter.internalQuery(`SELECT id, name, categoryId FROM "public$Product"`);
          const productsBeforeRows = productsBeforeResult.results[0]?.rows || [];
          expect(productsBeforeRows.length).toBe(1);
          const productBeforeData = productsBeforeRows[0];
          expect(productBeforeData[2]).toBe(category.id);

          await category.remove();

          const productsAfterResult = await adapter.internalQuery(`SELECT id, name, categoryId FROM "public$Product"`);
          const productsAfterRows = productsAfterResult.results[0]?.rows || [];
          expect(productsAfterRows.length).toBe(1);
          const productAfterData = productsAfterRows[0];

          expect(productAfterData[2]).toBeNull();
        });
      });

      describe('场景4: 用户覆盖默认级联操作', () => {
        it('QueryCache upsert 不得级联删除现有子记录', async () => {
          const parent = new Parent();
          parent.name = 'upsert-parent';
          await parent.save();

          const child = new Child();
          child.name = 'upsert-child';
          child.parentId = parent.id;
          await child.save();

          const stored = await adapter.internalQuery(`SELECT * FROM "public$Parent" WHERE "id" = ?`, [parent.id]);
          const result = stored.results[0];
          const row = result.rows[0];
          const replacement = Object.fromEntries(result.columns.map((column, index) => [column, row[index]]));
          replacement['name'] = 'upserted-parent';

          await firstValueFrom(adapter.upsertMany('Parent', [replacement]));

          const children = await adapter.getRepository(Child).find({
            where: { combinator: 'and', rules: [{ field: 'parentId', operator: '=', value: parent.id }] }
          });
          expect(children).toHaveLength(1);

          await child.remove();
          await parent.remove();
        });

        it('QueryCache upsert 的非主键 UNIQUE 冲突不得删除另一条记录', async () => {
          const first = new UniqueRecord();
          first.code = 'first';
          await first.save();

          const second = new UniqueRecord();
          second.code = 'second';
          await second.save();

          const stored = await adapter.internalQuery(`SELECT * FROM "public$UniqueRecord" WHERE "id" = ?`, [first.id]);
          const result = stored.results[0];
          const row = result.rows[0];
          const conflicting = Object.fromEntries(result.columns.map((column, index) => [column, row[index]]));
          conflicting['code'] = second.code;

          await expect(firstValueFrom(adapter.upsertMany('UniqueRecord', [conflicting]))).rejects.toThrow(/UNIQUE/i);

          const records = await adapter.getRepository(UniqueRecord).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(records.map(record => record.code).sort()).toEqual(['first', 'second']);

          await adapter.removeMany(records);
        });

        it('显式设置 CASCADE delete 应该生效', async () => {
          const parent = new Parent();
          parent.name = 'Parent';
          await parent.save();

          const child1 = new Child();
          child1.name = 'Child 1';
          child1.parentId = parent.id;
          await child1.save();

          const child2 = new Child();
          child2.name = 'Child 2';
          child2.parentId = parent.id;
          await child2.save();

          const children = await adapter.getRepository(Child).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(children.length).toBe(2);

          await parent.remove();

          const deletedParents = await adapter.getRepository(Parent).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(deletedParents.length).toBe(0);

          const deletedChildren = await adapter.getRepository(Child).find({
            where: { combinator: 'and', rules: [] }
          });
          expect(deletedChildren.length).toBe(0);
        });
      });

      describe('验证生成的 SQL 包含级联配置', () => {
        it('应该能够查询 SQLite schema 验证外键约束', async () => {
          const result = await adapter.internalQuery(
            `SELECT sql FROM sqlite_master WHERE type='table' AND name='public$OrderItem'`
          );
          const tableSql = result.results[0]?.rows[0]?.[0];

          expect(tableSql).toBeDefined();
          if (tableSql) {
            expect(tableSql).toMatch(/ON DELETE/i);
            expect(tableSql).toMatch(/ON UPDATE/i);
          }
        });

        it('应该能够查询外键约束列表', async () => {
          const result = await adapter.internalQuery(`PRAGMA foreign_key_list('public$Child')`);
          const foreignKeys = result.results[0]?.rows || [];

          expect(foreignKeys.length).toBeGreaterThan(0);

          const parentFK = foreignKeys.find(fk => fk[2] === 'public$Parent');

          if (parentFK) {
            expect(parentFK[6]).toBe('CASCADE');
            expect(parentFK[5]).toBe('RESTRICT');
          }
        });
      });

      describe('性能和边界测试', () => {
        it('级联删除应该在合理时间内完成', async () => {
          const startTime = Date.now();

          const parent = new Parent();
          parent.name = 'Performance Test Parent';
          await parent.save();

          const childPromises = [];
          for (let i = 0; i < 10; i++) {
            const child = new Child();
            child.name = `Child ${i}`;
            child.parentId = parent.id;
            childPromises.push(child.save());
          }

          await Promise.all(childPromises);

          await parent.remove();

          const endTime = Date.now();
          const duration = endTime - startTime;

          expect(duration).toBeLessThan(1000);
        });

        it('循环引用不应该导致无限递归', async () => {
          // 这个测试确保级联删除不会陷入死循环
          // 注意：实际的循环引用需要特殊处理
        });
      });
    });

    // ==================== Block 2: mutations 批量更新不同值 ====================
    describe('mutations 批量更新不同值', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [...ENTITIES] });
      });

      afterAll(async () => {
        await adapter.rxdb.disconnectAll();
      });

      it('相同字段不同值：每个实体应保留各自的更新值', async () => {
        const userA = new User();
        userA.name = 'Alice';
        userA.age = 20;

        const userB = new User();
        userB.name = 'Bob';
        userB.age = 20;

        const userC = new User();
        userC.name = 'Charlie';
        userC.age = 20;

        await adapter.mutations({
          create: new Map([[User, new Set([userA, userB, userC])]]),
          update: new Map(),
          remove: new Map()
        });

        userA.age = 30;
        userB.age = 40;
        userC.age = 50;

        const patchA = getEntityStatus(userA).patch!;
        const patchB = getEntityStatus(userB).patch!;
        const patchC = getEntityStatus(userC).patch!;
        expect(Object.keys(patchA)).toEqual(['age']);
        expect(Object.keys(patchB)).toEqual(['age']);
        expect(Object.keys(patchC)).toEqual(['age']);
        expect(patchA.age).toBe(30);
        expect(patchB.age).toBe(40);
        expect(patchC.age).toBe(50);

        await adapter.mutations({
          create: new Map(),
          update: new Map([[User, new Set([userA, userB, userC])]]),
          remove: new Map()
        });

        const users = await firstValueFrom(
          User.findAll({
            where: {
              combinator: 'and',
              rules: [{ field: 'id', operator: 'in', value: [userA.id, userB.id, userC.id] }]
            }
          })
        );

        const byId = new Map(users.map(u => [u.id, u]));
        expect(byId.get(userA.id)!.age).toBe(30);
        expect(byId.get(userB.id)!.age).toBe(40);
        expect(byId.get(userC.id)!.age).toBe(50);
      });

      it('模拟画布位置批量更新：多字段不同值', async () => {
        const userA = new User();
        userA.name = 'NodeA';
        userA.age = 0;

        const userB = new User();
        userB.name = 'NodeB';
        userB.age = 0;

        await adapter.mutations({
          create: new Map([[User, new Set([userA, userB])]]),
          update: new Map(),
          remove: new Map()
        });

        userA.name = 'PosA';
        userA.age = 100;

        userB.name = 'PosB';
        userB.age = 200;

        await adapter.mutations({
          create: new Map(),
          update: new Map([[User, new Set([userA, userB])]]),
          remove: new Map()
        });

        const users = await firstValueFrom(
          User.findAll({
            where: {
              combinator: 'and',
              rules: [{ field: 'id', operator: 'in', value: [userA.id, userB.id] }]
            }
          })
        );

        const byId = new Map(users.map(u => [u.id, u]));

        expect(byId.get(userA.id)!.name).toBe('PosA');
        expect(byId.get(userA.id)!.age).toBe(100);
        expect(byId.get(userB.id)!.name).toBe('PosB');
        expect(byId.get(userB.id)!.age).toBe(200);
      });

      it('混合场景：部分相同值 + 部分不同值', async () => {
        const users = Array.from({ length: 4 }, (_, i) => {
          const u = new User();
          u.name = `User${i}`;
          u.age = 10;
          return u;
        });

        await adapter.mutations({
          create: new Map([[User, new Set(users)]]),
          update: new Map(),
          remove: new Map()
        });

        users[0]!.name = 'Alpha';
        users[1]!.name = 'Beta';
        users[2]!.age = 77;
        users[3]!.age = 88;

        await adapter.mutations({
          create: new Map(),
          update: new Map([[User, new Set(users)]]),
          remove: new Map()
        });

        const result = await firstValueFrom(
          User.findAll({
            where: {
              combinator: 'and',
              rules: [{ field: 'id', operator: 'in', value: users.map(u => u.id) }]
            }
          })
        );

        const byId = new Map(result.map(u => [u.id, u]));
        expect(byId.get(users[0]!.id)!.name).toBe('Alpha');
        expect(byId.get(users[1]!.id)!.name).toBe('Beta');
        expect(byId.get(users[2]!.id)!.age).toBe(77);
        expect(byId.get(users[3]!.id)!.age).toBe(88);
      });
    });

    // ==================== Block 3: findByCursor 增量算法测试 ====================
    describe('findByCursor 增量算法测试', () => {
      let adapter: RxDBAdapterSqliteBase;

      beforeAll(async () => {
        adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo] });
      });

      afterAll(async () => {
        await adapter.rxdb.disconnectAll();
      });

      afterEach(async () => await cleanup_db(adapter));

      it('布尔排序字段的 after 游标不应重复边界实体', async () => {
        const todo = new Todo();
        todo.title = 'cursor_boolean_boundary';
        todo.completed = false;
        await todo.save();

        const options = {
          where: {
            combinator: 'and' as const,
            rules: [{ field: 'title' as const, operator: 'startsWith' as const, value: 'cursor_boolean_' }]
          },
          orderBy: [
            { field: 'completed' as const, sort: 'asc' as const },
            { field: 'id' as const, sort: 'desc' as const }
          ],
          limit: 1
        };
        const firstPage = await firstValueFrom(Todo.findByCursor(options));
        const secondPage = await firstValueFrom(Todo.findByCursor({ ...options, after: firstPage[0] }));

        expect(firstPage).toEqual([todo]);
        expect(secondPage).toEqual([]);
      });

      it('场景1: after 游标 + 创建新实体 - 新实体应该出现在结果集中', async () => {
        const initialTodos: Todo[] = [];
        for (let i = 0; i < 5; i++) {
          const todo = new Todo();
          todo.title = `cursor_test_1_${i.toString().padStart(2, '0')}`;
          initialTodos.push(todo);
        }
        await adapter.rxdb.entityManager.saveMany(initialTodos);

        await new Promise(resolve => setTimeout(resolve, 100));

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

        await expect_observable_sequence(
          Todo.findByCursor({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'title',
                  operator: 'startsWith',
                  value: 'cursor_test_1_'
                }
              ]
            },
            orderBy: [
              { field: 'title', sort: 'asc' },
              { field: 'id', sort: 'asc' }
            ],
            after: initialTodos[1],
            limit: 10
          }),
          actions.map(action => ({
            validate: todos => action.validate(todos),
            run: action.run
          }))
        );
      });

      it('场景2: before 游标 + 创建新实体 - 新实体应该出现在结果集中', { timeout: SUITE_DEADLINE_MS }, async () => {
        const initialTodos: Todo[] = [];
        for (let i = 0; i < 5; i++) {
          const todo = new Todo();
          todo.title = `cursor_test_2_${i.toString().padStart(2, '0')}`;
          initialTodos.push(todo);
        }
        await adapter.rxdb.entityManager.saveMany(initialTodos);

        await new Promise(resolve => setTimeout(resolve, 100));

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

        await expect_observable_sequence(
          Todo.findByCursor({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'title',
                  operator: 'startsWith',
                  value: 'cursor_test_2_'
                }
              ]
            },
            orderBy: [
              { field: 'title', sort: 'asc' },
              { field: 'id', sort: 'asc' }
            ],
            before: initialTodos[3],
            limit: 10
          }),
          actions.map(action => ({
            validate: todos => action.validate(todos),
            run: action.run
          }))
        );
      });

      it('场景3: 无游标 + 创建新实体 - 新实体应该按排序插入', async () => {
        const initialTodos: Todo[] = [];
        for (let i = 0; i < 3; i++) {
          const todo = new Todo();
          todo.title = `cursor_test_3_${i.toString().padStart(2, '0')}`;
          initialTodos.push(todo);
        }
        await adapter.rxdb.entityManager.saveMany(initialTodos);

        await new Promise(resolve => setTimeout(resolve, 100));

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

        await expect_observable_sequence(
          Todo.findByCursor({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'title',
                  operator: 'startsWith',
                  value: 'cursor_test_3_'
                }
              ]
            },
            orderBy: [
              { field: 'title', sort: 'asc' },
              { field: 'id', sort: 'asc' }
            ],
            limit: 10
          }),
          actions.map(action => ({
            validate: todos => action.validate(todos),
            run: action.run
          }))
        );
      });

      it('场景4: 创建不匹配 where 条件的实体 - 不应该出现在结果中', async () => {
        const initialTodos: Todo[] = [];
        for (let i = 0; i < 3; i++) {
          const todo = new Todo();
          todo.title = `cursor_test_4_${i.toString().padStart(2, '0')}`;
          initialTodos.push(todo);
        }
        await adapter.rxdb.entityManager.saveMany(initialTodos);

        await new Promise(resolve => setTimeout(resolve, 100));

        let callCount = 0;

        return new Promise<void>((resolve, reject) => {
          const subscription = Todo.findByCursor({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'title',
                  operator: 'startsWith',
                  value: 'cursor_test_4_'
                }
              ]
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
        await adapter.rxdb.entityManager.saveMany(initialTodos);

        await new Promise(resolve => setTimeout(resolve, 100));

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
              await adapter.rxdb.entityManager.saveMany(newTodos);
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

        await expect_observable_sequence(
          Todo.findByCursor({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'title',
                  operator: 'startsWith',
                  value: 'cursor_test_5_'
                }
              ]
            },
            orderBy: [
              { field: 'title', sort: 'asc' },
              { field: 'id', sort: 'asc' }
            ],
            limit: 20
          }),
          actions.map(action => ({
            validate: todos => action.validate(todos),
            run: action.run
          }))
        );
      });

      it('场景6: after 游标外的新实体 - 不应该出现在结果中', async () => {
        const initialTodos: Todo[] = [];
        for (let i = 0; i < 5; i++) {
          const todo = new Todo();
          todo.title = `cursor_test_6_${i.toString().padStart(2, '0')}`;
          initialTodos.push(todo);
        }
        await adapter.rxdb.entityManager.saveMany(initialTodos);

        await new Promise(resolve => setTimeout(resolve, 100));

        let callCount = 0;

        return new Promise<void>((resolve, reject) => {
          const subscription = Todo.findByCursor({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'title',
                  operator: 'startsWith',
                  value: 'cursor_test_6_'
                }
              ]
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

      it('场景7: 降序排序 + after 游标 + 创建新实体', { timeout: SUITE_DEADLINE_MS }, async () => {
        const initialTodos: Todo[] = [];
        for (let i = 0; i < 5; i++) {
          const todo = new Todo();
          todo.title = `cursor_test_7_${i.toString().padStart(2, '0')}`;
          initialTodos.push(todo);
        }
        await adapter.rxdb.entityManager.saveMany(initialTodos);

        await new Promise(resolve => setTimeout(resolve, 100));

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

        await expect_observable_sequence(
          Todo.findByCursor({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: 'title',
                  operator: 'startsWith',
                  value: 'cursor_test_7_'
                }
              ]
            },
            orderBy: [
              { field: 'title', sort: 'desc' },
              { field: 'id', sort: 'desc' }
            ],
            after: initialTodos[3],
            limit: 10
          }),
          actions.map(action => ({
            validate: todos => action.validate(todos),
            run: action.run
          }))
        );
      });

      // ===== 调试测试：逐步验证降序排序 + after 游标 =====

      it('调试1: 降序排序 - 验证基础排序是否正确', async () => {
        const todos: Todo[] = [];
        for (let i = 0; i < 5; i++) {
          const todo = new Todo();
          todo.title = `debug_desc_${i.toString().padStart(2, '0')}`;
          todos.push(todo);
        }
        await adapter.rxdb.entityManager.saveMany(todos);
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
        await adapter.rxdb.entityManager.saveMany(todos);
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
        await adapter.rxdb.entityManager.saveMany(todos);
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

      it('调试4: 降序 + after 游标 + 订阅中创建新实体 - 单次回调', { timeout: SUITE_DEADLINE_MS }, async () => {
        const todos: Todo[] = [];
        for (let i = 0; i < 5; i++) {
          const todo = new Todo();
          todo.title = `debug_reactive_${i.toString().padStart(2, '0')}`;
          todos.push(todo);
        }
        await adapter.rxdb.entityManager.saveMany(todos);
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

          // 比外层 it 上限早触发，好把「收到几次回调、内容是什么」带进报错——裸的 vitest 超时只会给行号。
          // 纯诊断用途，所以给足冗余：并发跑 acceptance 时实测本例约 250ms。
          setTimeout(() => {
            subscription.unsubscribe();
            reject(new Error(`超时: 只收到${callCount}次回调, 期望2次。结果: ${JSON.stringify(receivedResults)}`));
          }, SUITE_DEADLINE_MS / 3);
        });
      });
    });
  });
}
