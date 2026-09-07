/**
 * @fileoverview US-208：主进程侧 PGlite host 的接线（worker 隔离 + 窗口归属）。
 *
 * @remarks
 * 这里跑的是**真的 PGlite**、真的临时目录，以及一条真的 `node:worker_threads` 消息端口——
 * 只有 `webContents` 与线程边界被换掉：前者在 Electron 里需要一个完整窗口才构造得出来，
 * 后者用 `MessageChannel` 顶替 `Worker`。
 *
 * 用 `MessageChannel` 而不是一个手写假对象，是因为本故事 AC#1 的判据恰好就是
 * **结构化克隆的逐值保真**：`MessagePort` 与 `Worker` 走的是同一套克隆算法，
 * 假对象则会把 `bigint` / `Uint8Array` / `Date` 原样按引用递过去——那样测出来的
 * 「保真」只证明了 JS 变量没被改动，与跨线程/跨进程能不能带过去毫无关系。
 *
 * 线程边界本身（`new Worker(...)` 找不找得到那份 bundle）留给 e2e：那是打包产物的问题，
 * 在源码树里怎么测都是测另一件事。
 */

import { RxDBAdapterDesktopError, type DesktopPgliteResponse } from '@aiao/rxdb-adapter-electron/pglite-host';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_STORAGE_DIRECTORY } from './desktop-file-bridge';
import {
  createDesktopPgliteBridge,
  DESKTOP_PGLITE_CLOSE_ALL_TIMEOUT_MS,
  DESKTOP_PGLITE_DIRECTORY,
  resolvePgliteDataRoot,
  type DesktopPgliteBridge,
  type DesktopPgliteEventTarget,
  type DesktopPgliteWorkerChannel
} from './desktop-pglite-bridge';
import { createPgliteWorkerEndpoint } from './desktop-pglite-worker';
import { DESKTOP_DATABASE_DIRECTORY } from './desktop-sqlite-bridge';
import { DESKTOP_HOST_CHANGE_CHANNEL } from './ipc-contract';

/** PGlite 第一次在一个空目录上启动要跑 initdb，本机实测个位数秒；CI 上更慢。 */
const PGLITE_TIMEOUT = 120_000;

/** 数据目录名；逻辑名，由 worker 解析到 {@link resolvePgliteDataRoot} 之下。 */
const DATA_DIRECTORY = 'demo_pglite';

let workspace: string;
/** 每个用例自己开的端口，`afterEach` 统一关掉——不关的话 vitest 会等在一个不会结束的事件循环上。 */
let openChannels: { close(): void }[];

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'dev-rxdb-electron-pglite-'));
  openChannels = [];
});

afterEach(() => {
  for (const channel of openChannels) channel.close();
  rmSync(workspace, { recursive: true, force: true });
});

/** 假窗口：`alive` 可写，用来模拟「事件在途时窗口被销毁」。 */
const createTarget = (id: number): DesktopPgliteEventTarget & { alive: boolean; send: ReturnType<typeof vi.fn> } => {
  const target = {
    id,
    alive: true,
    isDestroyed: (): boolean => !target.alive,
    send: vi.fn()
  };
  return target;
};

/**
 * 把 worker 端点与主线程侧接在一条真的 `MessageChannel` 上。
 *
 * @param dataRoot - worker 解析数据目录用的根
 * @returns 交给 {@link createDesktopPgliteBridge} 的 `createChannel`
 */
const linkedChannelFactory = (dataRoot: string): (() => DesktopPgliteWorkerChannel) => {
  return () => {
    const { port1, port2 } = new MessageChannel();
    createPgliteWorkerEndpoint(port1, dataRoot);
    openChannels.push({
      close: () => {
        port1.close();
        port2.close();
      }
    });
    return {
      postMessage: command => port2.postMessage(command),
      on: (event, listener) => port2.on(event, listener),
      // `MessagePort` 没有 'error'；对端关闭即等价于 worker 没了，语义上是同一件事。
      once: (_event, listener) => {
        port2.once('close', () => listener(new Error('the pglite worker channel closed')));
      },
      terminate: async () => {
        port1.close();
        port2.close();
      }
    };
  };
};

const createBridge = (): DesktopPgliteBridge =>
  createDesktopPgliteBridge({ createChannel: linkedChannelFactory(resolvePgliteDataRoot(workspace)) });

