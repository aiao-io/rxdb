import { SQLiteChangeType, type SqliteChangeEvent } from '@aiao/rxdb-adapter-sqlite-core';
import {
  DesktopSqliteClient,
  RxDBAdapterDesktopError,
  type DesktopHostTransport
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElectronSqliteHost, type ElectronSqliteHost } from '../desktop-sqlite-host.js';

const sqliteStorage = { engine: 'sqlite', databaseName: 'app.sqlite3' } as const;

let workspace: string;
let host: ElectronSqliteHost;
let transport: DesktopHostTransport;
let listeners: Set<(message: unknown) => void>;

/** 把 client 直接接到真实 host 上，中间不放 mock：跑的是完整的请求/应答与事件通路。 */
const createInProcessTransport = (): DesktopHostTransport => ({
  request: payload => host.handle(payload),
  subscribe: listener => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
});

/**
 * 包一层把应答里的 `protocolVersion` 换掉的传输层，模拟一个讲别的协议版本的宿主。
 *
 * @remarks
 * 按**字段**改而不是按 `kind` 分支：`handshake` 与 `open` 两族应答都带这个字段，
 * 照 `kind` 枚举的话，将来多一族就会悄悄漏掉。与一致性测试的 stdio 二进制按
 * JSON 指针改写是同一手法（`src-tauri/src/bin/rxdb_host_stdio.rs`）。
 *
 * @param protocolVersion - 宿主谎报的版本号
 * @returns 会改写应答的传输层
 */
const skewProtocolVersion = (protocolVersion: number): DesktopHostTransport => ({
  request: async payload => {
    const response = (await host.handle(payload)) as { result?: Record<string, unknown> };
    if (response.result?.['protocolVersion'] === undefined) return response;
    return { ...response, result: { ...response.result, protocolVersion } };
  },
  subscribe: listener => transport.subscribe(listener)
});

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'rxdb-desktop-client-'));
  listeners = new Set();
  host = createElectronSqliteHost({
    resolveDatabasePath: databaseName => join(workspace, databaseName),
    postChange: message => {
      for (const listener of listeners) listener(message);
    }
  });
  transport = createInProcessTransport();
});

afterEach(() => {
  host.closeAll();
  rmSync(workspace, { recursive: true, force: true });
});

