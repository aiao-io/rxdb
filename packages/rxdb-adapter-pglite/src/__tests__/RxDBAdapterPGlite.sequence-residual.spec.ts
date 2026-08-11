import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  const clientInstances: MockPGliteClient[] = [];
  let failInit = false;

  class MockPGliteClient {
    readonly exec = vi.fn(async () => []);
    // last_value 声明为 string | number：PG 的 bigint 经驱动回来是字符串，
    // 本用例正是要覆盖字符串与数字两种形态
    readonly query = vi.fn(
      async (): Promise<{ rows: { last_value: string | number }[]; fields: unknown[]; affectedRows: number }> => ({
        rows: [{ last_value: 1 }],
        fields: [],
        affectedRows: 0
      })
    );
    readonly describeQuery = vi.fn(async () => ({}));
    readonly transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({}));
    readonly runExclusive = vi.fn(async (fn: () => Promise<unknown>) => fn());
    readonly liveQuery = vi.fn(async () => ({}));
    readonly disconnect = vi.fn(async () => undefined);
    readonly version = vi.fn(async () => 'mock-version');
    readonly flushPendingNotifications = vi.fn(async () => false);
    readonly init = vi.fn(async () => {
      if (failInit) throw new Error('init boom');
    });
    addEventListener = vi.fn();
    removeEventListener = vi.fn();

    constructor() {
      clientInstances.push(this);
    }
  }

  return {
    clientInstances,
    MockPGliteClient,
    setFailInit(value: boolean) {
      failInit = value;
    }
  };
});

vi.mock('../PGliteClient.js', () => ({
  PGliteClient: state.MockPGliteClient,
  PGliteChangeType: { INSERT: 'INSERT', UPDATE: 'UPDATE', DELETE: 'DELETE' }
}));

import type { RxDB } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

describe('RxDBAdapterPGlite sequence residual', () => {
  afterEach(async () => {
    state.setFailInit(false);
    state.clientInstances.length = 0;
    vi.clearAllMocks();
  });

  it('returns 0 for empty sequence rows and parses string last_value', async () => {
    const adapter = new RxDBAdapterPGlite({ config: { dbName: 'seq-residual', entities: [] } } as unknown as RxDB, {
      store: 'memory'
    });
    await adapter.connect();
    const client = state.clientInstances[0]!;

    client.query.mockResolvedValueOnce({ rows: [], fields: [], affectedRows: 0 });
    await expect(adapter.getRxDBChangeSequence()).resolves.toBe(0);

    client.query.mockResolvedValueOnce({ rows: [{ last_value: '77' }], fields: [], affectedRows: 1 });
    await expect(adapter.getRxDBChangeSequence()).resolves.toBe(77);

    client.query.mockResolvedValueOnce({ rows: [{ last_value: 88 }], fields: [], affectedRows: 1 });
    await expect(adapter.getRxDBChangeSequence()).resolves.toBe(88);

    await adapter.disconnect();
  });

  it('rethrows client init failures and clears client promise', async () => {
    state.setFailInit(true);
    const adapter = new RxDBAdapterPGlite({ config: { dbName: 'seq-init-fail', entities: [] } } as unknown as RxDB, {
      store: 'memory'
    });
    await expect(adapter.connect()).rejects.toThrow(/init boom/);
  });
});
