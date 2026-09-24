import { RxDB, SyncType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../../RxDBAdapterSqliteBase.js';
import type { SqliteResult } from '../../sqlite-core.interface.js';
import { withTriggersDisabled, type SqlExecutor } from '../../version/with_triggers_disabled.js';
import { Todo } from '../fixtures/Todo.js';

const rxdb = new RxDB({
  dbName: 'sqlite-core-with-triggers-disabled',
  entities: [Todo],
  sync: { local: { adapter: 'noop' }, type: SyncType.None }
});
rxdb.schemaManager.init();
rxdb.entityManager.init();

// 纯 SQL 生成场景，轻量 mock 即可——同 create_tables_sql.spec.ts / switch_branch.spec.ts 的取舍。
const adapter = {
  rxdb: { config: rxdb.config },
  encryptionContext: { keyring: null, namespace: 'with-triggers-disabled-test' }
} as unknown as RxDBAdapterSqliteBase;

const successResult = (sql: string, results: SqliteResult['results'] = []): SqliteResult => ({
  sql,
  rowsAffected: 0,
  elapsed: 1,
  results
});

/**
 * 最小 `SqlExecutor` 替身：记录每条被执行的 SQL；「当前激活分支」查询固定答 `main`
 * （重建触发器要靠它决定挂回哪条分支，答案本身不是本组用例关心的）。
 */
const createRecordingExecutor = (): { tx: SqlExecutor; calls: string[] } => {
  const calls: string[] = [];
  const tx: SqlExecutor = {
    execute: async sql => {
      calls.push(sql);
      if (sql.includes('"activated" = 1') || sql.includes('"activated" = ?')) {
        return successResult(sql, [{ columns: ['id'], rows: [['main']] }]);
      }
      return successResult(sql);
    }
  };
  return { tx, calls };
};

describe('withTriggersDisabled', () => {
  it('body 成功时应返回其结果并重建触发器', async () => {
    const { tx, calls } = createRecordingExecutor();

    const result = await withTriggersDisabled(adapter, tx, async () => 'ok');

    expect(result).toBe('ok');
    expect(calls.some(sql => sql.includes('DROP TRIGGER'))).toBe(true);
    expect(calls.some(sql => sql.includes('CREATE TRIGGER'))).toBe(true);
  });

  // body 抛错时，重建触发器那一步（原来紧跟在 `await body()` 之后的下一行）会被
  // 跳过，永久留下一个没有触发器的库——生产调用点都在 `this.transaction()` 里，body 抛错
  // 连带整个事务回滚，这个中间态从未真正提交过，掩盖了问题；但本函数经 `src/index.ts`
  // 公开导出，第三方在事务外调用时，这个中间态是真实会提交的。
  it('body 抛错时应先恢复触发器，再原样重抛原错误', async () => {
    const { tx, calls } = createRecordingExecutor();
    const bodyError = new Error('body boom');

    const rejection = await withTriggersDisabled(adapter, tx, () => {
      throw bodyError;
    }).catch((error: unknown) => error);

    expect(rejection).toBe(bodyError);
    expect(calls.some(sql => sql.includes('DROP TRIGGER'))).toBe(true);
    // 恢复必须真的跑完重挂这一步，不能停在删除之后。
    expect(calls.some(sql => sql.includes('CREATE TRIGGER'))).toBe(true);
  });

  // body 与恢复都失败时，两个原因都不能丢——只剩恢复错误可见的话，`body` 那条真正的
  // 业务错误（调用方最关心的那个）就从调用方的错误处理里消失了。
  it('body 与恢复都失败时应抛 AggregateError 且保留两个原因', async () => {
    const bodyError = new Error('body boom');
    const restoreError = new Error('restore boom');
    const tx: SqlExecutor = {
      execute: async sql => {
        if (sql.includes('CREATE TRIGGER')) throw restoreError;
        if (sql.includes('"activated" = 1') || sql.includes('"activated" = ?')) {
          return successResult(sql, [{ columns: ['id'], rows: [['main']] }]);
        }
        return successResult(sql);
      }
    };

    const rejection = await withTriggersDisabled(adapter, tx, () => {
      throw bodyError;
    }).catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(AggregateError);
    expect((rejection as AggregateError).errors).toEqual([bodyError, restoreError]);
    expect((rejection as AggregateError).cause).toBe(bodyError);
  });
});