describe('DesktopSqliteClient.connect', () => {
  it('reports the logical location the host resolved', async () => {
    const client = await DesktopSqliteClient.connect(transport, sqliteStorage);
    expect(client.resolvedLocation).toContain('app.sqlite3');
    expect(client.resolvedLocation).not.toContain(workspace);
  });

  it('takes the transaction SQL from the host rather than hard coding it', async () => {
    const client = await DesktopSqliteClient.connect(transport, sqliteStorage);
    expect(client.beginTransactionSql()).toBe('BEGIN IMMEDIATE;');
    expect(client.beginSystemMigrationTransactionSql()).toBe('BEGIN EXCLUSIVE;');
  });

  it('reports host_unavailable when no transport was injected', async () => {
    await expect(
      DesktopSqliteClient.connect(undefined as unknown as DesktopHostTransport, sqliteStorage)
    ).rejects.toThrowError(/host_unavailable/);
  });

  // 混装了不同版本的包时继续跑只会产生难以定位的形状错误
  it('refuses a host that speaks a different protocol version', async () => {
    await expect(DesktopSqliteClient.connect(skewProtocolVersion(99), sqliteStorage)).rejects.toThrowError(
      /protocol_violation/
    );
    // 拒连之后不能把 host 上刚开出来的会话留在那儿。调用方拿不到 client，也就永远没有
    // 关掉它的把手，而那条会话正握着一个已经打开的 SQLite 连接（US-207 AC#9）。
    expect(host.openSessionCount).toBe(0);
    // 「不建库」那半条：版本协商排在 `open` 之前，一次注定失败的连接因此在磁盘上
    // 一点痕迹都不留——包括那个本来会被建出来的空库文件。
    expect(readdirSync(workspace)).toEqual([]);
  });

  // 顺序就是这条 AC 的全部：`open` 会建库、开连接、登记会话，版本核对必须排在它前面。
  it('negotiates the protocol version before it asks the host to open anything', async () => {
    const kinds: string[] = [];
    const recording: DesktopHostTransport = {
      request: payload => {
        kinds.push(payload.kind);
        return host.handle(payload);
      },
      subscribe: transport.subscribe
    };
    const client = await DesktopSqliteClient.connect(recording, sqliteStorage);
    expect(kinds).toEqual(['handshake', 'open']);
    await client.disconnect();
  });

  /**
   * 比版本对不上更早的一种混装：host 老到根本不认识握手请求。
   *
   * @remarks
   * 它只会回一句 `protocol_violation`——那条路径同样碰不到文件系统，于是
   * 「版本对不上就不建库」在新旧两种 host 上都成立，而不只是在新 host 上成立。
   */
  it('refuses a host too old to answer the handshake at all', async () => {
    const ancient: DesktopHostTransport = {
      request: payload =>
        payload.kind === 'handshake'
          ? Promise.resolve({ kind: 'error', code: 'protocol_violation', message: 'unknown request kind handshake' })
          : host.handle(payload),
      subscribe: transport.subscribe
    };
    await expect(DesktopSqliteClient.connect(ancient, sqliteStorage)).rejects.toThrowError(/protocol_violation/);
    expect(host.openSessionCount).toBe(0);
    expect(readdirSync(workspace)).toEqual([]);
  });

  /**
   * Tauri 的 `listen` 是异步的：注册落定之前 host 发出的变更事件谁也收不到。
   * `connect()` 一返回调用方就会开始写库，所以它必须等订阅真的生效——
   * 否则丢的恰好是建库后的第一批变更，表现为「首屏不刷新」。
   */
  it('waits for the transport subscription to become ready before returning', async () => {
    let release: (() => void) | undefined;
    const ready = new Promise<void>(resolve => {
      release = resolve;
    });
    const slow: DesktopHostTransport = {
      request: payload => host.handle(payload),
      subscribe: transport.subscribe,
      subscriptionReady: () => ready
    };

    let connected = false;
    const connecting = DesktopSqliteClient.connect(slow, sqliteStorage).then(client => {
      connected = true;
      return client;
    });
    await vi.waitFor(() => expect(host.openSessionCount).toBe(1));
    // 排空微任务与宏任务再断言：`connect()` 若不等就绪，这时早就返回了。
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(connected).toBe(false);

    release?.();
    const client = await connecting;
    expect(connected).toBe(true);
    await client.disconnect();
  });

  /**
   * 订阅建不起来等于永远收不到变更。这时 `connect()` 不能返回一个「能查但永不刷新」的客户端，
   * 半开的会话也不能留在 host 上占着文件锁。
   */
  it('rejects and closes the half-open session when the subscription cannot be established', async () => {
    const failure = new Error('event system unavailable');
    const failing: DesktopHostTransport = {
      request: payload => host.handle(payload),
      subscribe: transport.subscribe,
      subscriptionReady: () => Promise.reject(failure)
    };

    try {
      await DesktopSqliteClient.connect(failing, sqliteStorage);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(RxDBAdapterDesktopError);
      expect((error as RxDBAdapterDesktopError).code).toBe('host_unavailable');
      expect((error as Error).cause).toBe(failure);
    }
    expect(host.openSessionCount).toBe(0);
    expect(listeners.size).toBe(0);
  });

  // AC#4：错误码要跨传输层活着到达调用方，而不是被压平成一句字符串
  it('rebuilds the host error code on this side of the transport', async () => {
    const failing = createElectronSqliteHost({
      resolveDatabasePath: () => {
        throw new Error('no app data directory yet');
      },
      postChange: () => undefined
    });
    const failingTransport: DesktopHostTransport = {
      request: payload => failing.handle(payload),
      subscribe: () => () => undefined
    };
    try {
      await DesktopSqliteClient.connect(failingTransport, sqliteStorage);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(RxDBAdapterDesktopError);
      expect((error as RxDBAdapterDesktopError).code).toBe('open_failed');
      // 前缀只加一次，不因为跨了一趟传输就变成 [open_failed] [open_failed]
      expect((error as Error).message).toBe('[open_failed] the application could not resolve a path for app.sqlite3');
    }
  });
});

