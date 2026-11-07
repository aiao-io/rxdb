import { describe, expect, it } from 'vitest';
import { readRuntimeConfig } from './runtime-config';

describe('readRuntimeConfig', () => {
  it('reads the settings that /app-config.js put on the global object', () => {
    const scope = { __P2P_CONFIG__: { supabaseUrl: 'http://supabase.test', supabaseAnonKey: 'anon' } };

    expect(readRuntimeConfig(scope)).toEqual({ supabaseUrl: 'http://supabase.test', supabaseAnonKey: 'anon' });
  });

  it('explains that the config script is missing', () => {
    expect(() => readRuntimeConfig({})).toThrow('/app-config.js did not load');
  });

  it('rejects an incomplete config', () => {
    expect(() => readRuntimeConfig({ __P2P_CONFIG__: { supabaseUrl: 'http://supabase.test' } })).toThrow(
      'must define supabaseUrl and supabaseAnonKey'
    );
  });
});
