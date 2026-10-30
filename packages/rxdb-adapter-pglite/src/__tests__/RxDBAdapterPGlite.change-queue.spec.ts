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
    MockPGliteClient
  };
});

vi.mock('../handle_rxdb_change.js', () => ({
  handle_rxdb_change: state.handleRxdbChange
}));

vi.mock('../PGliteClient.js', async importOriginal => ({
  // 纯函数（初始化选项解析等）沿用真实实现，只替换客户端本身。
  ...(await importOriginal<typeof import('../PGliteClient.js')>()),
  // 结构化判定与真实实现保持一致：mock 客户端只要有这对方法就算变更事件源。
  asPGliteChangeEventSource: (client: unknown) => {
    const candidate = client as { addEventListener?: unknown; removeEventListener?: unknown } | null;
    if (typeof candidate?.addEventListener !== 'function') return undefined;
    if (typeof candidate.removeEventListener !== 'function') return undefined;
    return candidate;
  },
  PGliteClient: state.MockPGliteClient
}));

import type { RxDB } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { PGliteChangeEvent, PGliteChangeType } from '../pglite.interface.js';

describe('RxDBAdapterPGlite - change queue', () => {
  let adapter: RxDBAdapterPGlite;
  let client: InstanceType<typeof state.MockPGliteClient>;

  beforeEach(async () => {
    state.clientInstances.length = 0;
    state.pendingCalls.length = 0;
    state.handleRxdbChange.mockClear();

    adapter = new RxDBAdapterPGlite({ config: { dbName: 'change-queue-test', entities: [] } } as unknown as RxDB, {
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
    await adapter.disconnect();
    vi.clearAllMocks();
    state.clientInstances.length = 0;
  });

  it('同表事件应按 tableName 串行进入处理器', async () => {
    const insertEvent: PGliteChangeEvent = {
      type: PGliteChangeType.INSERT,
      dbName: 'test-db',
      tableName: 'public$Todo',
      rowIds: ['1'],
      recordAt: new Date()
    };
    const updateEvent: PGliteChangeEvent = {
      type: PGliteChangeType.UPDATE,
      dbName: 'test-db',
      tableName: 'public$Todo',
      rowIds: ['1'],
      recordAt: new Date()
    };

    client.emit(insertEvent.type, insertEvent);
    await vi.waitFor(() => expect(state.handleRxdbChange).toHaveBeenCalledTimes(1));

    client.emit(updateEvent.type, updateEvent);
    await Promise.resolve();

    expect(state.handleRxdbChange).toHaveBeenCalledTimes(1);

    state.pendingCalls.shift()!.resolve();
    await vi.waitFor(() => expect(state.handleRxdbChange).toHaveBeenCalledTimes(2));

    expect(state.handleRxdbChange.mock.calls.map(([, event]) => (event as PGliteChangeEvent).tableName)).toEqual([
      'public$Todo',
      'public$Todo'
    ]);
  });

  it('不同表事件仍可并发进入处理器', async () => {
    const todoEvent: PGliteChangeEvent = {
      type: PGliteChangeType.INSERT,
      dbName: 'test-db',
      tableName: 'public$Todo',
      rowIds: ['1'],
      recordAt: new Date()
    };
    const changeEvent: PGliteChangeEvent = {
      type: PGliteChangeType.INSERT,
      dbName: 'test-db',
      tableName: 'rxdb_change',
      rowIds: ['2'],
      recordAt: new Date()
    };

    client.emit(todoEvent.type, todoEvent);
    client.emit(changeEvent.type, changeEvent);

    await vi.waitFor(() => expect(state.handleRxdbChange).toHaveBeenCalledTimes(2));

    expect(
      new Set(state.handleRxdbChange.mock.calls.map(([, event]) => (event as PGliteChangeEvent).tableName))
    ).toEqual(new Set(['public$Todo', 'rxdb_change']));
  });

  it('变更处理失败应发布原始错误并继续同表队列', async () => {
    const error = new Error('change handler failed');
    const errors: Error[] = [];
    const subscription = adapter.changeErrors$.subscribe(value => errors.push(value));
    state.handleRxdbChange.mockRejectedValueOnce(error);

    const event: PGliteChangeEvent = {
      type: PGliteChangeType.INSERT,
      dbName: 'test-db',
      tableName: 'public$Todo',
      rowIds: ['1'],
      recordAt: new Date()
    };

    client.emit(event.type, event);
    await vi.waitFor(() => expect(errors).toEqual([error]));

    client.emit(event.type, event);
    await vi.waitFor(() => expect(state.handleRxdbChange).toHaveBeenCalledTimes(2));

    subscription.unsubscribe();
  });

  /**
   * 同一个适配器实例可以 connect → disconnect → connect（工厂返回同一实例、或直接调适配器）。
   * 错误流若在断开时被完成，重连之后的管线失败就再没有任何订阅者收得到。
   */
  describe('同一实例断开重连', () => {
    const failingEvent: PGliteChangeEvent = {
      type: PGliteChangeType.INSERT,
      dbName: 'test-db',
      tableName: 'public$Todo',
      rowIds: ['1'],
      recordAt: new Date()
    };

    const reconnect = async (): Promise<InstanceType<typeof state.MockPGliteClient>> => {
      await adapter.disconnect();
      await adapter.connect();
      const reconnected = state.clientInstances.at(-1)!;
      expect(reconnected).not.toBe(client);
      return reconnected;
    };

    it('重连后重新订阅 changeErrors$，管线失败照常送达', async () => {
      const reconnected = await reconnect();
      const errors: Error[] = [];
      let completed = false;
      const subscription = adapter.changeErrors$.subscribe({
        next: value => errors.push(value),
        complete: () => (completed = true)
      });
      const error = new Error('change handler failed after reconnect');
      state.handleRxdbChange.mockRejectedValueOnce(error);

      reconnected.emit(failingEvent.type, failingEvent);

      await vi.waitFor(() => expect(errors).toEqual([error]));
      expect(completed).toBe(false);
      subscription.unsubscribe();
    });

    it('断开前的订阅不被断开结束，重连后的失败照样收到', async () => {
      const errors: Error[] = [];
      let completed = false;
      const subscription = adapter.changeErrors$.subscribe({
        next: value => errors.push(value),
        complete: () => (completed = true)
      });

      const reconnected = await reconnect();
      expect(completed).toBe(false);
      const error = new Error('change handler failed after reconnect');
      state.handleRxdbChange.mockRejectedValueOnce(error);

      reconnected.emit(failingEvent.type, failingEvent);

      await vi.waitFor(() => expect(errors).toEqual([error]));
      subscription.unsubscribe();
    });
  });
});
