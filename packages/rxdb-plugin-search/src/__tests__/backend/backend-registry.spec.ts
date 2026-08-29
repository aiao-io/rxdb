import { describe, expect, it } from 'vitest';

import {
  createSearchBackend,
  lookupSearchBackendDescriptor,
  resolveSearchBackend,
  SEARCH_BACKEND_DESCRIPTORS
} from '../../backend/backend-registry.js';
import { SearchUnsupportedAdapterError } from '../../types.js';

describe('search backend registry (US-703 AC#8)', () => {
  it('registers every sqlite-core family adapter against the fts5 backend', () => {
    for (const adapter of ['sqlite-wasm', 'wa-sqlite', 'sqlite', 'sqliteai']) {
      const descriptor = lookupSearchBackendDescriptor(adapter);
      expect(descriptor, adapter).toBeDefined();
      expect(descriptor?.backend, adapter).toBe('fts5');
      expect(descriptor?.status, adapter).toBe('supported');
    }
  });

  it('registers pglite against the pg-tsvector backend', () => {
    expect(lookupSearchBackendDescriptor('pglite')).toMatchObject({ backend: 'pg-tsvector', status: 'supported' });
  });

  it('每个 descriptor 的 adapter 名唯一', () => {
    const names = SEARCH_BACKEND_DESCRIPTORS.map(d => d.adapter);
    expect(new Set(names).size).toBe(names.length);
  });

  it('unverified 条目必须给出可判别原因，而不是缺席', () => {
    const unverified = SEARCH_BACKEND_DESCRIPTORS.filter(d => d.status === 'unverified');
    expect(unverified.length).toBeGreaterThan(0);
    for (const descriptor of unverified) {
      expect(descriptor.reason, descriptor.adapter).toBeTruthy();
    }
    // 决策 2：小程序宿主本机无法实测 FTS5，登记为 unverified 而不是静默放行
    expect(unverified.map(d => d.adapter)).toContain('wa-sqlite-miniprogram');
  });

  it('resolveSearchBackend 对 unverified 适配器抛出带原因的错误（不是「名字不在 Set 里」）', () => {
    const descriptor = lookupSearchBackendDescriptor('wa-sqlite-miniprogram');
    expect(descriptor?.status).toBe('unverified');
    try {
      resolveSearchBackend('wa-sqlite-miniprogram');
      expect.fail('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(SearchUnsupportedAdapterError);
      const typed = error as SearchUnsupportedAdapterError;
      expect(typed.adapter).toBe('wa-sqlite-miniprogram');
      expect(typed.reason).toBe(descriptor?.reason);
      expect(typed.message).toContain(descriptor?.reason as string);
    }
  });

  it('resolveSearchBackend 对完全未登记的适配器抛出错误', () => {
    for (const adapter of ['http', 'supabase', 'sqlite-electron', 'sqlite-tauri', undefined, '']) {
      expect(() => resolveSearchBackend(adapter as string | undefined), String(adapter)).toThrow(
        SearchUnsupportedAdapterError
      );
    }
  });

  it('resolveSearchBackend 返回与 descriptor 一致的 backend 实例', () => {
    expect(resolveSearchBackend('sqlite-wasm').id).toBe('fts5');
    expect(resolveSearchBackend('wa-sqlite').id).toBe('fts5');
    expect(resolveSearchBackend('pglite').id).toBe('pg-tsvector');
  });

  it('两个 backend 都声明完整能力集合', () => {
    for (const id of ['fts5', 'pg-tsvector'] as const) {
      const backend = createSearchBackend(id);
      expect(backend.id).toBe(id);
      expect(backend.capabilities).toEqual({
        fullTextIndex: true,
        snippet: true,
        containsFallback: true,
        arrayFields: true
      });
      expect(backend.compile).toBeTypeOf('function');
      expect(backend.install).toBeTypeOf('function');
      expect(backend.createEngine).toBeTypeOf('function');
      expect(backend.assertCapabilities).toBeTypeOf('function');
    }
  });
});
