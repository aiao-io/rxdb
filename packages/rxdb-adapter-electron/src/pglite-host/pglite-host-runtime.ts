/**
 * 桌面 PGlite host 与宿主应用之间的运行时契约，以及 host 各处共用的语句与事务工具。
 *
 * @module pglite-host/pglite-host-runtime
 */

import { RxDBAdapterDesktopError, type DesktopPgliteQueryResult } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';

/** 一条语句的结果；`ElectronPgliteRuntime` 与 PGlite 的 `Results` 在此结构相容。 */
export interface ElectronPgliteRuntimeResult {
  readonly rows: Record<string, unknown>[];
  readonly fields: { name: string; dataTypeID: number }[];
  readonly affectedRows?: number;
}

/** 事务句柄；对应 PGlite 的 `Transaction`，只声明 host 真正用到的两个操作。 */
export interface ElectronPgliteTransaction {
  query(sql: string, params?: unknown[]): Promise<ElectronPgliteRuntimeResult>;
  exec(sql: string): Promise<ElectronPgliteRuntimeResult[]>;
}

/**
 * host 需要的 PGlite 能力子集。
 *
 * @remarks
 * 刻意不写成 `PGliteInterface`：宿主应用极可能传进来的不是裸 `PGlite`，而是跑在 worker
 * 里的 `PGliteWorker`——PGlite 的 WASM 在主进程 JS 线程上是**同步**执行的，一条重查询会
 * 把整个窗口的 IPC 一起卡住（故事「冻结带来的三条实现约束」第 3 条）。声明成结构类型后，
 * 两者都能直接传入，而这份清单也顺便说清了 host 只需要这五个操作。
 */
export interface ElectronPgliteRuntime {
  query(sql: string, params?: unknown[]): Promise<ElectronPgliteRuntimeResult>;
  exec(sql: string): Promise<ElectronPgliteRuntimeResult[]>;
  transaction<T>(callback: (tx: ElectronPgliteTransaction) => Promise<T>): Promise<T>;
  listen(channel: string, callback: (payload: string) => void): Promise<unknown>;
  close(): Promise<void>;
}

/**
 * 回答 `pg.engine` 的探针运行时：只需要查询与关闭（US-217）。
 *
 * @remarks
 * 裸 `new PGlite()`（内存实例）即满足；它必须与 `createRuntime` 起的实例是同一份 PGlite、
 * 带同一组扩展，否则回答的引擎版本对真实数据目录不成立。
 */
export type ElectronPgliteProbeRuntime = Pick<ElectronPgliteRuntime, 'query' | 'close'>;

/**
 * 把 PGlite 的结果收窄成能过结构化克隆的形状。
 *
 * @remarks
 * `fields` 上除了 `name` / `dataTypeID` 还挂着 PGlite 自己的解析器，整个丢给
 * `ipcRenderer.invoke` 会以 DataCloneError 失败——而报错点在 IPC 层，看上去与 SQL 毫无关系。
 * `rows` 里的 bigint / Uint8Array / Date 都是结构化克隆原生支持的，原样带走（AC#1）。
 *
 * @param result - 运行时返回的结果
 * @returns 可以跨进程传递的结果
 */
export const toWireResult = (result: ElectronPgliteRuntimeResult): DesktopPgliteQueryResult => ({
  rows: result.rows,
  fields: result.fields.map(field => ({ name: field.name, dataTypeID: field.dataTypeID })),
  affectedRows: result.affectedRows
});

/**
 * 跑一条语句，把引擎抛出的错误归一成 `statement_failed`。
 *
 * @remarks
 * 不归一的话，一条写错的 SQL 会以 `host_internal_error` 回到 renderer——那个码的含义是
 * 「host 有缺陷」，会把调用方的排查引向完全错误的方向。
 *
 * @param run - 执行语句
 * @returns 语句结果
 * @throws {@link RxDBAdapterDesktopError} 语句失败时为 `statement_failed`；已经是桌面错误的原样透传
 */
