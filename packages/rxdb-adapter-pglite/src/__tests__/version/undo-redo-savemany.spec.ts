import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { generateDbName } from '../test-utils.js';

/**
 * saveMany 操作的 undo/redo 测试
 */
describe('undoDatabase/redoDatabase - saveMany', () => {
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
    adapter = await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    if (rxdb) {
      await rxdb.disconnectAll();
    }
  });

  it('单个 save + 多个批量 save → undo → redo', async () => {
    const todoRepository = adapter.getRepository(Todo);
    const history = rxdb.versionManager.history();

    // 1. 先保存 1 个 todo
    const todo1 = new Todo();
    todo1.title = 'single-todo';
    await todo1.save();

    let todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(1);
    expect(todos[0].title).toBe('single-todo');

    // 2. 再分别保存 3 个 todo（每个单独保存，创建3个历史项）
    for (let i = 0; i < 3; i++) {
      const todo = new Todo();
      todo.title = `batch-todo-${i}`;
      await todo.save();
    }

    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(4);

    // 3. Undo 最后的 3 个操作（撤销 3 个 todo）
    await history.undo();
    await history.undo();
    await history.undo();

    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(1);
    expect(todos[0].title).toBe('single-todo');

    // 4. Redo 3 个操作（应该恢复 3 个 todo）
    await history.redo();
    await history.redo();
    await history.redo();

    todos = await todoRepository.find({ where: { combinator: 'and', rules: [] } });
    expect(todos.length).toBe(4);
    expect(todos.filter(t => t.title.startsWith('batch-todo')).length).toBe(3);
  }, 30000);
});
