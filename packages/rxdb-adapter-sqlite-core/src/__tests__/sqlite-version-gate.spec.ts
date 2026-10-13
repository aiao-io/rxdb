/**
 * @fileoverview SQLite 宿主版本门槛（US-030 AC#7）回归测试。
 * 低于 3.47.0 的宿主在 connect() 即失败，错误点名实际版本与门槛；
 * 达标宿主放行，且每个实例只查一次。
 */

import { RxDB } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { RxDBAdapterSqliteBase, type SqliteClientLike } from '../RxDBAdapterSqliteBase.js';
import { RxDBAdapterSqliteError } from '../sqlite-core.utils.js';

class GateTestAdapter extends RxDBAdapterSqliteBase {
  readonly name = 'gate-test';

  constructor(
    rxdb: RxDB,
    private readonly versionValue: string
  ) {
    super(rxdb);
  }

  protected async createClient(): Promise<SqliteClientLike> {
    return {
      version: vi.fn().mockResolvedValue(this.versionValue),
      execute: vi.fn().mockResolvedValue({ sql: '', results: [], rowsAffected: 0, elapsed: 0 }),
      init: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn().mockResolvedValue(undefined),
      removeEventListener: vi.fn().mockResolvedValue(undefined)
    } as unknown as SqliteClientLike;
  }
}

/** 记录 client.version() 被调用的次数：门槛承诺「只查一次」。 */
class CountingGateAdapter extends GateTestAdapter {
  versionCalls = 0;

  protected override async createClient(): Promise<SqliteClientLike> {
    const client = await super.createClient();
    const original = client.version.bind(client);
    client.version = () => {
      this.versionCalls += 1;
      return original();
    };
    return client;
  }
}

const createRxdbMock = (): RxDB =>
  ({
    config: { entities: [], dbName: `gate-test-${Math.random().toString(36).slice(2, 8)}` },
    context: {},
    connect: vi.fn(),
    dispatchEvent: vi.fn(),
    schemaManager: { getEntityTypeByTableName: vi.fn(), getEntityMetadata: vi.fn(), getEntityType: vi.fn() }
  }) as unknown as RxDB;

describe('SQLite 版本门槛（US-030 AC#7）', () => {
  it('低于 3.47.0 的宿主 connect() 抛错并点名实际版本与门槛', async () => {
    const adapter = new GateTestAdapter(createRxdbMock(), '3.46.0');
    await expect(adapter.connect()).rejects.toThrow(RxDBAdapterSqliteError);
    await expect(adapter.connect()).rejects.toThrow(/3\.46\.0 低于门槛 3\.47\.0/);
    await adapter.disconnect();
  });

  it('达标宿主放行（3.47.0 与更高版本）', async () => {
    for (const version of ['3.47.0', '3.48.0', '3.53.4-build2', '3.53.0']) {
      const adapter = new GateTestAdapter(createRxdbMock(), version);
      await expect(adapter.connect()).resolves.toBeDefined();
      await adapter.disconnect();
    }
  });

  it('每个实例只查一次版本（重复 connect 不再查）', async () => {
    const adapter = new CountingGateAdapter(createRxdbMock(), '3.53.1');
    await adapter.connect();
    expect(adapter.versionCalls).toBe(1);
    // 门槛结果按实例缓存：再次 connect 不再发起查询
    await adapter.connect();
    expect(adapter.versionCalls).toBe(1);
    await adapter.disconnect();
  });
});
