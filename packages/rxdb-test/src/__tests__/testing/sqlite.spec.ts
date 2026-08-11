import { describe, expect, it, vi } from 'vitest';
import { cleanupSqliteTestAdapter } from '../../testing/sqlite.js';

type Execute = (sql: string) => Promise<{ results: Array<{ rows: unknown[][] }> }>;

const tableResult = (rows: unknown[][]) => ({ results: [{ rows }] });

describe('cleanupSqliteTestAdapter', () => {
  it('runs explicit cleanup statements in a predictable order', async () => {
    const entityManager = {
      cleanAllCache: vi.fn()
    };
    const cleanAllCache = vi.fn();
    const executedSql: string[] = [];

    await cleanupSqliteTestAdapter(
      {
        rxdb: { entityManager },
        cleanAllCache,
        transaction: async callback =>
          callback({
            execute: async sql => {
              executedSql.push(sql.trim());
              if (sql.includes('sqlite_master')) {
                return tableResult([
                  ['public$todos', 'CREATE TABLE "public$todos" (...)'],
                  ['rxdb$rxdb_change', 'CREATE TABLE "rxdb$rxdb_change" (...)'],
                  ['rxdb$rxdb_branch', 'CREATE TABLE "rxdb$rxdb_branch" (...)']
                ]);
              }
              return tableResult([]);
            }
          })
      },
      {
        removeTriggersSql: 'DROP TRIGGER todo_insert;',
        restoreTriggersSql: 'CREATE TRIGGER todo_insert;',
        resetToMainBranchSql: () => 'CREATE TRIGGER todo_insert_main;',
        shouldDeleteTable: tableName => tableName !== 'rxdb$rxdb_change'
      }
    );

    expect(entityManager.cleanAllCache).toHaveBeenCalledTimes(2);
    expect(cleanAllCache).toHaveBeenCalledTimes(2);
    expect(executedSql).toEqual([
      'PRAGMA defer_foreign_keys = ON;',
      'DROP TRIGGER todo_insert;',
      "SELECT name, sql FROM sqlite_master WHERE type='table';",
      'DELETE FROM "public$todos";',
      'DELETE FROM "rxdb$rxdb_branch";',
      `INSERT INTO "rxdb$rxdb_branch" (id,activated,fromChangeId,local,remote) VALUES ('main',1,NULL,1,0);`,
      'CREATE TRIGGER todo_insert_main;'
    ]);
  });

  // 底层真实签名是 `transactionLog: boolean = true`（true = 开启变更日志），
  // 本包此前把这个位置的形参命名为 `skipLog`，语义完全相反 —— 读到 `}, false)` 的人
  // 会以为「不跳过日志 = 记录日志」，实际是「关闭日志」。清库当然不该写变更日志。
  it('disables the change log for the cleanup transaction', async () => {
    const transactionLogFlags: Array<boolean | undefined> = [];
    const transaction = async <T>(
      callback: (tx: { execute: Execute }) => Promise<T>,
      transactionLog?: boolean
    ): Promise<T> => {
      transactionLogFlags.push(transactionLog);
      return callback({ execute: async () => tableResult([]) });
    };

    await cleanupSqliteTestAdapter({ transaction });

    expect(transactionLogFlags).toEqual([false]);
  });

  it('rejects branch cleanup without a main-branch trigger reset capability', async () => {
    const transaction = async <T>(callback: (tx: { execute: Execute }) => Promise<T>): Promise<T> =>
      callback({
        execute: async sql =>
          sql.includes('sqlite_master') ?
            tableResult([['rxdb$rxdb_branch', 'CREATE TABLE "rxdb$rxdb_branch" (...)']])
          : tableResult([])
      });

    await expect(cleanupSqliteTestAdapter({ transaction })).rejects.toThrow(
      'resetToMainBranchSql is required when cleaning rxdb$rxdb_branch'
    );
  });

  it('does not reset branch state when the branch table is excluded from cleanup', async () => {
    const resetToMainBranchSql = vi.fn(() => 'SELECT reset_to_main;');
    const executedSql: string[] = [];

    await cleanupSqliteTestAdapter(
      {
        transaction: async callback =>
          callback({
            execute: async sql => {
              executedSql.push(sql.trim());
              if (sql.includes('sqlite_master')) {
                return tableResult([
                  ['public$todos', 'CREATE TABLE "public$todos" (...)'],
                  ['rxdb$rxdb_branch', 'CREATE TABLE "rxdb$rxdb_branch" (...)']
                ]);
              }
              return tableResult([]);
            }
          })
      },
      {
        resetToMainBranchSql,
        shouldDeleteTable: tableName => tableName !== 'rxdb$rxdb_branch'
      }
    );

    expect(resetToMainBranchSql).not.toHaveBeenCalled();
    expect(executedSql).not.toContain('SELECT reset_to_main;');
  });

  // 默认清理必须真的把库清空：
  // - FTS5 虚表若不清，基表 DELETE 又被 removeTriggersSql 掐掉触发器，索引里旧行原样留着，
  //   reset 后仍能搜到「已删除」的文章；影子表（_data/_idx/_content/...）由虚表自己维护，
  //   不能直接 DELETE，只能删虚表本身。
  // - rxdb$rxdb_change 若不清，上一个测试的 undo/redo 历史完整活到下一个测试。
  it('clears user tables, the change log, and FTS virtual tables by default', async () => {
    const executedSql: string[] = [];
    await cleanupSqliteTestAdapter(
      {
        transaction: async callback =>
          callback({
            execute: async sql => {
              executedSql.push(sql.trim());
              if (sql.includes('sqlite_master')) {
                return tableResult([
                  ['sqlite_sequence', 'CREATE TABLE sqlite_sequence(name,seq)'],
                  ['rxdb$rxdb_branch', 'CREATE TABLE "rxdb$rxdb_branch" (...)'],
                  ['rxdb$rxdb_change', 'CREATE TABLE "rxdb$rxdb_change" (...)'],
                  ['public$articles', 'CREATE TABLE "public$articles" (...)'],
                  ['public$articles_fts', 'CREATE VIRTUAL TABLE "public$articles_fts" USING fts5(body)'],
                  [
                    'public$articles_fts_data',
                    "CREATE TABLE 'public$articles_fts_data'(id INTEGER PRIMARY KEY, block BLOB)"
                  ]
                ]);
              }
              return tableResult([]);
            }
          })
      },
      { resetToMainBranchSql: () => 'SELECT reset_to_main;' }
    );

    // sqlite_ 内部表与 FTS 影子表不能碰；虚表本身、变更日志、分支表都要清
    expect(executedSql).not.toContain('DELETE FROM "sqlite_sequence";');
    expect(executedSql).not.toContain('DELETE FROM "public$articles_fts_data";');
    expect(executedSql).toContain('DELETE FROM "public$articles";');
    expect(executedSql).toContain('DELETE FROM "public$articles_fts";');
    expect(executedSql).toContain('DELETE FROM "rxdb$rxdb_change";');
    expect(executedSql).toContain('DELETE FROM "rxdb$rxdb_branch";');
    // 清掉分支表后必须补回 main 分支（此前这条分支在默认配置下永远不可达）
    expect(executedSql).toContain(
      `INSERT INTO "rxdb$rxdb_branch" (id,activated,fromChangeId,local,remote) VALUES ('main',1,NULL,1,0);`
    );
    expect(executedSql).toContain('SELECT reset_to_main;');
  });

  // RXT-005：影子表判定用的是「任意 `<虚表名>_` 前缀」，于是与虚表同前缀的**普通业务表**
  // （`..._audit`）和**第二张虚表**（`..._archive`）都会被误判为影子表而跳过清理，
  // 上一个测试的数据原样活到下一个测试。影子表后缀是 FTS5/RTree 固定的一组，必须精确匹配。
  it('clears same-prefix ordinary tables and sibling virtual tables', async () => {
    const executedSql: string[] = [];
    await cleanupSqliteTestAdapter({
      transaction: async callback =>
        callback({
          execute: async sql => {
            executedSql.push(sql.trim());
            if (sql.includes('sqlite_master')) {
              return tableResult([
                ['public$search', 'CREATE VIRTUAL TABLE "public$search" USING fts5(body)'],
                ['public$search_data', "CREATE TABLE 'public$search_data'(id INTEGER PRIMARY KEY, block BLOB)"],
                ['public$search_idx', "CREATE TABLE 'public$search_idx'(segid, term, pgno, PRIMARY KEY(segid, term))"],
                ['public$search_audit', 'CREATE TABLE "public$search_audit" (id TEXT PRIMARY KEY, note TEXT)'],
                ['public$search_archive', 'CREATE VIRTUAL TABLE "public$search_archive" USING fts5(body)']
              ]);
            }
            return tableResult([]);
          }
        })
    });

    // 真影子表跳过
    expect(executedSql).not.toContain('DELETE FROM "public$search_data";');
    expect(executedSql).not.toContain('DELETE FROM "public$search_idx";');
    // 同前缀的普通表与第二张虚表都必须清
    expect(executedSql).toContain('DELETE FROM "public$search";');
    expect(executedSql).toContain('DELETE FROM "public$search_audit";');
    expect(executedSql).toContain('DELETE FROM "public$search_archive";');
  });

  it('restores triggers and clears caches after a delete failure', async () => {
    const events: string[] = [];
    const execute: Execute = async sql => {
      events.push(sql.trim());
      if (sql.includes('sqlite_master')) {
        return tableResult([['public$todos', 'CREATE TABLE "public$todos" (...)']]);
      }
      if (sql.startsWith('DELETE')) throw new Error('delete failed');
      return tableResult([]);
    };

    await expect(
      cleanupSqliteTestAdapter(
        {
          rxdb: {
            entityManager: {
              cleanAllCache: async () => {
                events.push('entity-cache');
              }
            }
          },
          cleanAllCache: async () => {
            events.push('adapter-cache');
          },
          transaction: async callback => callback({ execute })
        },
        {
          removeTriggersSql: 'DROP TRIGGER todo_insert;',
          restoreTriggersSql: 'CREATE TRIGGER todo_insert;'
        }
      )
    ).rejects.toThrow('delete failed');

    expect(events).toEqual([
      'entity-cache',
      'adapter-cache',
      'PRAGMA defer_foreign_keys = ON;',
      'DROP TRIGGER todo_insert;',
      "SELECT name, sql FROM sqlite_master WHERE type='table';",
      'DELETE FROM "public$todos";',
      'CREATE TRIGGER todo_insert;',
      'entity-cache',
      'adapter-cache'
    ]);
  });

  it('does not swallow a main-branch restore failure', async () => {
    await expect(
      cleanupSqliteTestAdapter(
        {
          transaction: async callback =>
            callback({
              execute: async sql => {
                if (sql.includes('sqlite_master')) {
                  return tableResult([['rxdb$rxdb_branch', 'CREATE TABLE "rxdb$rxdb_branch" (...)']]);
                }
                if (sql.startsWith('INSERT')) throw new Error('branch restore failed');
                return tableResult([]);
              }
            })
        },
        { shouldDeleteTable: () => true, resetToMainBranchSql: () => 'SELECT reset_to_main;' }
      )
    ).rejects.toThrow('branch restore failed');
  });
});

describe('cleanupSqliteTestAdapter edge cases', () => {
  it('ignores malformed table rows, escapes identifiers, and runs custom branch SQL', async () => {
    const executedSql: string[] = [];

    await cleanupSqliteTestAdapter(
      {
        transaction: async callback =>
          callback({
            execute: async sql => {
              executedSql.push(sql.trim());
              if (sql.includes('sqlite_master')) {
                return tableResult([[null], [''], ['quoted"table', null]]);
              }
              return tableResult([]);
            }
          })
      },
      {
        insertMainBranchSql: 'INSERT INTO custom_branch VALUES (1);',
        removeTriggersSql: '   ',
        restoreTriggersSql: ''
      }
    );

    expect(executedSql).toEqual([
      'PRAGMA defer_foreign_keys = ON;',
      "SELECT name, sql FROM sqlite_master WHERE type='table';",
      'DELETE FROM "quoted""table";',
      'INSERT INTO custom_branch VALUES (1);'
    ]);
  });
});
