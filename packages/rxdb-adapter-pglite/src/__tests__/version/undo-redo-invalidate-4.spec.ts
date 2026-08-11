import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { generateDbName } from '../test-utils.js';

describe('undo/redo - redo 栈失效 4', () => {
  let dbToCleanup: RxDB | undefined;

  afterEach(async () => {
    if (dbToCleanup) {
      await dbToCleanup.disconnectAll();
      dbToCleanup = undefined;
    }
  });

  it('undo 后删除数据，redo 栈失效', async () => {
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

    // 1. 创建 A, B
    const todoA = new Todo();
    todoA.title = 'Todo A';
    await todoA.save();

    const todoB = new Todo();
    todoB.title = 'Todo B';
    await todoB.save();

    // 2. 撤销 B。
    await rxdb.versionManager.history().undo();

    // 验证：redo 栈有 1 条
    let redoHistories = await firstValueFrom(rxdb.versionManager.history().redoHistories$);
    expect(redoHistories.length).toBe(1);

    // 3. 删除 A
    const todos = await repo.find({ where: { combinator: 'and', rules: [] } });
    await todos[0].remove();

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

    // 验证：redo 栈已清空
    redoHistories = await firstValueFrom(rxdb.versionManager.history().redoHistories$);
    expect(redoHistories.length).toBe(0);
  });
});
