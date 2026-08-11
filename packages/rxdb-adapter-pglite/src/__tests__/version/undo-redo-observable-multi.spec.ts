import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { cleanup_db, generateDbName } from '../test-utils.js';

describe('undo/redo - Observable 观察多次操作', () => {
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
    db.adapter(
      'pglite',
      db =>
        new RxDBAdapterPGlite(db, {
          store: 'memory'
        })
    );
    rxdb = db;
    adapter = await db.getAdapter('pglite');
    await db.connect('pglite');
  });

  afterEach(async () => {
    await cleanup_db(adapter);
  });

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  it('观察完成计数:多次操作 → 多次 undo', async () => {
    // 先创建两个todo并都标记为完成(在订阅前)
    const todo1 = new Todo();
    todo1.title = 'Todo 1';
    todo1.completed = true;
    await todo1.save();

    const todo2 = new Todo();
    todo2.title = 'Todo 2';
    todo2.completed = true;
    await todo2.save();

    let index = 0;
    const actions = [
      {
        completedCount: 2, // 初始状态:2个完成
        run: async () => {
          // Undo:撤销标记todo2完成
          await rxdb.versionManager.history().undo();
        }
      },
      {
        completedCount: 1, // 只有todo1完成
        run: async () => {
          // Undo:撤销标记todo1完成
          await rxdb.versionManager.history().undo();
        }
      },
      {
        completedCount: 0 // 都不完成
      }
    ];

    return new Promise<void>((resolve, reject) => {
      const sub = Todo.findAll({
        where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: true }] }
      }).subscribe({
        next: data => {
          try {
            const action = actions[index];
            expect(data.length).toBe(action.completedCount);

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
