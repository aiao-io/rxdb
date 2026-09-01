/**
 * wa-sqlite 搜索后端拒绝入口（US-703 AC#8）。
 *
 * npm `wa-sqlite` 的预编译 wasm（dist/wa-sqlite-async.wasm）未编入 FTS5 模块，
 * 因此 `wa-sqlite` 在 {@link SEARCH_BACKEND_DESCRIPTORS} 中登记为 `unverified`。
 * 本入口用真实 wa-sqlite 连接验证：连接本身可用（普通 SQLite 功能齐全），
 * 但搜索插件在构造期就被可判别原因拒绝，而不是等第一条 SQL 才报出与真因
 * 相距甚远的错误。
 */
import type { RxDBAdapterSqliteBase } from '@aiao/rxdb-adapter-sqlite-core';
import { waSqliteFactory } from '@aiao/rxdb-adapter-wa-sqlite/testing';
import { describe, expect, it } from 'vitest';

import { rxDBPluginSearch } from '../plugin.js';
import { SearchUnsupportedAdapterError } from '../types.js';

describe('wa-sqlite search backend (US-703 AC#8)', () => {
  it('装载即被可判别原因拒绝：wa-sqlite wasm 未编入 FTS5 模块', async () => {
    const adapter = await waSqliteFactory.createAdapter<RxDBAdapterSqliteBase>();
    try {
      try {
        rxDBPluginSearch(adapter.rxdb, {});
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SearchUnsupportedAdapterError);
        const typed = error as SearchUnsupportedAdapterError;
        expect(typed.adapter).toBe('wa-sqlite');
        expect(typed.reason).toContain('SQLITE_ENABLE_FTS5');
      }
    } finally {
      await adapter.rxdb.disconnectAll();
    }
  });
});
