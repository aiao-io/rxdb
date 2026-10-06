import type { RxDB } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { RxDBAdapterSqliteBase, type SqliteClientLike } from '../RxDBAdapterSqliteBase.js';

class DelayedAdapter extends RxDBAdapterSqliteBase {
  readonly name = 'review-parallel-delayed';

  constructor(
    rxdb: RxDB,
    private readonly factory: () => Promise<SqliteClientLike>
  ) {
    super(rxdb);
  }

  protected createClient(): Promise<SqliteClientLike> {
    return this.factory();
  }
}

describe('并行评审：关闭必须覆盖在途客户端构造', () => {
  it('构造晚于 disconnect 完成的连接不能留在已关闭 adapter 内', async () => {
    const started = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<SqliteClientLike>();
    const close = vi.fn<SqliteClientLike['disconnect']>().mockResolvedValue(undefined);
    const client: SqliteClientLike = {
      disconnect: close,
      addEventListener: vi.fn(),
      version: async () => 'review',
      execute: async sql => ({ sql, results: [], rowsAffected: 0, elapsed: 0 })
    };
    const rxdb = { config: { entities: [], dbName: 'review-parallel-lifecycle' }, context: {} } as unknown as RxDB;
    const adapter = new DelayedAdapter(rxdb, () => {
      started.resolve();
      return gate.promise;
    });
    const connecting = adapter.connect();
    await started.promise;
    const stopping = adapter.disconnect();
    await Promise.race([stopping, new Promise<void>(resolve => setTimeout(resolve, 0))]);
    gate.resolve(client);
    try {
      await Promise.allSettled([connecting, stopping]);
      expect(close).toHaveBeenCalledTimes(1);
    } finally {
      await adapter.disconnect();
    }
  });
});
