import { RxDB, SyncType } from '@aiao/rxdb';
import { MenuLarge } from '@aiao/rxdb-test/entities';
import { beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../index.js';
import { cleanup_db, generateDbName } from './test-utils.js';

describe('树结构增量算法测试 - UPDATE 事件', () => {
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
    await rxdb.connect('pglite');
  });

  afterEach(async () => {
    await cleanup_db(adapter);
  });

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  describe('findDescendants - UPDATE 增量更新', () => {
    it('更新实体字段值（不改变层级）应推送增量结果', async () => {
      const root = new MenuLarge({ title: 'root' });
      const child = new MenuLarge({ title: 'child-old' });
      root.children$.add(child);
      await root.save();

      let index = 0;
      const actions = [
        {
          result: ['child-old', 'root'],
          run: async () => {
            child.title = 'child-new';
            await child.save();
          }
        },
        {
          result: ['child-new', 'root']
        }
      ];

      return new Promise<void>((resolve, reject) => {
        const sub = MenuLarge.findDescendants({ entityId: root.id, level: 100 }).subscribe({
          next: data => {
            try {
              const titles = data.map(m => m.title).sort();
              const action = actions[index];
              expect(titles).toEqual(action.result.sort());
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

    it('当节点脱离后代树时应从结果中移除', async () => {
      const root = new MenuLarge({ title: 'root' });
      const child = new MenuLarge({ title: 'child' });
      root.children$.add(child);
      await root.save();

      const otherRoot = new MenuLarge({ title: 'otherRoot' });
      await otherRoot.save();

      let index = 0;
      const actions = [
        {
          result: 2,
          run: async () => {
            otherRoot.children$.add(child);
            await child.save();
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

    it('当节点成为后代时应被增量添加', async () => {
      const root = new MenuLarge({ title: 'root' });
      await root.save();
      const alone = new MenuLarge({ title: 'alone' });
      await alone.save();

      let index = 0;
      const actions = [
        {
          result: 1,
          run: async () => {
            root.children$.add(alone);
            await alone.save();
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

    it('level=1 时，移动到第二层的节点不应出现在结果中', async () => {
      const root = new MenuLarge({ title: 'root' });
      const child = new MenuLarge({ title: 'child' });
      const grand = new MenuLarge({ title: 'grand' });
      root.children$.add(child);
      child.children$.add(grand);
      await root.save();

      let index = 0;
      const actions = [
        {
          result: ['child', 'root'],
          run: async () => {
            root.children$.add(grand);
            await grand.save();
          }
        },
        {
          result: ['child', 'grand', 'root'],
          run: async () => {
            child.children$.add(grand);
            await grand.save();
          }
        },
        {
          result: ['child', 'root']
        }
      ];

      return new Promise<void>((resolve, reject) => {
        const sub = MenuLarge.findDescendants({ entityId: root.id, level: 1 }).subscribe({
          next: d => {
            try {
              const titles = d.map(x => x.title).sort();
              const action = actions[index];
              expect(titles).toEqual(action.result.sort());
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

    it('where 条件：字段更新使实体从不匹配变为匹配应被添加', async () => {
      const root = new MenuLarge({ title: 'root' });
      const child = new MenuLarge({ title: 'no-match' });
      root.children$.add(child);
      await root.save();

      let index = 0;
      const actions = [
        {
          result: ['root'],
          run: async () => {
            child.title = 'match';
            await child.save();
          }
        },
        {
          result: ['match', 'root']
        }
      ];

      return new Promise<void>((resolve, reject) => {
        const sub = MenuLarge.findDescendants({
          entityId: root.id,
          level: 100,
          where: { combinator: 'and', rules: [{ field: 'children.title', operator: '=', value: 'match' }] }
        }).subscribe({
          next: d => {
            try {
              const titles = d.map(x => x.title).sort();
              const action = actions[index];
              expect(titles).toEqual(action.result.sort());
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

    it('不传 entityId：更新根节点字段应触发增量更新', async () => {
      const root1 = new MenuLarge({ title: 'root1-old' });
      const root2 = new MenuLarge({ title: 'root2' });
      await root1.save();
      await root2.save();

      let index = 0;
      const actions = [
        {
          result: ['root1-old', 'root2'],
          run: async () => {
            root1.title = 'root1-new';
            await root1.save();
          }
        },
        {
          result: ['root1-new', 'root2']
        }
      ];

      return new Promise<void>((resolve, reject) => {
        const sub = MenuLarge.findDescendants({ level: 100 }).subscribe({
          next: d => {
            try {
              const titles = d.map(x => x.title).sort();
              const action = actions[index];
              expect(titles).toEqual(action.result.sort());
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

    it('不传 entityId：更新子节点字段应触发增量更新', async () => {
      const root1 = new MenuLarge({ title: 'root1' });
      const child = new MenuLarge({ title: 'child-old' });
      root1.children$.add(child);
      await root1.save();

      const root2 = new MenuLarge({ title: 'root2' });
      await root2.save();

      let index = 0;
      const actions = [
        {
          result: ['child-old', 'root1', 'root2'],
          run: async () => {
            child.title = 'child-new';
            await child.save();
          }
        },
        {
          result: ['child-new', 'root1', 'root2']
        }
      ];

      return new Promise<void>((resolve, reject) => {
        const sub = MenuLarge.findDescendants({ level: 100 }).subscribe({
          next: d => {
            try {
              const titles = d.map(x => x.title).sort();
              const action = actions[index];
              expect(titles).toEqual(action.result.sort());
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

    it('不传 entityId：子节点层级变化应触发更新', async () => {
      const root1 = new MenuLarge({ title: 'root1' });
      const child = new MenuLarge({ title: 'child' });
      root1.children$.add(child);
      await root1.save();

      const root2 = new MenuLarge({ title: 'root2' });
      await root2.save();

      let index = 0;
      const actions = [
        {
          result: ['child', 'root1', 'root2'],
          run: async () => {
            root2.children$.add(child);
            await child.save();
          }
        },
        {
          result: ['child', 'root1', 'root2']
        }
      ];

      return new Promise<void>((resolve, reject) => {
        const sub = MenuLarge.findDescendants({ level: 100 }).subscribe({
          next: d => {
            try {
              const titles = d.map(x => x.title).sort();
              const action = actions[index];
              expect(titles).toEqual(action.result.sort());
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

    it('不传 entityId：根节点变为子节点应保持在结果中', async () => {
      const root1 = new MenuLarge({ title: 'root1' });
      const root2 = new MenuLarge({ title: 'root2' });
      await root1.save();
      await root2.save();

      let index = 0;
      const actions = [
        {
          result: ['root1', 'root2'],
          run: async () => {
            root1.children$.add(root2);
            await root2.save();
          }
        },
        {
          result: ['root1', 'root2']
        }
      ];

      return new Promise<void>((resolve, reject) => {
        const sub = MenuLarge.findDescendants({ level: 100 }).subscribe({
          next: d => {
            try {
              const titles = d.map(x => x.title).sort();
              const action = actions[index];
              expect(titles).toEqual(action.result.sort());
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

    it('entityId 为 null：更新根节点应触发增量更新', async () => {
      const root1 = new MenuLarge({ title: 'root1-old' });
      const root2 = new MenuLarge({ title: 'root2' });
      await root1.save();
      await root2.save();

      let index = 0;
      const actions = [
        {
          result: ['root1-old', 'root2'],
          run: async () => {
            root1.title = 'root1-new';
            await root1.save();
          }
        },
        {
          result: ['root1-new', 'root2']
        }
      ];

      return new Promise<void>((resolve, reject) => {
        const sub = MenuLarge.findDescendants({ entityId: null, level: 100 }).subscribe({
          next: d => {
            try {
              const titles = d.map(x => x.title).sort();
              const action = actions[index];
              expect(titles).toEqual(action.result.sort());
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
