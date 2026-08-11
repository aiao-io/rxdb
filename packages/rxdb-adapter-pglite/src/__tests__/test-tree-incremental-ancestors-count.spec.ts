import { RxDB, SyncType } from '@aiao/rxdb';
import { MenuLarge } from '@aiao/rxdb-test/entities';
import { beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../index.js';
import { generateDbName } from './test-utils.js';

describe('树结构增量算法测试 - Ancestors 与 Count', () => {
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
    adapter.rxdb.entityManager.cleanAllCache();
  });

  it('findAncestors 订阅：父级变更应触发增量更新（包含当前节点）', async () => {
    const root = new MenuLarge({ title: 'root' });
    const child = new MenuLarge({ title: 'child' });
    const grand = new MenuLarge({ title: 'grand' });
    root.children$.add(child);
    child.children$.add(grand);
    await root.save();

    let index = 0;
    const actions = [
      {
        result: ['child', 'grand'],
        run: async () => {
          root.children$.add(grand);
          await grand.save();
        }
      },
      {
        result: ['grand', 'root']
      }
    ];

    return new Promise<void>((resolve, reject) => {
      const sub = MenuLarge.findAncestors({ entityId: grand.id, level: 1 }).subscribe({
        next: d => {
          try {
            const titles = d.map(m => m.title).sort();
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

  it('countDescendants 订阅：新增/删除应更新计数', async () => {
    // 上一条用例已经占用了根节点标题 `root`，本文件只 cleanAllCache() 不删行，
    // (parentId, title) 唯一后不能再重名（RXT-016）。
    const root = new MenuLarge({ title: 'count-root' });
    await root.save();

    const c1 = new MenuLarge({ title: 'c1' });
    const c2 = new MenuLarge({ title: 'c2' });

    let index = 0;
    const actions = [
      {
        result: 0,
        run: async () => {
          root.children$.add(c1);
          await c1.save();
        }
      },
      {
        result: 1,
        run: async () => {
          root.children$.add(c2);
          await c2.save();
        }
      },
      {
        result: 2,
        run: async () => {
          await c1.remove();
        }
      },
      {
        result: 1
      }
    ];

    return new Promise<void>((resolve, reject) => {
      const sub = MenuLarge.countDescendants({ entityId: root.id, level: 100 }).subscribe({
        next: count => {
          try {
            const action = actions[index];
            expect(count).toBe(action.result);
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
