import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  const clientInstances: MockPGliteClient[] = [];
  const pendingCalls: Array<{ tableName: string; resolve: () => void }> = [];
  const handleRxdbChange = vi.fn(
    (_adapter: unknown, event: { tableName: string }) =>
      new Promise<void>(resolve => {
        pendingCalls.push({ tableName: event.tableName, resolve });
      })
  );
  const createBranch = vi.fn(async () => ({ id: 'feature-mock' }));
  const switchBranch = vi.fn(async () => undefined);

  class MockPGliteClient {
    readonly #listeners = new Map<string, Set<(event: unknown) => void>>();
    readonly exec = vi.fn(async () => []);
    readonly query = vi.fn(async () => ({ rows: [], fields: [], affectedRows: 0 }));
    readonly describeQuery = vi.fn(async () => ({}));
    readonly transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({}));
    readonly runExclusive = vi.fn(async (fn: () => Promise<unknown>) => fn());
    readonly liveQuery = vi.fn(async () => ({}));
    readonly disconnect = vi.fn(async () => undefined);
    readonly version = vi.fn(async () => 'mock-version');
    readonly flushPendingNotifications = vi.fn(async () => false);
    readonly init = vi.fn(async () => undefined);
    pendingNotificationCount = 0;

    constructor() {
      clientInstances.push(this);
    }

    addEventListener(type: string, listener: (event: unknown) => void): void {
      const listeners = this.#listeners.get(type) ?? new Set();
      listeners.add(listener);
      this.#listeners.set(type, listeners);
    }

    removeEventListener(type: string, listener: (event: unknown) => void): void {
      this.#listeners.get(type)?.delete(listener);
    }

    emit(type: string, event: unknown): void {
      for (const listener of this.#listeners.get(type) ?? []) {
        listener(event);
      }
    }
  }

  return {
    clientInstances,
    pendingCalls,
    handleRxdbChange,
    createBranch,
    switchBranch,
    MockPGliteClient
  };
});

vi.mock('../handle_rxdb_change.js', () => ({
  handle_rxdb_change: state.handleRxdbChange
}));

vi.mock('../PGliteClient.js', () => ({
  // 结构化判定与真实实现保持一致：mock 客户端只要有这对方法就算变更事件源。
  asPGliteChangeEventSource: (client: unknown) => {
    const candidate = client as { addEventListener?: unknown; removeEventListener?: unknown } | null;
    if (typeof candidate?.addEventListener !== 'function') return undefined;
    if (typeof candidate.removeEventListener !== 'function') return undefined;
    return candidate;
  },
  PGliteClient: state.MockPGliteClient
}));

vi.mock('../version/create_branch.js', () => ({
  default: state.createBranch
}));

vi.mock('../version/switch_branch.js', () => ({
  switch_branch: state.switchBranch,
  generateSwitchBranchSql: () => ''
}));

import type { RxDB } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { PGliteChangeEvent, PGliteChangeType } from '../pglite.interface.js';

