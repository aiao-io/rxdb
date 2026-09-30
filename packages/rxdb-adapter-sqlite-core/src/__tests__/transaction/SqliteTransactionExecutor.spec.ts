import type { IRepository, SwitchVersionActions } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import type { RxDBAdapterSqliteBase, SqliteClientLike } from '../../RxDBAdapterSqliteBase.js';
import type { SqliteResult } from '../../sqlite-core.interface.js';
import { SqliteTransactionExecutor } from '../../transaction/SqliteTransactionExecutor.js';
import { Todo } from '../fixtures/Todo.js';

/**
 * SqliteTransactionExecutor —— 事务作用域内的适配器门面。
 *
 * 覆盖两条绑定契约（见实现文件注释）：
 * - `query` / `writeQuery` / `getRepository` / `runInTransaction` / `mergeChanges`
 *   五个成员被特判改写，其余成员一律绑定真实适配器；
 * - 事务进入终态（settle）后一切入口都拒绝，报错点名 operation 与事务 id。
 */

const createAdapterFake = () => {
  const repository = { id: 'repo-1' } as unknown as IRepository<Todo>;
  const adapter = {
    createUncachedRepository: vi.fn(() => repository),
    mergeChanges: vi.fn(async () => undefined),
    statusInfo: vi.fn(function (this: unknown) {
      return this;
    }),
    marker: 'plain-value'
  } as unknown as RxDBAdapterSqliteBase;
  return { adapter, repository };
};

const createClientFake = () =>
  ({
    execute: vi.fn(async () => ({ sql: '', rowsAffected: 0, elapsed: 0, results: [] }) as SqliteResult),
    disconnect: vi.fn(async () => undefined),
    version: vi.fn(async () => '3.49.0'),
    addEventListener: vi.fn()
  }) as unknown as SqliteClientLike;

describe('SqliteTransactionExecutor', () => {
  it('execute 直接落在事务连接上；query 拆出 rows/columns，结果为空时兜底空数组', async () => {
    const { adapter } = createAdapterFake();
    const client = createClientFake();
    const executor = new SqliteTransactionExecutor(adapter, client, 'tx-1');

    client.execute.mockResolvedValueOnce({
      sql: 'SELECT 1',
      rowsAffected: 1,
      elapsed: 0,
      results: [{ columns: ['a'], rows: [[1]] }]
    });
    await expect(executor.query('SELECT 1')).resolves.toEqual({
      rowsAffected: 1,
      rows: [[1]],
      columns: ['a']
    });
    expect(client.execute).toHaveBeenCalledWith('SELECT 1', undefined);

    client.execute.mockResolvedValueOnce({ sql: 'SELECT 2', rowsAffected: 0, elapsed: 0, results: [] });
    await expect(executor.query('SELECT 2')).resolves.toEqual({ rowsAffected: 0, rows: [], columns: [] });
  });

  it('facade 特判五个成员：query/writeQuery 落事务、仓库绑门面、runInTransaction 复用本事务', async () => {
    const { adapter, repository } = createAdapterFake();
    const client = createClientFake();
    const executor = new SqliteTransactionExecutor(adapter, client, 'tx-1');
    const facade = executor.adapter;

    expect(facade).not.toBe(adapter);

    await facade.query('SELECT 1', ['x']);
    expect(client.execute).toHaveBeenCalledWith('SELECT 1', ['x']);
    await facade.writeQuery('INSERT INTO t VALUES (?)', [1]);
    expect(client.execute).toHaveBeenCalledWith('INSERT INTO t VALUES (?)', [1]);

    const repo = facade.getRepository(Todo);
    expect(repo).toBe(repository);
    expect(adapter.createUncachedRepository).toHaveBeenCalledWith(Todo, facade);

    await expect(facade.runInTransaction(async inner => inner.id)).resolves.toBe('tx-1');
  });

  it('facade 的 mergeChanges 把 this 绑到门面；普通成员与普通方法绑定真实适配器', async () => {
    const { adapter } = createAdapterFake();
    const client = createClientFake();
    const executor = new SqliteTransactionExecutor(adapter, client, 'tx-1');
    const facade = executor.adapter;

    const capturedThis: unknown[] = [];
    adapter.mergeChanges.mockImplementationOnce(async function (this: unknown) {
      capturedThis.push(this);
    });
    const actions = {} as SwitchVersionActions;
    await facade.mergeChanges(actions);
    expect(capturedThis[0]).toBe(facade);

    // 非特判成员：值直接透传，方法绑定真实适配器（#private 访问不走 Proxy 陷阱）
    expect((facade as unknown as { marker: string }).marker).toBe('plain-value');
    expect((facade as unknown as { statusInfo(): unknown }).statusInfo()).toBe(adapter);
  });

  it('executor.mergeChanges 委派适配器自身实现并原样转发参数与禁用标志', async () => {
    const { adapter } = createAdapterFake();
    const client = createClientFake();
    const executor = new SqliteTransactionExecutor(adapter, client, 'tx-1');

    const actions = {} as SwitchVersionActions;
    await executor.mergeChanges(actions, undefined, true);
    expect(adapter.mergeChanges).toHaveBeenCalledWith(actions, undefined, true);

    const facade = executor.adapter;
    const capturedThis: unknown[] = [];
    adapter.mergeChanges.mockImplementationOnce(async function (this: unknown) {
      capturedThis.push(this);
    });
    await executor.mergeChanges(actions);
    expect(capturedThis[0]).toBe(facade);
  });

  it('getRepository 每个实体类型只建一次并缓存', () => {
    const { adapter, repository } = createAdapterFake();
    const client = createClientFake();
    const executor = new SqliteTransactionExecutor(adapter, client, 'tx-1');

    const first = executor.getRepository(Todo);
    const second = executor.getRepository(Todo);

    expect(first).toBe(repository);
    expect(second).toBe(first);
    expect(adapter.createUncachedRepository).toHaveBeenCalledTimes(1);
  });

  it('tableRef 与建表路径同拼法（namespace 作前缀、标识符带引号）', () => {
    const { adapter } = createAdapterFake();
    const client = createClientFake();
    const executor = new SqliteTransactionExecutor(adapter, client, 'tx-1');

    expect(executor.tableRef(Todo)).toBe('"public$todos"');
  });

  it('run 把 executor 自身交给回调', async () => {
    const { adapter } = createAdapterFake();
    const client = createClientFake();
    const executor = new SqliteTransactionExecutor(adapter, client, 'tx-1');

    await expect(
      executor.run(async inner => {
        expect(inner).toBe(executor);
        return 42;
      })
    ).resolves.toBe(42);
  });

  it('settle 进入终态后一切入口都拒绝，报错点名 operation 与事务 id', async () => {
    const { adapter } = createAdapterFake();
    const client = createClientFake();
    const executor = new SqliteTransactionExecutor(adapter, client, 'tx-9');

    executor.settle('committed');
    expect(executor.state).toBe('committed');

    await expect(executor.execute('SELECT 1')).rejects.toThrow('TransactionExecutor(tx-9).execute()');
    await expect(executor.run(async () => 1)).rejects.toThrow('TransactionExecutor(tx-9).run()');
    expect(() => executor.getRepository(Todo)).toThrow('TransactionExecutor(tx-9).getRepository()');
    await expect(executor.adapter.query('SELECT 1')).rejects.toThrow('TransactionExecutor(tx-9).execute()');
    await expect(executor.mergeChanges({} as SwitchVersionActions)).rejects.toThrow(
      'TransactionExecutor(tx-9).mergeChanges()'
    );
  });
});
