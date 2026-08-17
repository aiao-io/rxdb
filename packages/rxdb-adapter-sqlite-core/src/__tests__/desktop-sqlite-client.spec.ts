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
import type { SqliteResult } from '../sqlite-core.interface.js';

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
  // 非法引擎连 IPC 都不该发：host 侧还会再拦一次，但那一次已经跨了进程边界
  it('rejects an engine this protocol does not carry before it sends anything', async () => {
    const host = createFakeHost();

    await expectRejectedCode(
      DesktopSqliteClient.connect(host.transport, pgliteStorage as unknown as DesktopSqliteFileStorage),
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

describe('DesktopSqliteClient 的会话回滚', () => {
  /**
   * 订阅建不起来时 `connect()` 必须失败，并把 host 上刚开的会话收掉。
   *
   * @remarks
   * 返回一个「能查、但永不刷新」的客户端是所有故障形态里最难查的一种——上层看到的是
   * 数据写进去了却不更新界面，而每一层看起来都正常。所以订阅失败要在连接这一步就爆。
   * 会话必须一并关掉：调用方拿不到 client，再没有第二个人握着那个句柄。
   */
  it('rolls the freshly opened session back when the event channel cannot be established', async () => {
    const host = createFakeHost();

    await expectRejectedCode(
      DesktopSqliteClient.connect(
        { ...host.transport, subscriptionReady: () => Promise.reject(new Error('listen refused')) },
        sqliteStorage
      ),
      'host_unavailable'
    );
    expect(host.kinds).toEqual(['handshake', 'open', 'close']);
  });

  // 回滚也失败时两件事都要说出来：只报订阅失败的话，那条泄漏的会话就无声无息了
  it('reports both failures when the rollback close is rejected as well', async () => {
    const host = createFakeHost({ close: () => ({ kind: 'error', code: 'host_internal_error', message: 'stuck' }) });

    const reason: unknown = await DesktopSqliteClient.connect(
      { ...host.transport, subscriptionReady: () => Promise.reject(new Error('listen refused')) },
      sqliteStorage
    ).then(
      () => undefined,
      (error: unknown) => error
    );

    expect(reason).toBeInstanceOf(RxDBAdapterDesktopError);
    expect((reason as RxDBAdapterDesktopError).message).toContain('could not subscribe to host change events');
    expect((reason as RxDBAdapterDesktopError).message).toContain('closing the half-open session also failed');
    // 原始原因不许被包装吞掉（AC#4）
    expect((reason as RxDBAdapterDesktopError).cause).toBeInstanceOf(Error);
    expect(((reason as RxDBAdapterDesktopError).cause as Error).message).toBe('listen refused');
  });
});

describe('DesktopSqliteClient 的会话请求', () => {
  it('carries the locking statements the host chose, verbatim', async () => {
    const host = createFakeHost();
    const client = await DesktopSqliteClient.connect(host.transport, sqliteStorage);

    // 锁模式由 host 定：renderer 没有第二个来源可以推导它
    expect(client.beginTransactionSql()).toBe(openResult.beginTransactionSql);
    expect(client.beginSystemMigrationTransactionSql()).toBe(openResult.beginSystemMigrationTransactionSql);
    expect(client.sessionId).toBe(SESSION_ID);
    expect(client.resolvedLocation).toBe(openResult.resolvedLocation);
  });

  it('unwraps execute and version answers', async () => {
    const rows: SqliteResult = { sql: 'SELECT 1', rowsAffected: 0, elapsed: 2, results: [] };
    const host = createFakeHost({
      execute: () => ({ kind: 'execute', result: rows }),
      version: () => ({ kind: 'version', result: '3.50.4' })
    });
    const client = await DesktopSqliteClient.connect(host.transport, sqliteStorage);

    await expect(client.execute('SELECT 1', [])).resolves.toBe(rows);
    await expect(client.version()).resolves.toBe('3.50.4');
  });

  // host 侧的错误码要原样穿过 IPC 边界，调用方的 `switch (error.code)` 才有意义
  it('restores a host error answer as a typed error carrying the host code', async () => {
    const host = createFakeHost({
      execute: () => ({ kind: 'error', code: 'statement_failed', message: 'no such table: todo' })
    });
    const client = await DesktopSqliteClient.connect(host.transport, sqliteStorage);

    await expectRejectedCode(client.execute('SELECT * FROM todo'), 'statement_failed');
  });

  /**
   * 一条查询失败不该把整个会话废掉。
   *
   * @remarks
   * 队列的队尾是所有后续请求都要 `then` 上去的那个 promise。它若带着 rejection 留在链上，
   * 下一条请求会因为**别人的**失败而失败，一条写坏的 SQL 就此让会话再也用不了。
   */
  it('keeps serving the session after one request fails', async () => {
    let attempt = 0;
    const host = createFakeHost({
      execute: () => {
        attempt++;
        if (attempt === 1) throw new Error('transport hiccup');
        const result: SqliteResult = { sql: 'INSERT INTO todo VALUES (2)', rowsAffected: 1, elapsed: 1, results: [] };
        return { kind: 'execute', result };
      }
    });
    const client = await DesktopSqliteClient.connect(host.transport, sqliteStorage);

    await expect(client.execute('INSERT INTO todo VALUES (1)')).rejects.toThrowError('transport hiccup');
    await expect(client.execute('INSERT INTO todo VALUES (2)')).resolves.toMatchObject({ rowsAffected: 1 });
  });

  it('refuses new work once the session is disconnected', async () => {
    const host = createFakeHost();
    const client = await DesktopSqliteClient.connect(host.transport, sqliteStorage);
    await client.disconnect();

    await expectRejectedCode(client.execute('SELECT 1'), 'session_closed');
    await expectRejectedCode(client.version(), 'session_closed');
  });

  // 并发的 disconnect 共享同一个流程：第二个调用方也必须等到句柄真的释放
  it('closes the host session exactly once for concurrent disconnects', async () => {
    const host = createFakeHost();
    const client = await DesktopSqliteClient.connect(host.transport, sqliteStorage);

    await Promise.all([client.disconnect(), client.disconnect(), client.disconnect()]);

    expect(host.kinds.filter(kind => kind === 'close')).toEqual(['close']);
  });
});

describe('DesktopSqliteClient 的变更事件路由', () => {
  it('delivers a pushed change to the handlers registered for its type', async () => {
    const host = createFakeHost();
    const client = await DesktopSqliteClient.connect(host.transport, sqliteStorage);
    const onInsert = vi.fn();
    const onDelete = vi.fn();
    await client.addEventListener(SQLiteChangeType.SQLITE_INSERT, onInsert);
    await client.addEventListener(SQLiteChangeType.SQLITE_DELETE, onDelete);

    host.push({ kind: 'change', sessionId: SESSION_ID, event: changeEvent });

    expect(onInsert).toHaveBeenCalledWith(changeEvent);
    expect(onDelete).not.toHaveBeenCalled();
  });

  /**
   * 同一个 renderer 里的两个 RxDB 实例共用一条传输通道。
   *
   * @remarks
   * 通道是广播的：每个客户端都会看到**所有**会话的推送。不按 `sessionId` 过滤的话，
   * A 库的写入会触发 B 库的响应式查询重跑，读到的却是自己库里没变过的数据——
   * 表现为莫名其妙的重渲染，且永远复现不稳。
   */
  it('ignores changes addressed to another session', async () => {
    const host = createFakeHost();
    const client = await DesktopSqliteClient.connect(host.transport, sqliteStorage);
    const handler = vi.fn();
    await client.addEventListener(SQLiteChangeType.SQLITE_INSERT, handler);

    host.push({ kind: 'change', sessionId: '00000000-0000-4000-8000-000000000000', event: changeEvent });

    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores messages that are not change pushes', async () => {
    const host = createFakeHost();
    const client = await DesktopSqliteClient.connect(host.transport, sqliteStorage);
    const handler = vi.fn();
    await client.addEventListener(SQLiteChangeType.SQLITE_INSERT, handler);

    host.push({ kind: 'log', sessionId: SESSION_ID });
    host.push(null);
    host.push('change');

    expect(handler).not.toHaveBeenCalled();
  });

  it('detaches from the transport on disconnect', async () => {
    const host = createFakeHost();
    const client = await DesktopSqliteClient.connect(host.transport, sqliteStorage);
    const handler = vi.fn();
    await client.addEventListener(SQLiteChangeType.SQLITE_INSERT, handler);
    await client.disconnect();

    host.push({ kind: 'change', sessionId: SESSION_ID, event: changeEvent });

    expect(handler).not.toHaveBeenCalled();
  });

  /**
   * 已关闭的客户端连**校验**都不该做，因为它抛出去会砸到同一条通道上的别人。
   *
   * @remarks
   * 「退订即停止收消息」只在 Electron 成立（`ipcRenderer.off` 是同步的）。Tauri 的 `listen`
   * 交回来的 unlisten 是异步的，退订落定之前 host 发出的事件照样会送到这个监听者手里。
   * 此时若还去解析负载，一条坏消息就会从监听回调里抛出来——而通道是共享的，派发循环被打断，
   * 同一个 renderer 里**其他还活着的会话**跟着收不到自己的变更。它们没有任何理由为一个
   * 已经关掉的会话陪葬，所以关闭标记要挡在解析之前，而不是只挡派发。
   */
  it('never throws into the shared transport once it is closed', async () => {
    const otherSession = '00000000-0000-4000-8000-000000000000';
    let opened = 0;
    const host = createFakeHost({
      open: () => ({
        kind: 'open',
        result: opened++ === 0 ? openResult : { ...openResult, sessionId: otherSession }
      })
    });
    // 退订不生效的传输层：模拟 Tauri 那条异步 unlisten
    const lazy: DesktopHostTransport = {
      ...host.transport,
      subscribe: listener => {
        host.transport.subscribe(listener);
        return () => undefined;
      }
    };
    const closing = await DesktopSqliteClient.connect(lazy, sqliteStorage);
    const surviving = await DesktopSqliteClient.connect(lazy, sqliteStorage);
    const handler = vi.fn();
    await surviving.addEventListener(SQLiteChangeType.SQLITE_INSERT, handler);
    await closing.disconnect();

    // 一条发给已关闭会话的**坏**推送，紧跟着一条发给存活会话的好推送
    host.push({ kind: 'change', sessionId: SESSION_ID, event: { ...changeEvent, rowIds: [7] } });
    host.push({ kind: 'change', sessionId: otherSession, event: changeEvent });

    expect(handler).toHaveBeenCalledWith(changeEvent);
  });

  // 半个事件派发进变更管线，会让本地缓存与库里的真实状态悄悄分叉
  it('refuses to dispatch a malformed change event', async () => {
    const host = createFakeHost();
    const client = await DesktopSqliteClient.connect(host.transport, sqliteStorage);
    await client.addEventListener(SQLiteChangeType.SQLITE_INSERT, vi.fn());

    expect(() => host.push({ kind: 'change', sessionId: SESSION_ID, event: { ...changeEvent, rowIds: [7] } })).toThrowError(
      /^\[protocol_violation\]/
    );
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
