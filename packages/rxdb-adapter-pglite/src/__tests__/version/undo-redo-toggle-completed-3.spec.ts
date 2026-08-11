import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { cleanup_db, generateDbName } from '../test-utils.js';

describe('undo/redo - 来回切换 completed 状态 - Test 3', () => {
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

  it('应该正确处理多个 todo 的 completed 状态切换', async () => {
    // 创建 3 个 todos
    const todo1 = new Todo();
    todo1.title = 'Todo 1';
    todo1.completed = false;
    await todo1.save();

    const todo2 = new Todo();
    todo2.title = 'Todo 2';
    todo2.completed = false;
    await todo2.save();

    const todo3 = new Todo();
    todo3.title = 'Todo 3';
    todo3.completed = false;
    await todo3.save();

    // 标记 todo1 和 todo2 为完成
    todo1.completed = true;
    await todo1.save();
    todo2.completed = true;
    await todo2.save();

    // 验证状态（等待数据库同步）
    let completedCount = 0;
    for (let i = 0; i < 20; i++) {
      completedCount = await firstValueFrom(
        Todo.count({
          where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: true }] }
        })
      );
      if (completedCount === 2) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    expect(completedCount).toBe(2);

    // Undo todo2 的完成
    await rxdb.versionManager.history().undo();
    completedCount = await firstValueFrom(
      Todo.count({
        where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: true }] }
      })
    );
    expect(completedCount).toBe(1);

    // Undo todo1 的完成
    await rxdb.versionManager.history().undo();
    completedCount = await firstValueFrom(
      Todo.count({
        where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: true }] }
      })
    );
    expect(completedCount).toBe(0);

    // Redo 两次恢复完成状态
    await rxdb.versionManager.history().redo();
    await rxdb.versionManager.history().redo();

    // 等待数据库更新完成（通过查询直到结果正确或超时）
    let completedCount2 = 0;
    for (let i = 0; i < 20; i++) {
      completedCount2 = await firstValueFrom(
        Todo.count({
          where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: true }] }
        })
      );
      if (completedCount2 === 2) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    expect(completedCount2).toBe(2);
  });
});
