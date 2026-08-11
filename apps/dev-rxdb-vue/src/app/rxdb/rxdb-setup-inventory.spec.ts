import { describe, expect, it } from 'vitest';

const setupModules = import.meta.glob('./setup_rxdb_*', {
  eager: true,
  import: 'default',
  query: '?raw'
});

describe('RxDB setup inventory', () => {
  it('keeps only the production sqlite-wasm setup', () => {
    expect(Object.keys(setupModules)).toEqual(['./setup_rxdb_sqlite-wasm.ts']);
  });
});
