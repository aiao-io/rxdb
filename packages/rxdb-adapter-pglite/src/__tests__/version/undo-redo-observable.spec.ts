import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { cleanup_db, generateDbName } from '../test-utils.js';

describe('undo/redo - Observable 增量计算观察', () => {
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
    // 先创建一个已完成的 todo（在订阅前）
    const initialTodo = new Todo();
    initialTodo.title = 'Todo 1';
    initialTodo.completed = true;
    await initialTodo.save();

    let index = 0;
    const actions = [
      {
        completedCount: 1, // 初始状态：1个完成
        run: async () => {
          // Undo：撤销创建（删除 todo）
          await rxdb.versionManager.history().undo();
        }
      },
      {
        completedCount: 0 // Undo 后：0个完成
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

  it('观察总数变化：创建 → undo → redo', async () => {
    // 先执行一次查询确保缓存初始化
    await adapter.getRepository(Todo).find({ where: { combinator: 'and', rules: [] } });

    const events: number[] = [];

    // 轮询等待条件成立。CI 高负载下 Observable 首次/后续发射存在延迟，
    // 用足够长的超时轮询代替固定短等待，避免偶发失败（最多 500 × 10ms = 5s）。
    const waitFor = async (predicate: () => boolean): Promise<void> => {
      for (let i = 0; i < 500 && !predicate(); i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    };

    // 订阅并收集事件
    const sub = Todo.findAll({
      where: { combinator: 'and', rules: [] }
    }).subscribe({
      next: data => {
        events.push(data.length);
      }
    });

    try {
      // 等待初始值
      await waitFor(() => events.length > 0);
      expect(events[0]).toBe(0); // 初始状态

      // 创建 todo
      const todo = new Todo();
      todo.title = 'Todo 1';
      todo.completed = false;
      await todo.save();

      // 等待 Observable 发出新值
      await waitFor(() => events[events.length - 1] === 1);
      expect(events[events.length - 1]).toBe(1); // 创建后

      // Undo：撤销创建
      await rxdb.versionManager.history().undo();
      await waitFor(() => events[events.length - 1] === 0);
      expect(events[events.length - 1]).toBe(0); // Undo 后

      // Redo：恢复创建
      await rxdb.versionManager.history().redo();
      await waitFor(() => events[events.length - 1] === 1);
      expect(events[events.length - 1]).toBe(1); // Redo 后
    } finally {
      sub.unsubscribe();
    }
  });
});
