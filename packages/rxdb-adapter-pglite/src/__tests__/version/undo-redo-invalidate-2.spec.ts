import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { generateDbName } from '../test-utils.js';

describe('undo/redo - redo 栈失效 2', () => {
  let dbToCleanup: RxDB | undefined;

  afterEach(async () => {
    if (dbToCleanup) {
      await dbToCleanup.disconnectAll();
      dbToCleanup = undefined;
    }
  });

  it('undo 多次后创建新数据，所有 undo 的数据都不可 redo', async () => {
    const db = new RxDB({
      dbName: generateDbName(),
      entities: [Todo],
      sync: {
        local: { adapter: 'pglite' },
        type: SyncType.None
      }
    });
    dbToCleanup = db;
    db.adapter(
      'pglite',
      db =>
        new RxDBAdapterPGlite(db, {
          store: 'memory'
        })
    );
    const rxdb = db;
    const adapter = await db.getAdapter('pglite');
    await db.connect('pglite');
    const repo = adapter.getRepository(Todo);

    // 1. 创建 A, B, C, D
    const titles = ['A', 'B', 'C', 'D'];
    for (const title of titles) {
      const todo = new Todo();
      todo.title = `Todo ${title}`;
      await todo.save();
    }

    // 验证：4 条数据
    let result = await repo.find({ where: { combinator: 'and', rules: [] } });
    expect(result.length).toBe(4);

    // 2. Undo 2 次（撤销 D 和 C）
    await rxdb.versionManager.history().undo();
    await rxdb.versionManager.history().undo();

    // 验证：只剩 2 条
    result = await repo.find({ where: { combinator: 'and', rules: [] } });
    expect(result.length).toBe(2);

    // 验证：redo 栈有 2 条
    let redoHistories = await firstValueFrom(rxdb.versionManager.history().redoHistories$);
    expect(redoHistories.length).toBe(2);

    // 3. 创建新数据 E
    const todoE = new Todo();
    todoE.title = 'Todo E';
    await todoE.save();

    // 等待 invalidateRedoStack 完成（通过监听 redoHistories$ 变化确认）
    await new Promise<void>(resolve => {
      const sub = rxdb.versionManager.history().redoHistories$.subscribe(histories => {
        if (histories.length === 0) {
          sub.unsubscribe();
          resolve();
        }
      });
      setTimeout(() => {
        sub.unsubscribe();
        resolve();
      }, 5000);
    });

    // 4. 验证：redo 栈完全清空
    redoHistories = await firstValueFrom(rxdb.versionManager.history().redoHistories$);
    expect(redoHistories.length).toBe(0);

    // 验证：数据库中有 3 条
    result = await repo.find({ where: { combinator: 'and', rules: [] } });
    expect(result.length).toBe(3);
  });
});
