import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  BATCH_TIMEOUT,
  type SqliteLoadOptions,
  type SqliteOptions,
  type SqliteRepositoryConstructor
} from '../index.js';

describe('sqlite official public API', () => {
  it('从根入口公开批处理档位和公共签名类型', () => {
    const repositoryConstructor: SqliteRepositoryConstructor<never> | undefined = undefined;

    expect(BATCH_TIMEOUT.BALANCED).toBe(16);
    expectTypeOf<SqliteLoadOptions>().toMatchTypeOf<object>();
    expectTypeOf<SqliteOptions>().toMatchTypeOf<object>();
    expect(repositoryConstructor).toBeUndefined();
  });
});
