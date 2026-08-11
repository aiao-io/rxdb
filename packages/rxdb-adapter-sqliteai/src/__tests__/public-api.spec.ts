import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  BATCH_TIMEOUT,
  type SqliteaiLoadOptions,
  type SqliteaiOptions,
  type SqliteaiRepositoryConstructor
} from '../index.js';

describe('sqliteai public API', () => {
  it('从根入口公开批处理档位和公共签名类型', () => {
    const repositoryConstructor: SqliteaiRepositoryConstructor<never> | undefined = undefined;

    expect(BATCH_TIMEOUT.BALANCED).toBe(16);
    expectTypeOf<SqliteaiLoadOptions>().toMatchTypeOf<object>();
    expectTypeOf<SqliteaiOptions>().toMatchTypeOf<object>();
    expect(repositoryConstructor).toBeUndefined();
  });
});