/** 开一条会话，断言成功并返回 `sessionId`。 */
const openSession = async (bridge: DesktopPgliteBridge, target: DesktopPgliteEventTarget): Promise<string> => {
  const response = await bridge.handle(target, {
    kind: 'pg.open',
    storage: { engine: 'pglite', dataDirectoryName: DATA_DIRECTORY }
  });
  if (response.kind !== 'pg.open') throw new Error(`open failed: ${JSON.stringify(response)}`);
  return response.result.sessionId;
};

/** 跑一条自动提交语句，断言成功并返回结果行。 */
const query = async (
  bridge: DesktopPgliteBridge,
  target: DesktopPgliteEventTarget,
  sessionId: string,
  sql: string,
  params: unknown[] = []
): Promise<readonly Record<string, unknown>[]> => {
  const response = await bridge.handle(target, { kind: 'pg.query', sessionId, sql, params });
  if (response.kind !== 'pg.query') throw new Error(`query failed: ${JSON.stringify(response)}`);
  return response.result.rows;
};

describe('resolvePgliteDataRoot', () => {
  it('把 PGlite 数据根解析到应用数据目录下的专属子目录', () => {
    expect(resolvePgliteDataRoot(workspace)).toBe(join(workspace, DESKTOP_PGLITE_DIRECTORY));
  });

  // 与 SQLite 侧同一条实测教训：Chromium 会在启动时清掉它自己那些目录里没登记过的文件，
  // 而 PGlite 的数据目录整棵树在它眼里都是「没登记过的」。名字撞上就是静默丢库。
  it('数据根目录名不与 Chromium 在 userData 下自用的目录重名', () => {
    const chromiumOwned = [
      'databases',
      'blob_storage',
      'cache',
      'code cache',
      'file system',
      'gpucache',
      'indexeddb',
      'local storage',
      'network',
      'service worker',
      'session storage',
      'shared proto db',
      'webstorage'
    ];
    expect(chromiumOwned).not.toContain(DESKTOP_PGLITE_DIRECTORY.toLowerCase());
  });

  // 三个根各自独立：PGlite 的数据目录是一棵会被整体删除/重建的树，
  // 和 SQLite 库文件或用户文件混在一层，一次重建就会连带删掉另外两者。
  it('与 SQLite 库目录、文件存储目录互不相同', () => {
    expect(new Set([DESKTOP_PGLITE_DIRECTORY, DESKTOP_DATABASE_DIRECTORY, DESKTOP_STORAGE_DIRECTORY]).size).toBe(3);
  });
});

