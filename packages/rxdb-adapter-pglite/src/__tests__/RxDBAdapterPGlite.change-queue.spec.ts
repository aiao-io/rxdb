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

    adapter = new RxDBAdapterPGlite({ config: { dbName: 'change-queue-test' } } as unknown as RxDB, {
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
});
