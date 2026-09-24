import { ACTIVE_BRANCH_KEY } from '@aiao/rxdb';
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
      `INSERT INTO "rxdb$rxdb_branch" (id,activated,activeKey,fromChangeId,local,remote) VALUES ('main',1,'${ACTIVE_BRANCH_KEY}',NULL,1,0);`,
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
    // 清掉分支表后必须补回 main 分支（此前这条分支在默认配置下永远不可达），
    // 且补回的那一行要带上哨兵键：写 `activated` 不写 `activeKey`，补回来的 main
    // 就退出「至多一个 active」的唯一约束管辖，而且不报任何错。
    expect(executedSql).toContain(
      `INSERT INTO "rxdb$rxdb_branch" (id,activated,activeKey,fromChangeId,local,remote) VALUES ('main',1,'${ACTIVE_BRANCH_KEY}',NULL,1,0);`
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

/** 真实事务句柄（`SqliteTransactionExecutor`）带 `saveMany`；共享最小结构里只有 `execute`。 */
type TxWithSaveMany = {
  execute: Execute;
  saveMany: (rows: unknown[]) => Promise<unknown[]>;
};

describe('cleanupSqliteTestAdapter 初始行回放', () => {
  // 清库要回到的是**新库形态**，而新库形态由 `RxDB.createTables()` 定义：main 分支行
  // **加上**每个系统能力贡献的初始行。逐表 DELETE 把后半截一并清掉了，补回来的时机
  // 卡得很死，两头都不能挪：
  //
  // - 必须在 main 分支行**之后**：那些行按分支挂靠，main 还不存在时写它们是悬空外键。
  // - 必须在 `resetToMainBranchSql` **之前**：那段 SQL 把触发器装回去了，之后再写行
  //   就会被记成一次用户编辑，清理动作自己在下一个用例的 undo 栈里留下一格。
  //
  // 后一条也正是这个钩子存在的理由 —— 调用方拿不到这个窗口，`cleanupSqliteTestAdapter`
  // 返回时触发器已经挂回去了。
  it('在补回 main 之后、重装触发器之前写初始行', async () => {
    const executedSql: string[] = [];
    const savedRows: unknown[] = [];

    await cleanupSqliteTestAdapter(
      {
        transaction: async callback =>
          callback({
            execute: async sql => {
              executedSql.push(sql.trim());
              if (sql.includes('sqlite_master')) {
                return tableResult([['rxdb$rxdb_branch', 'CREATE TABLE "rxdb$rxdb_branch" (...)']]);
              }
              return tableResult([]);
            },
            saveMany: async (rows: unknown[]) => {
              executedSql.push('<saveMany>');
              savedRows.push(...rows);
              return rows;
            }
          })
      },
      {
        removeTriggersSql: 'DROP TRIGGER todo_insert;',
        resetToMainBranchSql: () => 'CREATE TRIGGER todo_insert_main;',
        // 钩子形参标注成夹具自己的句柄类型 —— `TTx` 就是从这里推出来的，随后适配器的
        // `transaction` 反过来被**检查**是否真交得出这种句柄。写实体要用的 `saveMany`
        // 不在共享最小结构里，这条断言正是「共享工具不认识它、调用方认识」的分工本身。
        restoreInitialRows: async (tx: TxWithSaveMany) => {
          await tx.saveMany([{ id: 'wt-main' }]);
        }
      }
    );

    expect(savedRows).toEqual([{ id: 'wt-main' }]);
    expect(executedSql).toEqual([
      'PRAGMA defer_foreign_keys = ON;',
      'DROP TRIGGER todo_insert;',
      "SELECT name, sql FROM sqlite_master WHERE type='table';",
      'DELETE FROM "rxdb$rxdb_branch";',
      `INSERT INTO "rxdb$rxdb_branch" (id,activated,activeKey,fromChangeId,local,remote) VALUES ('main',1,'${ACTIVE_BRANCH_KEY}',NULL,1,0);`,
      '<saveMany>',
      'CREATE TRIGGER todo_insert_main;'
    ]);
  });

  // 钩子抛错必须掀掉整个清理事务，不能被吞掉：初始行没补上的库是「有 main、没有工作树
  // 单例」的半残形态，让它悄悄进入下一个用例，症状会落在那个用例的第一次 `createBranch()`
  // 上 —— 离真正的原因隔着一整条用例。
  it('钩子抛错时整体失败，不留半残库', async () => {
    const executedSql: string[] = [];

    await expect(
      cleanupSqliteTestAdapter(
        {
          transaction: async callback =>
            callback({
              execute: async sql => {
                executedSql.push(sql.trim());
                if (sql.includes('sqlite_master')) {
                  return tableResult([['rxdb$rxdb_branch', 'CREATE TABLE "rxdb$rxdb_branch" (...)']]);
                }
                return tableResult([]);
              }
            })
        },
        {
          resetToMainBranchSql: () => 'CREATE TRIGGER todo_insert_main;',
          restoreInitialRows: async () => {
            throw new Error('initial rows failed');
          }
        }
      )
    ).rejects.toThrow('initial rows failed');

    // 触发器没被装回去 —— 事务本身要回滚，这里只确认失败点之后不再继续往下走。
    expect(executedSql).not.toContain('CREATE TRIGGER todo_insert_main;');
  });

  // restoreInitialRows 写的是按分支挂靠的行，前提是 rxdb$rxdb_branch 本轮被清空、只剩 main
  // 一行。分支表在库里、却被 shouldDeleteTable 留下时，它可能残留上一轮任意分支组合的旧行，
  // 钩子写进去轻则撞唯一约束、报一条读不出原因的底层 SQL 错误，重则在没有唯一约束的表上
  // 悄悄产出重复行。这是清理配置自相矛盾，与缺 resetToMainBranchSql 同类，必须在任何 DELETE
  // 之前拒绝——所以这里让 shouldDeleteTable 只留分支表、照常清 public$todos，只放行
  // 「钩子没被调用」而放过半截清理的实现会在 executedSql 上露馅。
  it('分支表被 shouldDeleteTable 留下时拒绝 restoreInitialRows，且在任何 DELETE 之前', async () => {
    const executedSql: string[] = [];
    let restoreInitialRowsCalled = false;

    await expect(
      cleanupSqliteTestAdapter(
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
          shouldDeleteTable: tableName => tableName !== 'rxdb$rxdb_branch',
          restoreInitialRows: async () => {
            restoreInitialRowsCalled = true;
          }
        }
      )
    ).rejects.toThrow(/restoreInitialRows requires rxdb\$rxdb_branch to be cleared/);

    expect(restoreInitialRowsCalled).toBe(false);
    expect(executedSql).toEqual([
      'PRAGMA defer_foreign_keys = ON;',
      "SELECT name, sql FROM sqlite_master WHERE type='table';"
    ]);
  });

  // 库里压根没有分支表（只聚焦单表行为的夹具）时无旧行可残留，钩子照常调用，不能与
  // 「分支表在、却被留下」一概而论地拒绝。
  it('库里没有分支表时照常调用 restoreInitialRows', async () => {
    let restoreInitialRowsCalled = false;

    await cleanupSqliteTestAdapter(
      {
        transaction: async callback =>
          callback({
            execute: async sql =>
              sql.includes('sqlite_master') ?
                tableResult([['public$todos', 'CREATE TABLE "public$todos" (...)']])
              : tableResult([])
          })
      },
      {
        restoreInitialRows: async () => {
          restoreInitialRowsCalled = true;
        }
      }
    );

    expect(restoreInitialRowsCalled).toBe(true);
  });
});
