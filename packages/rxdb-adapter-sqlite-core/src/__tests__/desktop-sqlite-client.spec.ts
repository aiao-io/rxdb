/**
 * `DesktopSqliteClient` 的**协议层**契约，用假传输驱动（US-207 E1）。
 *
 * @remarks
 * 客户端与真实 `node:sqlite` 宿主合起来跑的那套集成测试留在 Electron 包
 * （`__tests__/desktop-sqlite-client.spec.ts`）——它证明的是两端在真库上对得上：
 * FIFO 顺序、真实变更事件、`BEGIN IMMEDIATE`/`BEGIN EXCLUSIVE` 的来源。
 *
 * 本文件不重复那些用例，只覆盖**真宿主给不出来的形状**：一个正常的 host 永远不会回一个
 * 缺字段的 `open` 结果，也不会在 renderer 侧的能力矩阵校验之前收到任何请求。这些路径正是
 * 「拒连之后不能把会话留在 host 上」与「非法配置连 IPC 都不该发」两条性质的唯一入口。
 */

import { describe, expect, it, vi } from 'vitest';
import { RxDBAdapterDesktopError, type RxDBAdapterDesktopErrorCode } from '../desktop/desktop-error.js';
import { DESKTOP_HOST_PROTOCOL_VERSION } from '../desktop/desktop-host-protocol.js';
import {
  DESKTOP_HOST_TRANSPORT_KEY,
  DesktopSqliteClient,
  resolveDesktopHostTransport,
  type DesktopHostTransport
} from '../desktop/desktop-sqlite-client.js';
import type { DesktopPgliteDirectoryStorage, DesktopSqliteFileStorage } from '../desktop/desktop-storage.js';
import { SQLiteChangeType } from '../sqlite-backend.interface.js';

const sqliteStorage: DesktopSqliteFileStorage = { engine: 'sqlite', databaseName: 'app.sqlite3' };
const pgliteStorage: DesktopPgliteDirectoryStorage = { engine: 'pglite', dataDirectoryName: 'app-pgdata' };

const SESSION_ID = '7f1d2c3b-4a59-4e6f-8b0d-1e2f3a4b5c6d';

const openResult = {
  sessionId: SESSION_ID,
  resolvedLocation: `desktop-sqlite://app-scope/${sqliteStorage.databaseName}`,
  protocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
  beginTransactionSql: 'BEGIN IMMEDIATE;',
  beginSystemMigrationTransactionSql: 'BEGIN EXCLUSIVE;'
};

interface FakeHost {
  readonly transport: DesktopHostTransport;
  /** 依次记录 host 收到的请求 kind，用来断言副作用发生的**顺序**。 */
  readonly kinds: string[];
  /** 把一条消息推给所有 `subscribe` 上来的监听者，模拟 host 主动推送。 */
  push(message: unknown): void;
}

/** 一条形状合法的变更事件负载。 */
const changeEvent = {
  type: SQLiteChangeType.SQLITE_INSERT,
  dbName: 'main',
  tableName: 'todo',
  rowIds: [7n],
  recordAt: new Date(1_700_000_000_000)
};

/**
 * 造一条只按脚本回话的传输层。
 *
 * @remarks
 * `request` 是 async 的，于是脚本里的同步 throw 也表现为 rejected promise——真实的
 * `ipcRenderer.invoke` / Tauri `invoke` 都只会 reject，不会同步抛。
 *
 * @param overrides - 按 kind 覆盖应答；未覆盖的 kind 走默认的成功应答
 * @returns 假 host 与它收到的请求记录
 */
const createFakeHost = (overrides: Record<string, () => unknown> = {}): FakeHost => {
  const kinds: string[] = [];
  const listeners = new Set<(message: unknown) => void>();
  const defaults: Record<string, () => unknown> = {
    handshake: () => ({ kind: 'handshake', result: { protocolVersion: DESKTOP_HOST_PROTOCOL_VERSION } }),
    open: () => ({ kind: 'open', result: openResult }),
    close: () => ({ kind: 'close' })
  };
  return {
    kinds,
    push: message => {
      for (const listener of listeners) listener(message);
    },
    transport: {
      request: async payload => {
        kinds.push(payload.kind);
        const answer = overrides[payload.kind] ?? defaults[payload.kind];
        if (!answer) throw new Error(`fake host has no answer for ${payload.kind}`);
        return answer();
      },
      subscribe: listener => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    }
  };
};

/**
 * 断言 promise 以指定错误码的桌面错误 reject。
 *
 * @param promise - 待断言的 promise
 * @param code - 期望的稳定错误码
 */
const expectRejectedCode = async (promise: Promise<unknown>, code: RxDBAdapterDesktopErrorCode): Promise<void> => {
  const reason: unknown = await promise.then(
    () => undefined,
    (error: unknown) => error
  );
  expect(reason).toBeInstanceOf(RxDBAdapterDesktopError);
  expect((reason as RxDBAdapterDesktopError).code).toBe(code);
};

