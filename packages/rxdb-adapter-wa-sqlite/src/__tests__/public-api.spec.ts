import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  BATCH_TIMEOUT,
  type LoadedSqlite,
  type LoadModuleOptions,
  type SupportVFS,
  WA_SQLITE_VFS_LIST,
  type WaSqliteVfsConfig
} from '../index.js';

describe('wa-sqlite public API', () => {
  it('从包根导出公开配置与加载结果类型', () => {
    expect(BATCH_TIMEOUT.BALANCED).toBe(16);
    expect(WA_SQLITE_VFS_LIST).toHaveLength(9);
    expectTypeOf<LoadModuleOptions>().toMatchTypeOf<object>();
    expectTypeOf<LoadedSqlite>().toMatchTypeOf<object>();
    expectTypeOf<SupportVFS>().toMatchTypeOf<string>();
    expectTypeOf<WaSqliteVfsConfig>().toMatchTypeOf<object>();
  });
});
