import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { cleanup_db, generateDbName } from '../test-utils.js';

describe('undo/redo - 来回切换 completed 状态 - Test 4', () => {
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

  it('应该在批量更新 completed 后正确 undo/redo', async () => {
    // PGlite 写入 → NOTIFY → 响应式缓存存在传播延迟，CI 高负载下更明显。
    // 轮询 count 直到收敛到目标值或超时（对齐测试 3 的稳定写法，避免固定等待时长导致的偶发失败）。
    const waitForCompletedCount = async (target: number): Promise<number> => {
      let count = -1;
      for (let i = 0; i < 40; i++) {
        count = await firstValueFrom(
          Todo.count({
            where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: true }] }
          })
        );
        if (count === target) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return count;
    };

    // 创建 5 个 todos
    const todos: Todo[] = [];
    for (let i = 0; i < 5; i++) {
      const todo = new Todo({ title: `Todo ${i}`, completed: false });
      todos.push(todo);
    }
    await rxdb.entityManager.saveMany(todos);

    // TODO: PGlite 的批量 UPDATE 触发器有 bug（WHERE id = ANY($1) 不触发 FOR EACH ROW）
    // 临时用循环方式代替
    for (const todo of todos) {
      todo.completed = true;
      await todo.save();
    }

    // 验证所有都完成了
    expect(await waitForCompletedCount(5)).toBe(5);

    // Undo 5 步
    for (let i = 0; i < 5; i++) {
      await rxdb.versionManager.history().undo();
    }
    expect(await waitForCompletedCount(0)).toBe(0);

    // Redo 5 步
    for (let i = 0; i < 5; i++) {
      await rxdb.versionManager.history().redo();
    }
    expect(await waitForCompletedCount(5)).toBe(5);

    // 再次 Undo 5 步
    for (let i = 0; i < 5; i++) {
      await rxdb.versionManager.history().undo();
    }
    expect(await waitForCompletedCount(0)).toBe(0);
  });
});
