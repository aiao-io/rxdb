import { describe, expect, it } from 'vitest';
import { createSqliteClient, RxDBAdapterSqlite, SQLITE_WASM_VFS_LIST, SqliteClient, sqliteLoad } from '../index.js';

describe('公开导出', () => {
  it('README 使用的适配器与客户端 API 均由入口导出', () => {
    expect(RxDBAdapterSqlite).toBeTypeOf('function');
    expect(SqliteClient).toBeTypeOf('function');
    expect(createSqliteClient).toBeTypeOf('function');
    expect(sqliteLoad).toBeTypeOf('function');
    expect(SQLITE_WASM_VFS_LIST).toHaveLength(5);
  });
});