describe('createDesktopPgliteBridge', () => {
  // AC#11 / AC#5 / AC#1：握手 → 建目录 → 逐值保真 → 重启后重连同一目录。
  //
  // 合成一条用例是因为 PGlite 每次冷启动都要跑一次 initdb；拆开只会让同一件事
  // 多花几十秒，而它们本来就是一条时间线上的连续动作。
  it(
    '握手带协议版本，首连只在应用作用域内建目录，且数据与类型跨重启逐值保持',
    async () => {
      const first = createBridge();
      const target = createTarget(11);

      const handshake = await first.handle(target, { kind: 'pg.handshake' });
      expect(handshake.kind).toBe('pg.handshake');

      // 握手不得有任何副作用：此时磁盘上不该出现数据根（AC#11）。
      expect(existsSync(resolvePgliteDataRoot(workspace))).toBe(false);

      const sessionId = await openSession(first, target);
      const opened = await first.handle(target, {
        kind: 'pg.open',
        storage: { engine: 'pglite', dataDirectoryName: DATA_DIRECTORY }
      });
      // AC#5：回给 renderer 的只有逻辑位置，不含 `workspace` 这个物理根。
      if (opened.kind !== 'pg.open') throw new Error('second open failed');
      expect(opened.result.resolvedLocation).not.toContain(workspace);
      expect(opened.result.resolvedLocation).toContain(DATA_DIRECTORY);
      // AC#7：同一个数据目录上的第二条会话复用同一个实例，磁盘上只有一棵树。
      expect(readdirSync(resolvePgliteDataRoot(workspace))).toEqual([DATA_DIRECTORY]);

      await query(
        first,
        target,
        sessionId,
        `CREATE TABLE fidelity (
           id int PRIMARY KEY,
           big int8 NOT NULL,
           blob bytea NOT NULL,
           doc jsonb NOT NULL,
           at timestamptz NOT NULL
         )`
      );
      // 2^53+1：JS 的 number 表示不了，退化成 number 的话这里当场差一。
      const big = 9007199254740993n;
      const blob = new Uint8Array([0, 1, 254, 255]);
      const doc = { nested: { list: [1, 2, 3] }, flag: true };
      const at = new Date('2026-08-30T01:02:03.000Z');
      await query(first, target, sessionId, 'INSERT INTO fidelity VALUES ($1, $2, $3, $4, $5)', [
        1,
        big,
        blob,
        doc,
        at
      ]);

      await first.handle(target, { kind: 'pg.close', sessionId });
      await first.closeAll();

      // ——— 重启：新 worker、新实例，同一个数据根 ———
      const second = createBridge();
      const reopened = createTarget(12);
      const nextSession = await openSession(second, reopened);
      const rows = await query(second, reopened, nextSession, 'SELECT * FROM fidelity WHERE id = 1');
      expect(rows).toHaveLength(1);
      const row = rows[0] as Record<string, unknown>;
      expect(row['big']).toBe(big);
      expect(row['blob']).toBeInstanceOf(Uint8Array);
      expect([...(row['blob'] as Uint8Array)]).toEqual([0, 1, 254, 255]);
      expect(row['doc']).toEqual(doc);
      expect(row['at']).toBeInstanceOf(Date);
      expect((row['at'] as Date).toISOString()).toBe(at.toISOString());

      await second.closeAll();
    },
    PGLITE_TIMEOUT
  );

  // AC#2 / AC#3：事务 ID 串起的多条语句真的是一条事务，且窗口崩了要能把它收回来。
  it(
    '事务 ID 串联的语句同属一条事务，窗口消失时被回滚且连接立即可用',
    async () => {
      const bridge = createBridge();
      const target = createTarget(21);
      const sessionId = await openSession(bridge, target);
      await query(bridge, target, sessionId, 'CREATE TABLE tx_demo (id int PRIMARY KEY)');

      const begun = await bridge.handle(target, { kind: 'pg.begin', sessionId });
      if (begun.kind !== 'pg.begin') throw new Error(`begin failed: ${JSON.stringify(begun)}`);
      const { transactionId } = begun.result;

      await bridge.handle(target, {
        kind: 'pg.query',
        sessionId,
        transactionId,
        sql: 'INSERT INTO tx_demo VALUES (1)',
        params: []
      });
      // 事务内看得见自己的未提交写入。
      const inside = await bridge.handle(target, {
        kind: 'pg.query',
        sessionId,
        transactionId,
        sql: 'SELECT count(*)::int AS n FROM tx_demo',
        params: []
      });
      if (inside.kind !== 'pg.query') throw new Error('in-transaction query failed');
      expect(inside.result.rows[0]?.['n']).toBe(1);

      await bridge.handle(target, { kind: 'pg.commit', sessionId, transactionId });
      expect((await query(bridge, target, sessionId, 'SELECT count(*)::int AS n FROM tx_demo'))[0]?.['n']).toBe(1);

      // ——— 窗口崩在事务中间 ———
      const doomed = await bridge.handle(target, { kind: 'pg.begin', sessionId });
      if (doomed.kind !== 'pg.begin') throw new Error('second begin failed');
      await bridge.handle(target, {
        kind: 'pg.query',
        sessionId,
        transactionId: doomed.result.transactionId,
        sql: 'INSERT INTO tx_demo VALUES (2)',
        params: []
      });

      target.alive = false;
      expect(await bridge.releaseTarget(target)).toBe(1);
      expect(bridge.openSessionCount).toBe(0);

      // 回收后连接必须立刻可用，且那条挂起的写入一行不落。
      const revived = createTarget(22);
      const nextSession = await openSession(bridge, revived);
      const rows = await query(bridge, revived, nextSession, 'SELECT id FROM tx_demo ORDER BY id');
      expect(rows.map(r => r['id'])).toEqual([1]);

      await bridge.closeAll();
    },
    PGLITE_TIMEOUT
  );

  // 会话 id 不是凭证；NOTIFY 只送给开这条会话的那个窗口。
  it(
    'NOTIFY 只投给持有会话的窗口，别的窗口连查询都发不出去',
    async () => {
      const bridge = createBridge();
      const owner = createTarget(31);
      const intruder = createTarget(32);
      const sessionId = await openSession(bridge, owner);

      const denied = await bridge.handle(intruder, {
        kind: 'pg.query',
        sessionId,
        sql: 'SELECT 1',
        params: []
      });
      expect(denied).toMatchObject({ kind: 'error', code: 'permission_denied' });

      await query(bridge, owner, sessionId, `SELECT pg_notify('rxdb_change_notify', 'hello')`);
      await vi.waitFor(() => expect(owner.send).toHaveBeenCalled(), { timeout: 5_000 });

      const [channel, message] = owner.send.mock.calls[0] as [string, Record<string, unknown>];
      // 走的是与 SQLite 变更事件同一条通道：preload 暴露的方法名已被 e2e 冻结，不新增通道。
      expect(channel).toBe(DESKTOP_HOST_CHANGE_CHANNEL);
      expect(message).toMatchObject({ kind: 'pg.notify', sessionId, channel: 'rxdb_change_notify', payload: 'hello' });
      expect(intruder.send).not.toHaveBeenCalled();

      await bridge.closeAll();
    },
    PGLITE_TIMEOUT
  );

  // 目录名来自 renderer。协议已经校验过一遍，worker 落盘前还要再校验一次——
  // 漏一个 `../` 进 join()，数据目录的位置就由调用方而不是应用决定了。
  it('拒绝越出数据根的目录名，且不为它建任何目录', async () => {
    const bridge = createBridge();
    const target = createTarget(41);
    const response: DesktopPgliteResponse = await bridge.handle(target, {
      kind: 'pg.open',
      storage: { engine: 'pglite', dataDirectoryName: '../../escape' }
    });
    expect(response.kind).toBe('error');
    expect(existsSync(resolvePgliteDataRoot(workspace))).toBe(false);
    await bridge.closeAll();
  });

  // 窗口可能恰好在 host 建会话的那一拍里销毁：那次 releaseTarget 扫到的归属表里还没有这条
  // 记录，登记后就再也没有回收时机了——而挂起的事务会一直独占 PGlite 的连接锁。
  it(
    '会话开出来时窗口已销毁，则当场关掉它并答 session_closed',
    async () => {
      const bridge = createBridge();
      const target = createTarget(51);

      const inflight = bridge.handle(target, {
        kind: 'pg.open',
        storage: { engine: 'pglite', dataDirectoryName: DATA_DIRECTORY }
      });
      // 请求还在 worker 那边跑着的时候窗口就没了——这正是竞态本身，不是模拟出来的。
      target.alive = false;

      const response = await inflight;
      expect(response).toMatchObject({ kind: 'error', code: 'session_closed' });
      expect(bridge.openSessionCount).toBe(0);

      await bridge.closeAll();
    },
    PGLITE_TIMEOUT
  );

  it('worker 报错时在途请求以可判别的错误码落地，而不是永远挂着', async () => {
    let fail!: (error: Error) => void;
    const bridge = createDesktopPgliteBridge({
      createChannel: () => ({
        postMessage: () => undefined,
        on: () => undefined,
        once: (_event, listener) => {
          fail = listener;
        },
        terminate: async () => undefined
      })
    });
    const target = createTarget(61);
    const inflight = bridge.handle(target, { kind: 'pg.handshake' });
    fail(new RxDBAdapterDesktopError('host_internal_error', 'boom'));
    await expect(inflight).resolves.toMatchObject({ kind: 'error', code: 'host_unavailable' });
  });

  // worker 阻塞在同步 WASM 查询里时根本收不到 closeAll 指令，ACK 永远不来。关停路径若等 ACK
  // 才 terminate，进程就挂在一条永不结束的 worker 上——正是这条路径声称要防的事。
  it('worker 卡死不回 closeAll 的 ACK 时，超时后仍强制 terminate 且 closeAll 正常结束', async () => {
    vi.useFakeTimers();
    try {
      const terminate = vi.fn(async () => undefined);
      const bridge = createDesktopPgliteBridge({
        createChannel: () => ({
          postMessage: () => undefined,
          on: () => undefined,
          once: () => undefined,
          terminate
        })
      });
      // 先发一条请求把 worker 拉起来；它永远不会被答复——这正是「卡死」本身，不是模拟出来的。
      void bridge.handle(createTarget(71), { kind: 'pg.handshake' });

      const closing = bridge.closeAll();
      // 上限之内要给 worker 正常收尾的机会：不能一上来就杀。
      await vi.advanceTimersByTimeAsync(DESKTOP_PGLITE_CLOSE_ALL_TIMEOUT_MS - 1);
      expect(terminate).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      await expect(closing).resolves.toBeUndefined();
      expect(terminate).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
