import { describe, expect, it, vi } from 'vitest';
import { getOrCreateUserId, readSupabaseConfig, resolveDatabaseName } from './runtime-config';

describe('runtime config', () => {
  it('reads a complete Supabase configuration', () => {
    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: ' https://example.supabase.co ',
        VITE_SUPABASE_KEY: ' sb_publishable_example '
      })
    ).toEqual({
      url: 'https://example.supabase.co',
      key: 'sb_publishable_example',
      scope: 'https://example.supabase.co'
    });
  });

  it('declares the identity scope in the same origin form the adapter reports', () => {
    // 适配器的 callerIdentity() 按 new URL(url).origin 报告 scope，身份核对是严格相等：尾斜杠、路径段都会被判成换了身份
    for (const url of [
      'https://example.supabase.co/',
      'https://example.supabase.co/rest/v1',
      'HTTPS://Example.supabase.co'
    ]) {
      expect(readSupabaseConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_KEY: 'sb_publishable_example' }).scope).toBe(
        'https://example.supabase.co'
      );
    }
    expect(() =>
      readSupabaseConfig({ VITE_SUPABASE_URL: 'example.supabase.co', VITE_SUPABASE_KEY: 'sb_publishable_example' })
    ).toThrow('VITE_SUPABASE_URL');
  });

  it('rejects browser-visible secret and service-role keys', () => {
    const serviceRolePayload = btoa(JSON.stringify({ role: 'service_role' }));
    expect(() =>
      readSupabaseConfig({
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_SUPABASE_KEY: 'sb_secret_example'
      })
    ).toThrow('public anon or publishable');
    expect(() =>
      readSupabaseConfig({
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_SUPABASE_KEY: `header.${serviceRolePayload}.signature`
      })
    ).toThrow('public anon or publishable');
  });

  it('fails fast when Supabase configuration is incomplete', () => {
    expect(() => readSupabaseConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co' })).toThrow('VITE_SUPABASE_KEY');
    expect(() => readSupabaseConfig({ VITE_SUPABASE_KEY: 'key' })).toThrow('VITE_SUPABASE_URL');
  });

  it('uses a configured user id without touching storage', () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn() };

    expect(getOrCreateUserId(' user-1 ', storage, () => 'generated')).toBe('user-1');
    expect(storage.getItem).not.toHaveBeenCalled();
  });

  it('reuses or creates a browser-local user id', () => {
    const existingStorage = { getItem: vi.fn().mockReturnValue('local-user'), setItem: vi.fn() };
    expect(getOrCreateUserId(undefined, existingStorage, () => 'generated')).toBe('local-user');

    const emptyStorage = { getItem: vi.fn().mockReturnValue(null), setItem: vi.fn() };
    expect(getOrCreateUserId(undefined, emptyStorage, () => 'generated')).toBe('generated');
    expect(emptyStorage.setItem).toHaveBeenCalledWith('dev-rxdb-supabase:user-id', 'generated');
  });

  it('uses a stable application database name and trims overrides', () => {
    expect(resolveDatabaseName(undefined)).toBe('dev-rxdb-supabase');
    expect(resolveDatabaseName(' custom-db ')).toBe('custom-db');
  });
});
