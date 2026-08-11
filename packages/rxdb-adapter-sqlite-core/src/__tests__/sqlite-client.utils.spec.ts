import { describe, expect, it } from 'vitest';
import {
  get_cached_regexp,
  get_init_sql,
  get_persistent_db_file_name,
  validateSqliteNumericOption
} from '../sqlite-client.utils.js';
import { RxDBAdapterSqliteError } from '../sqlite-core.utils.js';

describe('sqlite-client.utils', () => {
  describe('validateSqliteNumericOption', () => {
    it.each([-1, 0, Number.NaN, 1.5, '1; DROP TABLE todos'])('rejects invalid positive integers: %s', value => {
      expect(() => validateSqliteNumericOption('cacheSizeKb', value, 1024)).toThrow('options.cacheSizeKb');
    });

    it.each([-1, Number.NaN, 1.5, '0; SELECT 1'])('rejects invalid non-negative integers: %s', value => {
      expect(() => validateSqliteNumericOption('batchTimeout', value, 16, { allowZero: true })).toThrow(
        'options.batchTimeout'
      );
    });

    it('uses the default and allows zero when configured', () => {
      expect(validateSqliteNumericOption('cacheSizeKb', undefined, 1024)).toBe(1024);
      expect(validateSqliteNumericOption('batchTimeout', 0, 16, { allowZero: true })).toBe(0);
    });
  });

  describe('get_persistent_db_file_name', () => {
    it('trims and roots a separator-free database name', () => {
      expect(get_persistent_db_file_name(' app_main_cache ')).toBe('/app_main_cache.sqlite3');
    });

    it('preserves an existing sqlite3 extension', () => {
      expect(get_persistent_db_file_name('app.sqlite3')).toBe('/app.sqlite3');
    });

    // SQLC-017：把分隔符替换成 `_` 会让 `a/b` 与 `a_b` 落到同一个物理文件并互相覆盖。
    // 归一化是确定性碰撞，只能在入口拒绝。
    it.each([' app/main ', 'app\\cache', 'a/b', 'a\\b', '/leading', 'trailing/'])(
      'rejects database names containing path separators: %s',
      dbName => {
        expect(() => get_persistent_db_file_name(dbName)).toThrow(RxDBAdapterSqliteError);
        expect(() => get_persistent_db_file_name(dbName)).toThrow(/path separator/);
      }
    );

    it('does not silently map distinct names onto one file', () => {
      expect(get_persistent_db_file_name('a_b')).toBe('/a_b.sqlite3');
      expect(() => get_persistent_db_file_name('a/b')).toThrow(RxDBAdapterSqliteError);
    });
  });

  describe('get_cached_regexp', () => {
    it('reuses the same regexp for an identical pattern and flags', () => {
      const regexp = get_cached_regexp('sqlite-core-cache-hit', 'i');

      expect(get_cached_regexp('sqlite-core-cache-hit', 'i')).toBe(regexp);
    });

    it('keeps different flags in separate cache entries', () => {
      const caseSensitive = get_cached_regexp('sqlite-core-flags');
      const caseInsensitive = get_cached_regexp('sqlite-core-flags', 'i');

      expect(caseSensitive).not.toBe(caseInsensitive);
      expect(caseSensitive.test('SQLITE-CORE-FLAGS')).toBe(false);
      expect(caseInsensitive.test('SQLITE-CORE-FLAGS')).toBe(true);
    });

    it('rejects oversized patterns', () => {
      expect(() => get_cached_regexp('x'.repeat(1001))).toThrow('regexp pattern too long');
    });

    it('clears old entries after reaching the cache limit', () => {
      const oldest = get_cached_regexp('sqlite-core-cache-oldest');

      for (let index = 0; index < 128; index++) {
        get_cached_regexp(`sqlite-core-cache-fill-${String(index)}`);
      }

      expect(get_cached_regexp('sqlite-core-cache-oldest')).not.toBe(oldest);
    });
  });

  describe('get_init_sql', () => {
    it('uses durable WAL pragmas for OPFS databases', () => {
      const sql = get_init_sql(4096, true);

      expect(sql).toContain('PRAGMA cache_size = -4096');
      expect(sql).toContain('PRAGMA journal_mode = WAL');
      expect(sql).toContain('PRAGMA synchronous = NORMAL');
      expect(sql).toContain('PRAGMA wal_autocheckpoint = 1000');
    });

    it('uses in-memory pragmas for non-persistent databases', () => {
      const sql = get_init_sql(2048, false);

      expect(sql).toContain('PRAGMA cache_size = -2048');
      expect(sql).toContain('PRAGMA journal_mode = MEMORY');
      expect(sql).toContain('PRAGMA synchronous = OFF');
      expect(sql).not.toContain('PRAGMA wal_autocheckpoint');
    });
  });
});
