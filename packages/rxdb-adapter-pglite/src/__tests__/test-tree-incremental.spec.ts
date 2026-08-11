import { RxDB, SyncType } from '@aiao/rxdb';
import { MenuLarge } from '@aiao/rxdb-test/entities';
import { beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../index.js';
import { generateDbName } from './test-utils.js';

describe('树结构增量算法测试 - CREATE 事件', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: generateDbName(),
      context: { userId: 'userId' },
      entities: [MenuLarge],
      sync: {
        local: {
          adapter: 'pglite'
        },
        type: SyncType.None
      }
    });

    rxdb.adapter('pglite', db => {
      return new RxDBAdapterPGlite(db, {
        store: 'memory'
      });
    });
    adapter = await rxdb.getAdapter('pglite');
    rxdb.init();
  });

  afterEach(async () => {
    adapter.rxdb.entityManager.cleanAllCache();
  });

  describe('findDescendants - CREATE 事件增量更新', () => {
    it('应该在创建新子节点时自动更新查询结果', async () => {
      const root = new MenuLarge({ title: '根节点' });
      const child1 = new MenuLarge({ title: '子节点1' });
      root.children$.add(child1);
      await root.save();

      const child2 = new MenuLarge({ title: '子节点2' });

      let index = 0;
      const actions = [
        {
          result: { length: 2, titles: ['根节点', '子节点1'] },
          run: async () => {
            root.children$.add(child2);
            await child2.save();
          }
        },
        {
          result: { length: 3, titles: ['根节点', '子节点1', '子节点2'] }
        }
      ];

      return new Promise<void>((resolve, reject) => {
        const subscription = MenuLarge.findDescendants({ entityId: root.id, level: 100 }).subscribe({
          next: data => {
            try {
              const action = actions[index];
              expect(data.length).toBe(action.result.length);
              expect(data.map(m => m.title)).toEqual(action.result.titles);
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

    it('应该在创建孙子节点时自动更新查询结果', async () => {
      // 根节点标题必须逐用例唯一：本文件只在 afterEach 里 cleanAllCache()（清缓存、不删行），
      // 而 MenuLarge 的 (parentId, title) 现在是数据库级唯一约束（RXT-016）——
      // 根节点的 parentId 都是 NULL，各用例复用同一个标题会直接被 INSERT 拦下。
      // 非根节点不受影响：它们的 parentId 是各自父节点的 id，元组天然不同。
      const root = new MenuLarge({ title: '孙子用例根' });
      const child = new MenuLarge({ title: '子节点' });
      root.children$.add(child);
      await root.save();

      const grandchild = new MenuLarge({ title: '孙子节点' });

      let index = 0;
      const actions = [
        {
          result: { length: 2, titles: ['孙子用例根', '子节点'] },
          run: async () => {
            child.children$.add(grandchild);
            await grandchild.save();
          }
        },
        {
          result: { length: 3, titles: ['孙子用例根', '子节点', '孙子节点'] }
        }
      ];

      return new Promise<void>((resolve, reject) => {
        const subscription = MenuLarge.findDescendants({ entityId: root.id, level: 100 }).subscribe({
          next: data => {
            try {
              const action = actions[index];
              expect(data.length).toBe(action.result.length);
              expect(data.map(m => m.title)).toEqual(action.result.titles);
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

    it('不应该在创建不相关节点时触发更新', async () => {
      // 根节点标题逐用例唯一，理由见「应该在创建孙子节点时自动更新查询结果」。
      const root = new MenuLarge({ title: '无关节点用例根' });
      const child = new MenuLarge({ title: '子节点' });
      root.children$.add(child);
      await root.save();

      let callCount = 0;

      return new Promise<void>((resolve, reject) => {
        const subscription = MenuLarge.findDescendants({ entityId: root.id, level: 100 }).subscribe({
          next: data => {
            try {
              callCount++;
              expect(data.length).toBe(2);

              if (callCount === 1) {
                const otherRoot = new MenuLarge({ title: '其他根节点' });
                otherRoot.save().catch(reject);
                setTimeout(() => {
                  subscription.unsubscribe();
                  expect(callCount).toBe(1);
                  resolve();
                }, 150);
              } else {
                subscription.unsubscribe();
                reject(new Error('不应该触发更新'));
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

    it('应该支持 level=1 时只增量更新直接子节点', async () => {
      // 根节点标题逐用例唯一，理由见「应该在创建孙子节点时自动更新查询结果」。
      const root = new MenuLarge({ title: 'level1 用例根' });
      const child = new MenuLarge({ title: '子节点' });
      root.children$.add(child);
      await root.save();

      let callCount = 0;

      return new Promise<void>((resolve, reject) => {
        const subscription = MenuLarge.findDescendants({ entityId: root.id, level: 1 }).subscribe({
          next: data => {
            try {
              callCount++;
              expect(data.length).toBe(2);

              if (callCount === 1) {
                const grandchild = new MenuLarge({ title: '孙子节点' });
                child.children$.add(grandchild);
                grandchild.save().catch(reject);
                setTimeout(() => {
                  subscription.unsubscribe();
                  expect(callCount).toBe(1);
                  resolve();
                }, 150);
              } else {
                subscription.unsubscribe();
                reject(new Error('level=1 时不应该因为孙子节点而触发更新'));
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

    it('应该支持批量创建多个后代节点', async () => {
      // 根节点标题逐用例唯一，理由见「应该在创建孙子节点时自动更新查询结果」。
      const root = new MenuLarge({ title: '批量用例根' });
      await root.save();

      const child1 = new MenuLarge({ title: '子节点1' });
      const child2 = new MenuLarge({ title: '子节点2' });

      let index = 0;
      const actions = [
        {
          result: { length: 1 },
          run: async () => {
            root.children$.add(child1);
            await child1.save();
          }
        },
        {
          result: { length: 2 },
          run: async () => {
            root.children$.add(child2);
            await child2.save();
          }
        },
        {
          result: { minLength: 3, titles: ['子节点1', '子节点2', '批量用例根'] }
        }
      ];

      return new Promise<void>((resolve, reject) => {
        const subscription = MenuLarge.findDescendants({ entityId: root.id, level: 100 }).subscribe({
          next: data => {
            try {
              const action = actions[index];
              if (action.result.minLength !== undefined) {
                expect(data.length).toBeGreaterThanOrEqual(action.result.minLength);
                expect(data.map(m => m.title).sort()).toEqual(action.result.titles!.sort());
              } else {
                expect(data.length).toBe(action.result.length);
              }

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

    it('应该在查询根节点时增量添加新的根节点', async () => {
      const root1 = new MenuLarge({ title: '根节点1' });
      await root1.save();

      const root2 = new MenuLarge({ title: '根节点2' });

      let index = 0;
      const actions: {
        validate: (data: MenuLarge[], prevCount?: number) => number | undefined;
        run?: () => Promise<void>;
      }[] = [
        {
          validate: (data: MenuLarge[]) => {
            const initialCount = data.length;
            expect(initialCount).toBeGreaterThanOrEqual(1);
            return initialCount;
          },
          run: async () => {
            await root2.save();
          }
        },
        {
          validate: (data: MenuLarge[], prevCount?: number) => {
            expect(data.length).toBe((prevCount || 0) + 1);
            return undefined;
          }
        }
      ];

      return new Promise<void>((resolve, reject) => {
        let prevCount: number | undefined;
        const subscription = MenuLarge.findDescendants({ level: 100 }).subscribe({
          next: data => {
            try {
              const action = actions[index];
              const result = action.validate(data, prevCount);
              if (result !== undefined) {
                prevCount = result;
              }

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
  });

  describe('边界情况测试', () => {
    it('应该处理空初始结果的情况', async () => {
      const root = new MenuLarge({ title: '孤立根节点' });
      await root.save();

      const child = new MenuLarge({ title: '第一个子节点' });

      let index = 0;
      const actions = [
        {
          result: { length: 1 },
          run: async () => {
            root.children$.add(child);
            await child.save();
          }
        },
        {
          result: { length: 2 }
        }
      ];

      return new Promise<void>((resolve, reject) => {
        const subscription = MenuLarge.findDescendants({ entityId: root.id, level: 100 }).subscribe({
          next: data => {
            try {
              const action = actions[index];
              expect(data.length).toBe(action.result.length);

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

    it('应该处理深层嵌套的情况', async () => {
      // 根节点标题逐用例唯一，理由见「应该在创建孙子节点时自动更新查询结果」。
      const root = new MenuLarge({ title: '深层嵌套根' });
      const level1 = new MenuLarge({ title: 'Level 1' });
      const level2 = new MenuLarge({ title: 'Level 2' });
      const level3 = new MenuLarge({ title: 'Level 3' });

      root.children$.add(level1);
      level1.children$.add(level2);
      level2.children$.add(level3);
      await root.save();

      const level4 = new MenuLarge({ title: 'Level 4' });

      let index = 0;
      const actions = [
        {
          result: { length: 4 },
          run: async () => {
            level3.children$.add(level4);
            await level4.save();
          }
        },
        {
          result: { length: 5 }
        }
      ];

      return new Promise<void>((resolve, reject) => {
        const subscription = MenuLarge.findDescendants({ entityId: root.id, level: 100 }).subscribe({
          next: data => {
            try {
              const action = actions[index];
              expect(data.length).toBe(action.result.length);

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
  });
});
