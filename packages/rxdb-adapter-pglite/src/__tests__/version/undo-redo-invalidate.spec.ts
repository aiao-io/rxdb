import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { generateDbName } from '../test-utils.js';

describe('undo/redo - redo 栈失效', () => {
  let dbToCleanup: RxDB | undefined;

  afterEach(async () => {
    if (dbToCleanup) {
      await dbToCleanup.disconnectAll();
      dbToCleanup = undefined;
    }
  });

  it('undo 后创建新数据，之前 undo 的数据不可 redo', async () => {
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

    // 1. 创建 A, B, C
    const todoA = new Todo();
    todoA.title = 'Todo A';
    await todoA.save();

    const todoB = new Todo();
    todoB.title = 'Todo B';
    await todoB.save();

    const todoC = new Todo();
    todoC.title = 'Todo C';
    await todoC.save();

    // 验证：3 条数据存在
    let todos = await repo.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(3);

    // 2. Undo C (撤销最后一个)
    await rxdb.versionManager.history().undo();

    // 验证：只剩 2 条
    todos = await repo.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(2);

    // 验证：redo 栈有 1 条可恢复
    let redoHistories = await firstValueFrom(rxdb.versionManager.history().redoHistories$);
    expect(redoHistories.length).toBe(1);

    // 3. 创建新数据 D
    const todoD = new Todo();
    todoD.title = 'Todo D';
    await todoD.save();

    // 等待invalidateRedoStack完成（它在ENTITY_LOCAL_CREATE_EVENT中异步执行）
    // 通过监听redoHistories$的变化来确认完成
    await new Promise<void>(resolve => {
      const sub = rxdb.versionManager.history().redoHistories$.subscribe(histories => {
        if (histories.length === 0) {
          sub.unsubscribe();
          resolve();
        }
      });
      // 超时保护
      setTimeout(() => {
        sub.unsubscribe();
        resolve();
      }, 5000);
    });

    // 4. 验证：redo 栈已被清空
    redoHistories = await firstValueFrom(rxdb.versionManager.history().redoHistories$);
    expect(redoHistories.length).toBe(0);

    // 验证：数据库中有 A, B, D（3条）
    todos = await repo.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(3);

    // 5. 尝试 redo（应该无效，因为栈已清空）
    await rxdb.versionManager.history().redo();

    // 验证：数据没有变化
    todos = await repo.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(3);
  });
});
