import { RxDB, SyncType } from '@aiao/rxdb';
import { MenuLarge } from '@aiao/rxdb-test/entities';
import { beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../index.js';
import { cleanup_db, generateDbName } from './test-utils.js';

describe('树结构增量算法测试 - REMOVE 事件', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: generateDbName(),
      context: { userId: 'userId' },
      entities: [MenuLarge],
      sync: {
        local: { adapter: 'pglite' },
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
    await cleanup_db(adapter);
  });

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  describe('findDescendants - 删除增量更新', () => {
    it('删除叶子节点应从结果中移除', async () => {
      const root = new MenuLarge({ title: 'root' });
      const child1 = new MenuLarge({ title: 'child1' });
      const child2 = new MenuLarge({ title: 'child2' });
      root.children$.add(child1);
      root.children$.add(child2);
      await root.save();

      let index = 0;
      const actions = [
        {
          result: 3,
          run: async () => {
            await child1.remove();
          }
        },
        {
          result: 2
        }
      ];

      return new Promise<void>((resolve, reject) => {
        const sub = MenuLarge.findDescendants({ entityId: root.id, level: 100 }).subscribe({
          next: d => {
            try {
              const action = actions[index];
              expect(d.length).toBe(action.result);
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

    it('删除中间节点应连带移除其所有后代', async () => {
      const root = new MenuLarge({ title: 'root' });
      const child = new MenuLarge({ title: 'child' });
      const grand1 = new MenuLarge({ title: 'grand1' });
      const grand2 = new MenuLarge({ title: 'grand2' });
      root.children$.add(child);
      child.children$.add(grand1);
      child.children$.add(grand2);
      await root.save();

      let index = 0;
      const actions = [
        {
          result: 4,
          run: async () => {
            await child.remove();
          }
        },
        {
          result: 1
        }
      ];

      return new Promise<void>((resolve, reject) => {
        const sub = MenuLarge.findDescendants({ entityId: root.id, level: 100 }).subscribe({
          next: d => {
            try {
              const action = actions[index];
              expect(d.length).toBe(action.result);
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

    it('删除非后代不应触发更新', async () => {
      const root = new MenuLarge({ title: 'root' });
      const child = new MenuLarge({ title: 'child' });
      root.children$.add(child);
      await root.save();

      const otherRoot = new MenuLarge({ title: 'other' });
      await otherRoot.save();

      const lengths: number[] = [];
      const sub = MenuLarge.findDescendants({ entityId: root.id, level: 100 }).subscribe(d => lengths.push(d.length));

      await new Promise(r => setTimeout(r, 120));
      expect(lengths[0]).toBe(2);

      await otherRoot.remove();
      await new Promise(r => setTimeout(r, 150));

      expect(lengths.length).toBe(1);
      expect(lengths[0]).toBe(2);

      sub.unsubscribe();
    });

    it('level=1：删除直接子节点应更新结果', async () => {
      const root = new MenuLarge({ title: 'root' });
      const child = new MenuLarge({ title: 'child' });
      const grand = new MenuLarge({ title: 'grand' });
      root.children$.add(child);
      child.children$.add(grand);
      await root.save();

      let index = 0;
      const actions = [
        {
          result: 2,
          run: async () => {
            await child.remove();
          }
        },
        {
          result: 1
        }
      ];

      return new Promise<void>((resolve, reject) => {
        const sub = MenuLarge.findDescendants({ entityId: root.id, level: 1 }).subscribe({
          next: d => {
            try {
              const action = actions[index];
              expect(d.length).toBe(action.result);
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

    it('不传 entityId：删除根节点应从结果中移除', async () => {
      const root1 = new MenuLarge({ title: 'root1' });
      const root2 = new MenuLarge({ title: 'root2' });
      const root3 = new MenuLarge({ title: 'root3' });
      await root1.save();
      await root2.save();
      await root3.save();

      let index = 0;
      const actions = [
        {
          result: 3,
          run: async () => {
            await root2.remove();
          }
        },
        {
          result: 2
        }
      ];

      return new Promise<void>((resolve, reject) => {
        const sub = MenuLarge.findDescendants({ level: 100 }).subscribe({
          next: d => {
            try {
              const action = actions[index];
              expect(d.length).toBe(action.result);
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

    it('不传 entityId：删除子节点应触发更新（从结果中移除）', async () => {
      const root1 = new MenuLarge({ title: 'root1' });
      const child = new MenuLarge({ title: 'child' });
      root1.children$.add(child);
      await root1.save();

      const root2 = new MenuLarge({ title: 'root2' });
      await root2.save();

      let index = 0;
      const actions = [
        {
          result: 3,
          run: async () => {
            await child.remove();
          }
        },
        {
          result: 2
        }
      ];

      return new Promise<void>((resolve, reject) => {
        const sub = MenuLarge.findDescendants({ level: 100 }).subscribe({
          next: d => {
            try {
              const action = actions[index];
              expect(d.length).toBe(action.result);
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

    it('entityId 为 null：删除根节点应从结果中移除', async () => {
      const root1 = new MenuLarge({ title: 'root1' });
      const root2 = new MenuLarge({ title: 'root2' });
      await root1.save();
      await root2.save();

      let index = 0;
      const actions = [
        {
          result: 2,
          run: async () => {
            await root1.remove();
          }
        },
        {
          result: 1
        }
      ];

      return new Promise<void>((resolve, reject) => {
        const sub = MenuLarge.findDescendants({ entityId: null, level: 100 }).subscribe({
          next: d => {
            try {
              const action = actions[index];
              expect(d.length).toBe(action.result);
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
});