export const runStatement = async <T>(run: () => Promise<T>): Promise<T> => {
  try {
    return await run();
  } catch (error) {
    if (error instanceof RxDBAdapterDesktopError) throw error;
    throw new RxDBAdapterDesktopError('statement_failed', error instanceof Error ? error.message : String(error), {
      cause: error
    });
  }
};

/** 一条挂起中的事务：`transaction(cb)` 的 callback 停在 host 持有的 promise 上。 */
export interface SuspendedTransaction {
  readonly tx: ElectronPgliteTransaction;
  /** 结掉 callback：`resolve` 提交，`reject` 让 callback 抛出从而回滚。 */
  readonly settle: { readonly resolve: () => void; readonly reject: (error: Error) => void };
  /** `transaction(...)` 本身；等它落地才算真的提交/回滚完。 */
  readonly finished: Promise<unknown>;
}

/** 等连接等到超时的哨兵；用 Symbol 是因为任何合法的 `tx` 都不可能与它相等。 */
const TIMED_OUT = Symbol('transaction begin timed out');

const raceTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<typeof TIMED_OUT>(resolve => {
        timer = setTimeout(() => resolve(TIMED_OUT), ms);
      })
    ]);
  } finally {
    // 不清掉的话，一次成功的 begin 也会让 Node 的事件循环多活 `ms` 毫秒，
    // 于是应用退出被推迟——在测试里表现为「跑完了但进程不退」。
    clearTimeout(timer);
  }
};

/**
 * 在运行时上开一条事务并把它挂起，直到调用方结掉 `settle`。
 *
 * @remarks
 * PGlite 只提供 callback 形态的事务（`transaction(cb)`，返回即 COMMIT、抛出即 ROLLBACK），
 * 而 `cb` 跨不了 IPC。这里进入 `cb` 后立刻 `await` 一个由 host 持有的 promise，事务因此在
 * PostgreSQL 侧一直开着、连接一直被占住。`pg.begin` 用它把多次 IPC 串成一条真事务，
 * `pg.backup.begin` 用它在读快照期间挡住一切写入（AC#16）。
 *
 * @param runtime - 运行时
 * @param timeout - 等待连接空闲的上限（毫秒）
 * @returns 已挂起的事务
 * @throws {@link RxDBAdapterDesktopError} `transaction_unavailable`：到期时连接仍被别的事务占着
 */
export const suspendTransaction = async (
  runtime: ElectronPgliteRuntime,
  timeout: number
): Promise<SuspendedTransaction> => {
  let settle!: SuspendedTransaction['settle'];
  const closed = new Promise<void>((resolve, reject) => {
    settle = { resolve, reject };
  });
  // 超时路径会在任何人 await 之前就 reject 它；先接住，免得变成未处理拒绝而打死进程。
  closed.catch(() => undefined);

  let markStarted!: (tx: ElectronPgliteTransaction) => void;
  const started = new Promise<ElectronPgliteTransaction>(resolve => {
    markStarted = resolve;
  });
  const finished = runtime.transaction(async tx => {
    markStarted(tx);
    // 事务从这里一直开着，直到调用方结掉 `closed`。
    await closed;
  });
  finished.catch(() => undefined);

  const tx = await raceTimeout(started, timeout);
  if (tx === TIMED_OUT) {
    // 关键在于 reject 而不是简单丢弃：被丢弃的 callback 迟早会在连接空出来的一瞬间
    // 启动，然后永远挂在 `await closed` 上——于是「超时之后再也开不了事务」，
    // 而现场看起来只是「数据库不响应」。reject 让它一进 callback 就抛，
    // PGlite 随即回滚这条空事务并交还连接。
    settle.reject(
      new RxDBAdapterDesktopError('transaction_unavailable', 'the begin that opened this transaction timed out')
    );
    throw new RxDBAdapterDesktopError(
      'transaction_unavailable',
      `waited ${timeout}ms for the PGlite connection but another transaction still holds it`
    );
  }
  return { tx, settle, finished };
};
