import { describe, expect, it } from 'vitest';

import { assertSupportedAdapter, SUPPORTED_SEARCH_ADAPTERS } from '../core/adapter-guard.js';
import { rxDBPluginSearch } from '../plugin.js';
import { SearchUnsupportedAdapterError } from '../types.js';

describe('Adapter guard (T026 / US-703 AC#8)', () => {
  it('accepts the whole SQLite FTS5 family plus pglite', () => {
    for (const good of ['sqlite-wasm', 'wa-sqlite', 'sqlite', 'sqliteai', 'pglite'] as const) {
      expect(() => assertSupportedAdapter(good)).not.toThrow();
    }
  });

  it('rejects adapters without a local SQL connection, and unset adapters', () => {
    for (const bad of ['supabase', 'http', 'sqlite-electron', 'sqlite-tauri', undefined, ''] as const) {
      expect(() => assertSupportedAdapter(bad as string)).toThrow(SearchUnsupportedAdapterError);
    }
  });

  it('white-list is derived from the registry and holds exactly the admitted adapters', () => {
    expect([...SUPPORTED_SEARCH_ADAPTERS].sort()).toEqual(['pglite', 'sqlite', 'sqlite-wasm', 'sqliteai', 'wa-sqlite']);
  });

  it('plugin factory fail-fast at construction when adapter is unsupported', () => {
    const fakeRxdb = { config: { sync: { local: { adapter: 'supabase' } } } } as never;
    expect(() => rxDBPluginSearch(fakeRxdb, {})).toThrow(SearchUnsupportedAdapterError);
  });

  it('plugin factory succeeds for both backends', () => {
    for (const good of ['sqlite-wasm', 'pglite'] as const) {
      const fakeRxdb = { config: { sync: { local: { adapter: good } } } } as never;
      expect(() => rxDBPluginSearch(fakeRxdb, {})).not.toThrow();
    }
  });

  it('SearchUnsupportedAdapterError exposes detected adapter name', () => {
    try {
      assertSupportedAdapter('supabase');
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SearchUnsupportedAdapterError);
      expect((e as SearchUnsupportedAdapterError).adapter).toBe('supabase');
    }
  });

  it('the rejection reason is discriminable, not just "not in the set"', () => {
    // 未登记（缺本地 SQL 连接）与已登记但待实测，是两种完全不同的处置，
    // 错误消息必须能把它们区分开——这正是 AC#8 要求「能力表 + 原因码」而非名单的理由。
    const missing = (() => {
      try {
        assertSupportedAdapter('supabase');
      } catch (e) {
        return e as SearchUnsupportedAdapterError;
      }
      throw new Error('should have thrown');
    })();
    const unverified = (() => {
      try {
        assertSupportedAdapter('wa-sqlite-miniprogram');
      } catch (e) {
        return e as SearchUnsupportedAdapterError;
      }
      throw new Error('should have thrown');
    })();

    expect(missing.reason).toContain('does not expose a local SQL connection');
    expect(unverified.reason).toContain('has not been verified');
    expect(unverified.reason).not.toBe(missing.reason);
  });
});
