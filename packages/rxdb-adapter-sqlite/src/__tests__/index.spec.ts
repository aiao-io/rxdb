import {
  RxDBAdapterSqliteError as CoreAdapterError,
  SqliteRepository as CoreRepository,
  buildRuleGroup as coreBuildRuleGroup,
  get_table_name as coreGetTableName,
  get_table_name_by_metadata as coreGetTableNameByMetadata,
  ROWID as coreRowId,
  type RxDBAdapterSqliteBase as CoreAdapterBase,
  type GenerateSqlResult as CoreGenerateSqlResult
} from '@aiao/rxdb-adapter-sqlite-core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  ROWID,
  RxDBAdapterSqlite,
  RxDBAdapterSqliteError,
  RxDBAdapterSqliteOfficial,
  SqliteClient,
  SqliteOfficialClient,
  SqliteRepository,
  buildRuleGroup,
  resetSqliteLoadCache,
  resetSqliteOfficialLoadCache,
  sqliteGetTableName,
  sqliteGetTableNameByMetadata,
  sqliteLoad,
  sqliteOfficialLoad,
  type GenerateSqlResult,
  type RxDBAdapterSqliteBase
} from '../index.js';

describe('public exports', () => {
  it('应该保留官方命名别名和 core 运行时导出', () => {
    expect(RxDBAdapterSqliteOfficial).toBe(RxDBAdapterSqlite);
    expect(SqliteOfficialClient).toBe(SqliteClient);
    expect(resetSqliteOfficialLoadCache).toBe(resetSqliteLoadCache);
    expect(sqliteOfficialLoad).toBe(sqliteLoad);
    expect(ROWID).toBe(coreRowId);
    expect(RxDBAdapterSqliteError).toBe(CoreAdapterError);
    expect(SqliteRepository).toBe(CoreRepository);
    expect(buildRuleGroup).toBe(coreBuildRuleGroup);
    expect(sqliteGetTableName).toBe(coreGetTableName);
    expect(sqliteGetTableNameByMetadata).toBe(coreGetTableNameByMetadata);
  });

  it('应该从 core 对称导出公共类型', () => {
    expectTypeOf<RxDBAdapterSqliteBase>().toEqualTypeOf<CoreAdapterBase>();
    expectTypeOf<GenerateSqlResult>().toEqualTypeOf<CoreGenerateSqlResult>();
  });
});
