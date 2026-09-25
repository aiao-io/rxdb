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

vi.mock('../version/switch_branch.js', () => ({
  switch_branch: state.switchBranch,
  generateBranchTriggerSql: () => '',
  generateBranchTriggerSqlFor: () => '',
  generateSwitchBranchSql: () => ''
}));

import type { RxDB, SwitchBranchOptions } from '@aiao/rxdb';
import { SKIP_BRANCH_SWITCH_PREPARE } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { PGliteChangeEvent, PGliteChangeType } from '../pglite.interface.js';

/**
 * `switch_branch` 在本文件整体被 mock，actions 永远不会被消费；给出空的三张表只是为了
 * 满足 {@link SwitchBranchOptions} 的必填项。这里只断言 switchBranch 这个入口确实接上了
 * 冲刷与事件抑制，冲刷本身的轮次语义在 `change-pipeline.spec.ts` 里直接测
 * `flushPendingChangePipeline()`；分支语义由 `version/switch_branch.spec.ts` 负责。
 */
const switchOptions = (): SwitchBranchOptions => ({
  branchId: 'main',
  actions: { deletes: new Map(), updates: new Map(), inserts: new Map() },
  prepare: SKIP_BRANCH_SWITCH_PREPARE
});

describe('RxDBAdapterPGlite mock residual paths', () => {
  let adapter: RxDBAdapterPGlite;
  let client: InstanceType<typeof state.MockPGliteClient>;

  beforeEach(async () => {
    state.clientInstances.length = 0;
    state.pendingCalls.length = 0;
    state.handleRxdbChange.mockClear();
    // mockReset 而不是 mockClear：有用例给 switchBranch 装了自定义实现来发事件，
    // 不能把实现漏给后面的用例。
    state.switchBranch.mockReset();

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

  it('liveQuery / switchBranch flush reject non-PGliteClient after prototype break', async () => {
    Object.setPrototypeOf(client, Object.prototype);

    // liveQuery 按能力判定而不是按类：只有真的没有这个方法才拒绝。断原型只会摘掉原型上的
    // addEventListener/removeEventListener（变更事件源判定走那条），liveQuery 是自有属性，
    // 要单独删掉才能构造出「不具备该能力的客户端」。
    Reflect.deleteProperty(client, 'liveQuery');
    await expect(adapter.liveQuery('SELECT 1')).rejects.toThrow(/liveQuery is not supported/);

    // switchBranch 通过非 PGliteClient 的 drain 路径刷新。
    await expect(adapter.switchBranch(switchOptions())).resolves.toBeUndefined();
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

    await adapter.switchBranch(switchOptions());
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
});