describe('DesktopSqliteClient.execute', () => {
  it('round trips a write and a read through the host', async () => {
    const client = await DesktopSqliteClient.connect(transport, sqliteStorage);
    await client.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    await client.execute('INSERT INTO t (name) VALUES (?)', ['a']);
    const result = await client.execute('SELECT name FROM t');
    expect(result.results[0]?.rows).toEqual([['a']]);
    expect(result.rowsAffected).toBe(0);
  });

  it('reports a failing statement with its stable error code', async () => {
    const client = await DesktopSqliteClient.connect(transport, sqliteStorage);
    try {
      await client.execute('SELECT * FROM nope');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as RxDBAdapterDesktopError).code).toBe('statement_failed');
    }
  });

  it('reports the SQLite version of the host engine', async () => {
    const client = await DesktopSqliteClient.connect(transport, sqliteStorage);
    expect(await client.version()).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('DesktopSqliteClient change events', () => {
  const createChangeTable = (client: DesktopSqliteClient): Promise<unknown> =>
    client.execute('CREATE TABLE IF NOT EXISTS "rxdb$rxdb_change" (id INTEGER PRIMARY KEY, payload TEXT)');

  /** 变更事件在 host 侧防抖派发；`batchTimeout: 0` 把窗口压到「下一个宏任务」，用例才不用等真实毫秒。 */
  const connectClient = (): Promise<DesktopSqliteClient> =>
    DesktopSqliteClient.connect(transport, sqliteStorage, { batchTimeout: 0 });

  /** 让「没收到事件」这类否定断言有意义：先把该派发的都派发完，再断言确实没有。 */
  const settleChanges = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 10));

  it('delivers host changes to the registered handler', async () => {
    const client = await connectClient();
    const received: SqliteChangeEvent[] = [];
    await client.addEventListener(SQLiteChangeType.SQLITE_INSERT, event => received.push(event));
    await createChangeTable(client);
    await client.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['x']);
    await vi.waitFor(() => {
      expect(received).toHaveLength(1);
    });
    expect(received[0]).toMatchObject({ tableName: 'rxdb$rxdb_change', rowIds: [1n] });
  });

  it('only delivers the change type each handler asked for', async () => {
    const client = await connectClient();
    const onDelete = vi.fn();
    await client.addEventListener(SQLiteChangeType.SQLITE_DELETE, onDelete);
    await createChangeTable(client);
    await client.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['x']);
    await settleChanges();
    expect(onDelete).not.toHaveBeenCalled();
    await client.execute('DELETE FROM "rxdb$rxdb_change"');
    await vi.waitFor(() => {
      expect(onDelete).toHaveBeenCalledOnce();
    });
  });

  // 每个窗口只该看到自己那条连接的变更，否则跨窗口事件会被当成本地写入回灌
  it('ignores changes addressed to another session', async () => {
    const first = await connectClient();
    const second = await connectClient();
    const onFirst = vi.fn();
    await first.addEventListener(SQLiteChangeType.SQLITE_INSERT, onFirst);
    await createChangeTable(second);
    await second.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['x']);
    await settleChanges();
    expect(onFirst).not.toHaveBeenCalled();
  });

  it('supports several handlers on one change type', async () => {
    const client = await connectClient();
    const first = vi.fn();
    const second = vi.fn();
    await client.addEventListener(SQLiteChangeType.SQLITE_INSERT, first);
    await client.addEventListener(SQLiteChangeType.SQLITE_INSERT, second);
    await createChangeTable(client);
    await client.execute('INSERT INTO "rxdb$rxdb_change" (payload) VALUES (?)', ['x']);
    await vi.waitFor(() => {
      expect(first).toHaveBeenCalledOnce();
      expect(second).toHaveBeenCalledOnce();
    });
  });

  // 半个事件流进 RxDB 变更管线会让本地缓存与库里的真实状态悄悄分叉，宁可炸出来
  it('refuses a malformed change message instead of dispatching half of it', async () => {
    const client = await DesktopSqliteClient.connect(transport, sqliteStorage);
    await client.addEventListener(SQLiteChangeType.SQLITE_INSERT, () => undefined);
    const deliver = (): void => {
      for (const listener of listeners) {
        listener({ kind: 'change', sessionId: client.sessionId, event: { type: 99 } });
      }
    };
    expect(deliver).toThrowError(/protocol_violation/);
  });

  it('ignores messages that are not change notifications', async () => {
    const client = await DesktopSqliteClient.connect(transport, sqliteStorage);
    await client.addEventListener(SQLiteChangeType.SQLITE_INSERT, () => undefined);
    expect(() => {
      for (const listener of listeners) listener({ kind: 'heartbeat' });
    }).not.toThrow();
  });
});

