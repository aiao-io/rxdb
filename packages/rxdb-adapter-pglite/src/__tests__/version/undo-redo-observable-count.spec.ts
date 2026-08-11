import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterEach, beforeAll, describe, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { cleanup_db, generateDbName } from '../test-utils.js';

describe('Undo/Redo Observable Count', () => {
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

  it('观察总数变化：创建 → undo → redo', async () => {
    const waitForCount = (target: number): Promise<void> =>
      new Promise<void>(resolve => {
        const sub = Todo.find({
          where: { combinator: 'and', rules: [] }
        }).subscribe({
          next: data => {
            if (data.length === target) {
              sub.unsubscribe();
              resolve();
            }
          }
        });
        setTimeout(() => {
          sub.unsubscribe();
          resolve();
        }, 5000);
      });

    // 初始状态
    await waitForCount(0);

    // 创建 todo
    const todo = new Todo();
    todo.title = 'Todo 1';
    todo.completed = false;
    await todo.save();
    await waitForCount(1);

    // Undo：撤销创建
    await rxdb.versionManager.history().undo();
    await waitForCount(0);

    // Redo：恢复创建
    await rxdb.versionManager.history().redo();
    await waitForCount(1);
  });
});
