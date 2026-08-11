import { describe, expect, it } from 'vitest';

import { assertSupportedAdapter, SUPPORTED_SEARCH_ADAPTERS } from '../core/adapter-guard.js';
import { rxDBPluginSearch } from '../plugin.js';
import { SearchUnsupportedAdapterError } from '../types.js';

describe('Adapter guard (T026)', () => {
  it('accepts sqlite-wasm', () => {
    expect(() => assertSupportedAdapter('sqlite-wasm')).not.toThrow();
  });

  it('rejects pglite / wa-sqlite / supabase / undefined', () => {
    for (const bad of ['pglite', 'wa-sqlite', 'supabase', 'sqlite', undefined, ''] as const) {
      expect(() => assertSupportedAdapter(bad as string)).toThrow(SearchUnsupportedAdapterError);
    }
  });

  it('white-list contains only sqlite-wasm in this version', () => {
    expect([...SUPPORTED_SEARCH_ADAPTERS]).toEqual(['sqlite-wasm']);
  });

  it('plugin factory fail-fast at construction when adapter is unsupported', () => {
    const fakeRxdb = { config: { sync: { local: { adapter: 'pglite' } } } } as never;
    expect(() => rxDBPluginSearch(fakeRxdb, {})).toThrow(SearchUnsupportedAdapterError);
  });

  it('plugin factory succeeds when adapter is sqlite-wasm', () => {
    const fakeRxdb = { config: { sync: { local: { adapter: 'sqlite-wasm' } } } } as never;
    expect(() => rxDBPluginSearch(fakeRxdb, {})).not.toThrow();
  });

  it('SearchUnsupportedAdapterError exposes detected adapter name', () => {
    try {
      assertSupportedAdapter('wa-sqlite');
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SearchUnsupportedAdapterError);
      expect((e as SearchUnsupportedAdapterError).adapter).toBe('wa-sqlite');
    }
  });
});
