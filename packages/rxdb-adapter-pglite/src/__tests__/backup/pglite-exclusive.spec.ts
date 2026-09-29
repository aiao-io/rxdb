/**
 * US-217 AC#8：快照依赖的 PGlite 内部件不受 semver 约束，缺了要明确报不支持。
 */
import { isRxDBBackupError } from '@aiao/rxdb';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, describe, expect, it } from 'vitest';
import { requirePGliteExclusiveInternals } from '../../backup/pglite-exclusive.js';

const complete = () => ({
  _runExclusiveQuery: async <T>(fn: () => Promise<T>) => fn(),
  _runExclusiveTransaction: async <T>(fn: () => Promise<T>) => fn(),
  Module: { FS: {} }
});

describe('requirePGliteExclusiveInternals', () => {
  const pg = new PGlite();

  afterAll(async () => {
    await pg.close();
  });

  it('accepts the PGlite release this package is built against', async () => {
    await pg.waitReady;
    expect(requirePGliteExclusiveInternals(pg)).toBe(pg);
  });

  for (const [name, strip] of [
    ['_runExclusiveTransaction', { _runExclusiveTransaction: undefined }],
    ['_runExclusiveQuery', { _runExclusiveQuery: undefined }],
    ['Module.FS', { Module: {} }]
  ] as const) {
    it(`reports unsupported_combination naming ${name} when a release drops it`, () => {
      const error = (() => {
        try {
          requirePGliteExclusiveInternals({ ...complete(), ...strip });
        } catch (caught) {
          return caught;
        }
        return undefined;
      })();
      expect(isRxDBBackupError(error, 'unsupported_combination')).toBe(true);
      expect((error as { details: unknown }).details).toEqual({ field: 'pglite', actual: name });
    });
  }
});