describe('resolveDesktopHostTransport', () => {
  it('reports host_unavailable when the preload script exposed nothing', () => {
    delete (globalThis as Record<string, unknown>)[DESKTOP_HOST_TRANSPORT_KEY];

    expect(() => resolveDesktopHostTransport()).toThrowError(/^\[host_unavailable\]/);
  });

  // 只暴露了 request 的半成品比完全没暴露更难查：它要到第一次变更推送才炸
  it('refuses a bridge that exposes only half of the contract', () => {
    (globalThis as Record<string, unknown>)[DESKTOP_HOST_TRANSPORT_KEY] = { request: () => Promise.resolve(null) };

    expect(() => resolveDesktopHostTransport()).toThrowError(/^\[host_unavailable\]/);

    delete (globalThis as Record<string, unknown>)[DESKTOP_HOST_TRANSPORT_KEY];
  });

  it('returns the transport the preload script exposed', () => {
    const { transport } = createFakeHost();
    (globalThis as Record<string, unknown>)[DESKTOP_HOST_TRANSPORT_KEY] = transport;

    expect(resolveDesktopHostTransport()).toBe(transport);

    delete (globalThis as Record<string, unknown>)[DESKTOP_HOST_TRANSPORT_KEY];
  });
});

describe('DesktopSqliteClient.connect 的前置校验', () => {
  // 非法组合连 IPC 都不该发：host 侧还会再拦一次，但那一次已经跨了进程边界
  it('rejects an engine outside the runtime capability matrix before it sends anything', async () => {
    const host = createFakeHost();

    await expectRejectedCode(
      DesktopSqliteClient.connect(host.transport, pgliteStorage as unknown as DesktopSqliteFileStorage, {
        runtime: 'tauri'
      }),
      'unsupported_runtime_engine'
    );
    expect(host.kinds).toEqual([]);
  });

  it('rejects an illegal logical database name before it sends anything', async () => {
    const host = createFakeHost();

    await expectRejectedCode(
      DesktopSqliteClient.connect(host.transport, { engine: 'sqlite', databaseName: '../escape.sqlite3' }),
      'invalid_database_name'
    );
    expect(host.kinds).toEqual([]);
  });

  it('reports host_unavailable when no transport was injected', async () => {
    await expectRejectedCode(
      DesktopSqliteClient.connect(undefined as unknown as DesktopHostTransport, sqliteStorage),
      'host_unavailable'
    );
  });
});

describe('DesktopSqliteClient.connect 对坏应答的处理', () => {
  /**
   * 形状坏掉的 `open` 结果意味着 host 已经建库、开连接、登记了会话，
   * 而调用方拿不到 client——再没有第二个人能关掉那条会话。
   */
  it('closes the session the host already opened when the open result is malformed', async () => {
    const host = createFakeHost({
      open: () => ({ kind: 'open', result: { ...openResult, beginTransactionSql: undefined } })
    });

    await expectRejectedCode(DesktopSqliteClient.connect(host.transport, sqliteStorage), 'protocol_violation');
    expect(host.kinds).toEqual(['handshake', 'open', 'close']);
  });

  // 坏到连 sessionId 都读不出来时没有可关的东西，此时不该再多发一条注定失败的 close
  it('does not attempt a close when the malformed result carries no session id', async () => {
    const host = createFakeHost({ open: () => ({ kind: 'open', result: { resolvedLocation: 'x' } }) });

    await expectRejectedCode(DesktopSqliteClient.connect(host.transport, sqliteStorage), 'protocol_violation');
    expect(host.kinds).toEqual(['handshake', 'open']);
  });

  // 收摊失败不能盖住真正的原因：连接已经带着准确的错误失败了
  it('keeps the parse failure when the cleanup close also fails', async () => {
    const host = createFakeHost({
      open: () => ({ kind: 'open', result: { ...openResult, resolvedLocation: 42 } }),
      close: () => {
        throw new Error('close exploded');
      }
    });

    await expectRejectedCode(DesktopSqliteClient.connect(host.transport, sqliteStorage), 'protocol_violation');
    expect(host.kinds).toEqual(['handshake', 'open', 'close']);
  });

  it('refuses an answer whose kind does not match the request', async () => {
    const host = createFakeHost({ open: () => ({ kind: 'version', result: '3.50.4' }) });

    await expectRejectedCode(DesktopSqliteClient.connect(host.transport, sqliteStorage), 'protocol_violation');
  });
});

describe('DesktopSqliteClient.addEventListener', () => {
  /**
   * 通道事后掉线时注册方必须知道自己等不到事件。
   *
   * @remarks
   * `connect()` 等过的那一次注册是成功的（否则连都连不上），随后传输层的
   * `subscriptionReady()` 才开始 reject——这正是 Tauri 侧通道中途断掉的形状。
   * 静默成功的话，调用方会以为自己在监听，实际上响应式查询永远不刷新。
   */
  it('propagates a subscription that fails after connect', async () => {
    const host = createFakeHost();
    let ready: Promise<void> = Promise.resolve();
    const client = await DesktopSqliteClient.connect(
      { ...host.transport, subscriptionReady: () => ready },
      sqliteStorage
    );

    ready = Promise.reject(new Error('event channel dropped'));
    ready.catch(() => undefined);

    await expect(client.addEventListener(SQLiteChangeType.SQLITE_INSERT, vi.fn())).rejects.toThrowError('event channel dropped');
  });

  it('refuses to register on a disconnected session', async () => {
    const host = createFakeHost();
    const client = await DesktopSqliteClient.connect(host.transport, sqliteStorage);
    await client.disconnect();

    await expectRejectedCode(client.addEventListener(SQLiteChangeType.SQLITE_INSERT, vi.fn()), 'session_closed');
  });
});
