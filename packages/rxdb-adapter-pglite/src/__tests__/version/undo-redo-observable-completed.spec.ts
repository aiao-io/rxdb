import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { cleanup_db, generateDbName } from '../test-utils.js';

describe('undo/redo - Observable 观察 completed 状态', () => {
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

  it('观察 completed 状态变化：创建 → 标记完成 → undo', async () => {
    // 先创建一个已完成的todo(在订阅前) - 确保查询有匹配数据
    const initialTodo = new Todo();
    initialTodo.title = 'Todo 1';
    initialTodo.completed = true;
    await initialTodo.save();

    let index = 0;
    const actions = [
      {
        completedCount: 1, // 初始状态:1个完成
        run: async () => {
          // Undo:撤销标记完成
          await rxdb.versionManager.history().undo();
        }
      },
      {
        completedCount: 0 // Undo后:0个完成
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
