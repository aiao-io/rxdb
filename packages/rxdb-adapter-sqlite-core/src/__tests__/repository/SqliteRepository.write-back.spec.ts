import { type EntityUpdateData, getEntityStatus, RxDB, SyncType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { SqliteRepository } from '../../repository/SqliteRepository.js';
import { RxDBAdapterSqliteBase, type SqliteClientLike } from '../../RxDBAdapterSqliteBase.js';
import type { SQLiteCompatibleType, SqliteSuccessResult } from '../../sqlite-core.interface.js';
import { Todo } from '../fixtures/Todo.js';

/** 写入挂在 `gate` 上：测试在写入返回之前改实体，模拟「保存等待期间继续输入」 */
class DeferredWriteAdapter extends RxDBAdapterSqliteBase {
  #pending?: (result: SqliteSuccessResult) => void;
  readonly name = 'sqlite-core-deferred-write-test';
  readonly writes: string[] = [];

  release(row: (string | number)[]): void {
    this.#pending?.({
      sql: this.writes.at(-1) ?? '',
      rowsAffected: 1,
      elapsed: 0,
      results: [{ columns: ['__rowid', 'id', 'title', 'completed', 'createdAt', 'updatedAt'], rows: [row] }]
    });
  }

  override writeQuery(sql: string, params?: SQLiteCompatibleType[]): Promise<SqliteSuccessResult> {
    this.writes.push(`${sql} ${JSON.stringify(params ?? [])}`);
    return new Promise(resolve => {
      this.#pending = resolve;
    });
  }

  protected async createClient(): Promise<SqliteClientLike> {
    throw new Error('DeferredWriteAdapter.createClient must not be called');
  }
}

const CREATED = '2026-01-01T00:00:00.000Z';
const STORED = '2026-01-02T00:00:00.000Z';
const WRITTEN = '2026-01-03T00:00:00.000Z';

const setup = (dbName: string, local: boolean) => {
  const rxdb = new RxDB({
    dbName,
    entities: [Todo],
    sync: { local: { adapter: 'noop' }, type: SyncType.None },
    multiInstance: false
  });
  rxdb.schemaManager.init();
  rxdb.entityManager.init();
  const adapter = new DeferredWriteAdapter(rxdb);
  const repository = new SqliteRepository(adapter, Todo);
  const todo = rxdb.entityManager.createEntityRef(
    Todo,
    {
      id: 'todo',
      title: 'original',
      completed: false,
      createdAt: new Date(CREATED),
      updatedAt: new Date(STORED)
    } as EntityUpdateData<typeof Todo>,
    { local, modified: false }
  );
  return { adapter, repository, todo, status: getEntityStatus(todo) };
};

/** 让出事件循环，确保 SQL 已生成、写入已经挂起 */
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('SqliteRepository 写入成功后的回填', () => {
  it('update 等待写入期间对同一字段的新输入在回填后保留，modified 仍为 true', async () => {
    const { adapter, repository, todo, status } = setup('sqlite-write-back-same-field', true);
    todo.title = 'submitted';
    const saving = repository.update(todo, { ...status.patch });
    await flush();
    todo.title = 'typed while saving';
    adapter.release([1, 'todo', 'submitted', 0, CREATED, WRITTEN]);
    await saving;

    expect(todo.title).toBe('typed while saving');
    expect(todo.updatedAt).toEqual(new Date(WRITTEN));
    expect(status.origin.title).toBe('submitted');
    expect(status.patch).toEqual({ title: 'typed while saving' });
    expect(status.modified).toBe(true);
    expect(adapter.getEntityByRowId(1n, Todo)).toBe(todo);
  });

  it('update 等待写入期间编辑其他字段，回填后同样保留', async () => {
    const { adapter, repository, todo, status } = setup('sqlite-write-back-other-field', true);
    todo.title = 'submitted';
    const saving = repository.update(todo, { ...status.patch });
    await flush();
    todo.completed = true;
    adapter.release([1, 'todo', 'submitted', 0, CREATED, WRITTEN]);
    await saving;

    expect(todo.title).toBe('submitted');
    expect(todo.completed).toBe(true);
    expect(status.patch).toEqual({ completed: true });
    expect(status.modified).toBe(true);
  });

  it('update 没有新输入时以数据库的值为准（含被数据库改写的提交值），不残留假差异', async () => {
    const { adapter, repository, todo, status } = setup('sqlite-write-back-normalized', true);
    todo.title = 'submitted';
    const saving = repository.update(todo, { ...status.patch });
    await flush();
    adapter.release([1, 'todo', 'SUBMITTED', 0, CREATED, WRITTEN]);
    await saving;

    expect(todo.title).toBe('SUBMITTED');
    expect(status.patch).toEqual({});
    expect(status.modified).toBe(false);
  });

  it('update 提交实例上从未写过的值（调用方自算的增量）时，实例上的旧值不算新编辑', async () => {
    const { adapter, repository, todo, status } = setup('sqlite-write-back-explicit-patch', true);
    todo.title = 'stale local';
    status.mergeExternal({ title: 'stale local' });
    const saving = repository.update(todo, { title: 'computed elsewhere' });
    await flush();
    adapter.release([1, 'todo', 'computed elsewhere', 0, CREATED, WRITTEN]);
    await saving;

    expect(todo.title).toBe('computed elsewhere');
    expect(status.patch).toEqual({});
    expect(status.modified).toBe(false);
  });

  it('create 生成 INSERT 之后的新输入在回填后保留', async () => {
    const { adapter, repository, todo, status } = setup('sqlite-write-back-create', false);
    const saving = repository.create(todo);
    await flush();
    todo.title = 'typed after insert';
    adapter.release([1, 'todo', 'original', 0, CREATED, STORED]);
    await saving;

    expect(todo.title).toBe('typed after insert');
    expect(status.origin.title).toBe('original');
    expect(status.local).toBe(true);
    expect(status.patch).toEqual({ title: 'typed after insert' });
    expect(status.modified).toBe(true);
  });

  it('create 接受没挂载的普通对象（插件写系统表如迁移记录）：不取实体状态、照常写入', async () => {
    const { adapter, repository } = setup('sqlite-write-back-plain-create', false);
    const plain = {
      id: 'plain',
      title: 'plain',
      completed: false,
      createdAt: new Date(CREATED),
      updatedAt: new Date(STORED)
    };
    const saving = repository.create(plain as never);
    await flush();
    adapter.release([1, 'plain', 'plain', 0, CREATED, STORED]);

    await expect(saving).resolves.toBe(plain);
    expect(adapter.writes).toHaveLength(1);
  });

  it('update 接受没挂载的普通对象：不取实体状态、照常写入', async () => {
    const { adapter, repository } = setup('sqlite-write-back-plain-update', true);
    const plain = {
      id: 'plain',
      title: 'plain',
      completed: false,
      createdAt: new Date(CREATED),
      updatedAt: new Date(STORED)
    };
    const saving = repository.update(plain as never, { title: 'changed' } as never);
    await flush();
    adapter.release([1, 'plain', 'changed', 0, CREATED, WRITTEN]);

    await expect(saving).resolves.toBe(plain);
    expect(adapter.writes).toHaveLength(1);
  });
});