describe('RxDBAdapterPGlite mock residual paths', () => {
  let adapter: RxDBAdapterPGlite;
  let client: InstanceType<typeof state.MockPGliteClient>;

  beforeEach(async () => {
    state.clientInstances.length = 0;
    state.pendingCalls.length = 0;
    state.handleRxdbChange.mockClear();
    state.createBranch.mockClear();
    state.switchBranch.mockClear();

    adapter = new RxDBAdapterPGlite({ config: { dbName: 'mock-residual', entities: [] } } as unknown as RxDB, {
      store: 'memory'
    });
    await adapter.connect();
    client = state.clientInstances[0]!;
  });

  afterEach(async () => {
    for (const pending of state.pendingCalls.splice(0)) {
      pending.resolve();
    }
    await Promise.resolve();
    try {
      await adapter.disconnect();
    } catch {
      // 忽略。
    }
    vi.clearAllMocks();
    state.clientInstances.length = 0;
  });

  it('liveQuery / createBranch flush reject non-PGliteClient after prototype break', async () => {
    Object.setPrototypeOf(client, Object.prototype);

    // liveQuery 按能力判定而不是按类：只有真的没有这个方法才拒绝。断原型只会摘掉原型上的
    // addEventListener/removeEventListener（变更事件源判定走那条），liveQuery 是自有属性，
    // 要单独删掉才能构造出「不具备该能力的客户端」。
    Reflect.deleteProperty(client, 'liveQuery');
    await expect(adapter.liveQuery('SELECT 1')).rejects.toThrow(/liveQuery is not supported/);

    await expect(adapter.createBranch('feature-x')).resolves.toMatchObject({ id: 'feature-mock' });
    expect(state.createBranch).toHaveBeenCalled();

    // switchBranch 也会通过非 PGliteClient 的 drain 路径刷新。
    await expect(adapter.switchBranch({ branchId: 'main' } as never)).resolves.toBeUndefined();
    expect(state.switchBranch).toHaveBeenCalled();
  });

  it('switchBranch suppresses rxdb_branch change events while switching', async () => {
    state.switchBranch.mockImplementation(async () => {
      const event: PGliteChangeEvent = {
        type: PGliteChangeType.UPDATE,
        dbName: 'test-db',
        tableName: 'rxdb_branch',
        rowIds: ['main'],
        recordAt: new Date()
      };
      client.emit(event.type, event);
      await Promise.resolve();
    });

    await adapter.switchBranch({ branchId: 'main' } as never);
    expect(state.handleRxdbChange).not.toHaveBeenCalled();
    expect(state.switchBranch).toHaveBeenCalled();
  });

  it('publishes non-Error change failures as Error instances', async () => {
    const errors: Error[] = [];
    const sub = adapter.changeErrors$.subscribe(value => errors.push(value));
    state.handleRxdbChange.mockRejectedValueOnce('boom-string');

    const event: PGliteChangeEvent = {
      type: PGliteChangeType.INSERT,
      dbName: 'test-db',
      tableName: 'public$Todo',
      rowIds: ['1'],
      recordAt: new Date()
    };
    client.emit(event.type, event);
    await vi.waitFor(() => expect(errors.length).toBe(1));
    expect(errors[0]).toBeInstanceOf(Error);
    expect(errors[0]?.message).toContain('boom-string');
    sub.unsubscribe();
    for (const pending of state.pendingCalls.splice(0)) pending.resolve();
  });

  it('queue finally only deletes when current task still owns the key', async () => {
    // 暂停第一个任务，使第二个任务可以在相同表键下入队。
    let resolveFirst!: () => void;
    state.handleRxdbChange.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          resolveFirst = resolve;
        })
    );
    state.handleRxdbChange.mockImplementationOnce(async () => undefined);

    const event: PGliteChangeEvent = {
      type: PGliteChangeType.INSERT,
      dbName: 'test-db',
      tableName: 'public$QueueRace',
      rowIds: ['1'],
      recordAt: new Date()
    };
    client.emit(event.type, event);
    await vi.waitFor(() => expect(state.handleRxdbChange).toHaveBeenCalledTimes(1));
    client.emit(event.type, { ...event, rowIds: ['2'] });
    await Promise.resolve();
    resolveFirst();
    await vi.waitFor(() => expect(state.handleRxdbChange).toHaveBeenCalledTimes(2));
  });

  it('generation 变化后必须再经过一轮 idle barrier', async () => {
    state.handleRxdbChange.mockResolvedValueOnce(undefined);
    const event: PGliteChangeEvent = {
      type: PGliteChangeType.INSERT,
      dbName: 'test-db',
      tableName: 'rxdb_change',
      rowIds: ['generation-1'],
      recordAt: new Date()
    };
    client.flushPendingNotifications
      .mockImplementationOnce(async () => {
        client.emit(event.type, event);
        for (let index = 0; index < 8; index += 1) await Promise.resolve();
        return false;
      })
      .mockResolvedValue(false);

    await adapter.createBranch('generation-barrier');

    expect(client.flushPendingNotifications).toHaveBeenCalledTimes(2);
  });

  it('不再用固定五轮截断链式通知', async () => {
    for (let index = 0; index < 6; index += 1) {
      client.flushPendingNotifications.mockResolvedValueOnce(true);
    }
    client.flushPendingNotifications.mockResolvedValue(false);

    await adapter.createBranch('long-notify-chain');

    expect(client.flushPendingNotifications).toHaveBeenCalledTimes(7);
  });

  it('deadline 到期时抛结构化错误并保留超时 cause 与诊断', async () => {
    client.pendingNotificationCount = 7;
    client.flushPendingNotifications.mockResolvedValue(true);
    const now = vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValue(3_001);

    try {
      const result = await adapter.createBranch('pipeline-timeout').then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ ok: false as const, error })
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatchObject({
        code: 'CHANGE_PIPELINE_TIMEOUT',
        diagnostics: {
          pendingEvents: 7,
          pendingHandlers: 0,
          attempts: 1
        },
        cause: {
          name: 'TimeoutError'
        }
      });
    } finally {
      now.mockRestore();
    }
  });

  it('deadline 能打断永不结束的 notification flush', async () => {
    vi.useFakeTimers();
    client.pendingNotificationCount = 4;
    client.flushPendingNotifications.mockImplementation(() => new Promise<boolean>(() => undefined));

    try {
      const resultPromise = adapter.createBranch('hung-notification-flush').then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ ok: false as const, error })
      );
      await vi.advanceTimersByTimeAsync(2_000);
      const result = await resultPromise;

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'CHANGE_PIPELINE_TIMEOUT',
          diagnostics: {
            pendingEvents: 4,
            pendingHandlers: 0,
            attempts: 1
          },
          cause: { name: 'TimeoutError' }
        }
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
