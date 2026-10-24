import type { RxDB } from '@aiao/rxdb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectLocalAdapter, dbConnectionError } from './db-connection';

/**
 * @fileoverview 本地数据库连接失败要登记下来给应用壳显示（US-221；React / Vue 端同名 spec 的移植）。
 */

/** 只带连接相关字段的假实例；`adapter` 为 `null` 表示没配本地适配器。 */
const fakeDb = (connect: () => Promise<unknown>, adapter: string | null = 'sqlite-wasm') =>
  ({
    config: { sync: { local: adapter === null ? undefined : { adapter } } },
    connect: vi.fn(connect)
  }) as unknown as RxDB;

describe('connectLocalAdapter', () => {
  beforeEach(() => {
    dbConnectionError.set(null);
  });

  it('连上：按配置的本地适配器连接，不登记错误', async () => {
    const db = fakeDb(() => Promise.resolve({}));

    await connectLocalAdapter(db);

    expect(db.connect).toHaveBeenCalledWith('sqlite-wasm');
    expect(dbConnectionError()).toBeNull();
  });

  it('连不上：登记错误信息后照常抛出', async () => {
    const failure = new Error('OPFS database file "x.sqlite" is held by another context');

    await expect(connectLocalAdapter(fakeDb(() => Promise.reject(failure)))).rejects.toBe(failure);
    expect(dbConnectionError()).toBe(failure.message);
  });

  it('没配本地适配器：抛配置错误，不去连接', async () => {
    const db = fakeDb(() => Promise.resolve({}), null);

    await expect(connectLocalAdapter(db)).rejects.toThrow(/sync\.local\.adapter is not configured/);
    expect(db.connect).not.toHaveBeenCalled();
  });
});