describe('DesktopSqliteClient.disconnect', () => {
  it('stops accepting new work', async () => {
    const client = await DesktopSqliteClient.connect(transport, sqliteStorage);
    await client.disconnect();
    await expect(client.execute('SELECT 1')).rejects.toThrowError(/session_closed/);
  });

  // AC#7：在途查询必须先跑完，句柄才能释放
  it('waits for in flight work before releasing the handle', async () => {
    const client = await DesktopSqliteClient.connect(transport, sqliteStorage);
    await client.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    const inFlight = client.execute('INSERT INTO t (name) VALUES (?)', ['racing']);
    await client.disconnect();
    await expect(inFlight).resolves.toMatchObject({ rowsAffected: 1 });

    const reopened = await DesktopSqliteClient.connect(transport, sqliteStorage);
    expect((await reopened.execute('SELECT name FROM t')).results[0]?.rows).toEqual([['racing']]);
  });

  it('releases the host session', async () => {
    const client = await DesktopSqliteClient.connect(transport, sqliteStorage);
    await client.disconnect();
    expect(host.openSessionCount).toBe(0);
  });

  it('stops delivering change events', async () => {
    const client = await DesktopSqliteClient.connect(transport, sqliteStorage);
    const onInsert = vi.fn();
    await client.addEventListener(SQLiteChangeType.SQLITE_INSERT, onInsert);
    await client.disconnect();
    for (const listener of listeners) {
      listener({
        kind: 'change',
        sessionId: client.sessionId,
        event: {
          type: SQLiteChangeType.SQLITE_INSERT,
          dbName: 'main',
          tableName: 'rxdb$rxdb_change',
          rowIds: [1n],
          recordAt: new Date()
        }
      });
    }
    expect(onInsert).not.toHaveBeenCalled();
  });

  it('is idempotent', async () => {
    const client = await DesktopSqliteClient.connect(transport, sqliteStorage);
    await client.disconnect();
    await expect(client.disconnect()).resolves.toBeUndefined();
  });

  // RV-002/AC#7：并发调用方也必须等到句柄真的释放，否则第二个调用方会在库还开着时去搬文件
  it('makes concurrent disconnects wait for the in-flight SQL and the host close', async () => {
    let releaseExecute: (() => void) | undefined;
    const order: string[] = [];
    const gated: DesktopHostTransport = {
      request: async payload => {
        if ((payload as { kind: string }).kind === 'execute') {
          await new Promise<void>(resolve => (releaseExecute = resolve));
          order.push('execute');
        }
        const response = await host.handle(payload);
        if ((payload as { kind: string }).kind === 'close') order.push('close');
        return response;
      },
      subscribe: transport.subscribe
    };

    const client = await DesktopSqliteClient.connect(gated, sqliteStorage);
    const executed = client.execute('SELECT 1');
    await vi.waitFor(() => expect(releaseExecute).toBeTypeOf('function'));

    const first = client.disconnect().then(() => order.push('first'));
    const second = client.disconnect().then(() => order.push('second'));

    releaseExecute?.();
    await Promise.all([executed, first, second]);

    // 两个调用方都晚于 host close 落定；close 只发一次
    expect(order).toEqual(['execute', 'close', 'first', 'second']);
    expect(order.filter(step => step === 'close')).toHaveLength(1);
    expect(host.openSessionCount).toBe(0);
  });

  // 关闭失败不能被静默当成已关闭：所有并发调用方看到同一个 rejection
  it('propagates a failing host close to every concurrent caller', async () => {
    const failing: DesktopHostTransport = {
      request: async payload => {
        if ((payload as { kind: string }).kind === 'close') throw new Error('close exploded');
        return host.handle(payload);
      },
      subscribe: transport.subscribe
    };

    const client = await DesktopSqliteClient.connect(failing, sqliteStorage);
    const [first, second] = await Promise.allSettled([client.disconnect(), client.disconnect()]);

    expect(first.status).toBe('rejected');
    expect(second.status).toBe('rejected');
    expect((second as PromiseRejectedResult).reason).toBe((first as PromiseRejectedResult).reason);
  });
});

