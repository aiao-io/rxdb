import { WorktreeTableSet, type EntityType, type RxDB } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { RxDBAdapterSqliteBase, type SqliteClientLike } from '../../RxDBAdapterSqliteBase.js';
import type { SqliteSuccessResult } from '../../sqlite-core.interface.js';
import { Todo } from '../fixtures/Todo.js';

class BranchSamplingAdapter extends RxDBAdapterSqliteBase {
  readonly name = 'sqlite-core-branch-sampling-test';

  constructor(
    rxdb: RxDB,
    private readonly client: SqliteClientLike
  ) {
    super(rxdb);
  }

  protected async createClient(): Promise<SqliteClientLike> {
    return this.client;
  }
}

const createRxdbMock = (entities: EntityType[]): RxDB =>
  ({
    config: { entities, dbName: 'sqlite-core-branch-sampling' },
    context: {},
    connect: vi.fn().mockResolvedValue(undefined),
    dispatchEvent: vi.fn(),
    worktreeTableSet: WorktreeTableSet.MAIN,
    schemaManager: { getEntityTypeByTableName: vi.fn(), getEntityMetadata: vi.fn(), getEntityType: vi.fn() }
  }) as unknown as RxDB;

const BRANCH_READ_PATTERN = /^SELECT [^;]*FROM "rxdb\$rxdb_branch"/;

const okResult = (sql: string, results: SqliteSuccessResult['results'] = []): SqliteSuccessResult => ({
  sql,
  results,
  rowsAffected: 0,
  elapsed: 0
});

/**
 * 另一条连接在本事务拿到写锁之前完成了 `switchBranch(feature)`：
 * 本连接 BEGIN 之前读分支表得到的是 main，BEGIN（拿到锁）之后读到的才是 feature。
 */
const createSwitchedClient = (): { client: SqliteClientLike; sqls: string[] } => {
  const sqls: string[] = [];
  let begun = false;
  const client: SqliteClientLike = {
    execute: vi.fn(async (sql: string) => {
      sqls.push(sql);
      if (sql.startsWith('BEGIN')) begun = true;
      if (!BRANCH_READ_PATTERN.test(sql)) return okResult(sql);
      return okResult(sql, [{ columns: ['id'], rows: [[begun ? 'feature' : 'main']] }]);
    }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    version: vi.fn().mockResolvedValue('3.0.0'),
    addEventListener: vi.fn(),
    beginTransactionSql: () => 'BEGIN IMMEDIATE;'
  };
  return { client, sqls };
};

describe('记日志的默认事务按 BEGIN 之后的分支装触发器', () => {
  it('分支在 BEGIN 拿到写锁之后读，变更日志记在切换后的分支名下', async () => {
    const { client, sqls } = createSwitchedClient();
    const adapter = new BranchSamplingAdapter(createRxdbMock([Todo]), client);

    await adapter.transaction(async tx => {
      await tx.execute('SELECT 1');
    });

    const begin = sqls.findIndex(sql => sql.startsWith('BEGIN'));
    const read = sqls.findIndex(sql => BRANCH_READ_PATTERN.test(sql));
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(read).toBeGreaterThan(begin);
    const triggers = sqls.filter(sql => sql.includes('CREATE TRIGGER')).join('\n');
    expect(triggers).toContain("'feature'");
    expect(triggers).not.toContain("'main'");
  });

  it('读分支失败时回滚已开的事务', async () => {
    const { client, sqls } = createSwitchedClient();
    vi.mocked(client.execute).mockImplementation(async (sql: string) => {
      sqls.push(sql);
      if (BRANCH_READ_PATTERN.test(sql)) throw new Error('branch read failed');
      return okResult(sql);
    });
    const adapter = new BranchSamplingAdapter(createRxdbMock([Todo]), client);

    await expect(adapter.transaction(async () => undefined)).rejects.toThrow('branch read failed');

    const begin = sqls.findIndex(sql => sql.startsWith('BEGIN'));
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(sqls.at(-1)).toBe('ROLLBACK');
  });
});