describe('DesktopSqliteClient 会话内的请求顺序', () => {
  /**
   * 一个**乱序**的传输层：越早收到的请求拖得越久。
   *
   * @remarks
   * 它模拟的是 Tauri：每次 `invoke` 派到自己的任务上，谁先抢到会话锁与谁先发出无关。
   * Electron 的 `ipcMain` + 同步 `node:sqlite` 不会这样，所以这条性质在 Electron 上
   * 是白送的，一到 Tauri 就会以随机失败的形式暴露——必须由 client 自己保证。
   */
  const createReorderingTransport = (): { transport: DesktopHostTransport; peakOverlap: () => number } => {
    let overlap = 0;
    let peak = 0;
    let sent = 0;
    const transport: DesktopHostTransport = {
      request: async payload => {
        overlap++;
        peak = Math.max(peak, overlap);
        // 严格递减且不触底：任意两个请求都会被翻转，没有排队的话应答顺序与发出顺序相反。
        await new Promise(resolve => setTimeout(resolve, Math.max(1, 50 - sent++)));
        try {
          return await host.handle(payload);
        } finally {
          overlap--;
        }
      },
      subscribe: listener => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
    return { transport, peakOverlap: () => peak };
  };

  it('keeps at most one request in flight per session', async () => {
    const { transport: reordering, peakOverlap } = createReorderingTransport();
    const client = await DesktopSqliteClient.connect(reordering, sqliteStorage);
    await Promise.all([client.execute('SELECT 1'), client.execute('SELECT 2'), client.execute('SELECT 3')]);
    expect(peakOverlap()).toBe(1);
  });

  // 顺序一旦丢失，最典型的形态就是读挤到写前面：调用方看到的是刚删掉的行还在。
  it('does not let a read overtake a write that was issued first', async () => {
    const { transport: reordering } = createReorderingTransport();
    const client = await DesktopSqliteClient.connect(reordering, sqliteStorage);
    await client.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    await client.execute("INSERT INTO t (name) VALUES ('to-delete')");

    const deleted = client.execute('DELETE FROM t');
    const read = client.execute('SELECT name FROM t');
    await deleted;

    expect((await read).results[0]?.rows).toEqual([]);
  });
});
