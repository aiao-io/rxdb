import { IRxDBAdapter, RxDB } from '@aiao/rxdb';
import { WorkingTreeCapabilityDisabledError } from '@aiao/rxdb-plugin-working-tree';
import { createMainThreadIdbRxDB, DEMO_ADAPTER_NAME, DEMO_ENTITIES } from './demo-rxdb-config';
import {
  businessTableNames,
  createCappedSink,
  FailureArchiveReason,
  FailureArchiveStage,
  toBase64,
  toFailureArchiveReason
} from './failure-archive';

// e2e 失败现场归档的页内测试 API（US-909 阶段 B）。契约见 `git show 2e820521:specs/004-us-909-failure-data-archive/data-model.md` §1；
// Node 端 fixture（apps/dev-rxdb-angular-e2e/src/fixtures.ts）按同一契约另写一份类型——e2e 项目不引用应用源码。

/** 一次归档的预算。 */
export interface FailureArchiveRequest {
  /** 页内截止：连接、读取、备份合计不超过它 */
  readonly deadlineMs: number;
  /** 备份等写锁的上限，超时报 `lock_timeout` */
  readonly lockTimeoutMs: number;
  /** 归档字节上限，超过报 `io_error` */
  readonly maxBytes: number;
}

/** 工作树摘要：未启用提交能力时只有 `enabled: false`。 */
export type WorkingTreeSummary =
  | { readonly enabled: false }
  | {
      readonly enabled: true;
      readonly branchId: string;
      readonly headCommitId: string | null;
      readonly clean: boolean;
      readonly entryCount: number;
    };

/** `archive()` 的结果：成功带完整归档，失败带原因；从不抛。 */
export type FailureArchivePageResult =
  | {
      readonly ok: true;
      /** 原始库名（不带 RxDB 追加的后缀） */
      readonly dbName: string;
      readonly base64: string;
      readonly bytes: number;
      /** 连接 + 读取 + 备份的耗时 */
      readonly durationMs: number;
      /** 业务表行数，键为表名 */
      readonly tables: Record<string, number>;
      readonly workingTree: WorkingTreeSummary;
    }
  | { readonly ok: false; readonly dbName: string; readonly reason: FailureArchiveReason };

/** 主实例的逻辑内容：AC#4「导出前后不变」的比较对象。 */
export interface DemoDbSnapshot {
  /** 全部结构 SQL，按对象名排序、换行拼接 */
  readonly schemaSql: string;
  readonly tables: Record<string, number>;
  readonly workingTree: WorkingTreeSummary;
}

/**
 * 挂在 `window.__rxdbFailureArchive` 上的 API。
 *
 * @remarks
 * 调用串行：上一次 `archive()` 的第二实例销毁之后，下一次 `archive()` / `snapshot()` 才开始——Node 端护栏超时后
 * 页内归档仍在后台跑，等它让出连接的唯一办法是排在它后面。
 */
export interface FailureArchiveApi {
  /** 原始库名（不带 RxDB 追加的后缀） */
  readonly dbName: string;
  archive(request: FailureArchiveRequest): Promise<FailureArchivePageResult>;
  snapshot(): Promise<DemoDbSnapshot>;
}

declare global {
  interface Window {
    __rxdbFailureArchive?: FailureArchiveApi;
  }
}

const SCHEMA_SQL = `SELECT group_concat("sql", char(10)) FROM (SELECT "sql" FROM sqlite_schema WHERE "sql" IS NOT NULL ORDER BY "name")`;

const firstCell = async (adapter: IRxDBAdapter, sql: string): Promise<unknown> => {
  if (!adapter.rawQuery) throw new Error(`Adapter ${adapter.name} has no rawQuery()`);
  const result = await adapter.rawQuery(sql);
  return result.rows[0]?.[0];
};

async function countBusinessTables(adapter: IRxDBAdapter): Promise<Record<string, number>> {
  const tables: Record<string, number> = {};
  for (const table of businessTableNames(DEMO_ENTITIES)) {
    tables[table] = Number(await firstCell(adapter, `SELECT count(*) FROM "${table}"`));
  }
  return tables;
}

async function readWorkingTree(rxdb: RxDB): Promise<WorkingTreeSummary> {
  try {
    const status = await rxdb.workingTree.status();
    const log = await rxdb.workingTree.listCommits({ limit: 1 });
    return {
      enabled: true,
      branchId: log.branchId,
      headCommitId: log.headCommitId,
      clean: status.clean,
      entryCount: status.entryCount
    };
  } catch (error) {
    if (error instanceof WorkingTreeCapabilityDisabledError) return { enabled: false };
    throw error;
  }
}

const noop = (): void => undefined;

// `connect()` 与读取不收 signal，只能与截止赛跑；输掉的那条在后台继续，由 finally 等它 settle 后销毁
function beforeDeadline<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  const deadline = new Promise<never>((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  return Promise.race([work, deadline]);
}

// 返回销毁完成的 Promise；截止落在 `connect()` 上时它要等 `connect()` settle，调用方不必等它就能返回
function releaseSecondary(secondary: RxDB, connecting: Promise<unknown>): Promise<void> {
  // 销毁失败不改归档结论（归档已在手或原因已定），记到控制台，进 trace
  const destroy = () => secondary.destroy().catch(error => console.error('[failure-archive] destroy failed', error));
  return connecting.then(destroy, destroy);
}

/**
 * 在 `window.__rxdbFailureArchive` 上安装失败现场归档 API，供 e2e fixture 在用例失败时调用。
 *
 * @remarks
 * `archive()` 在同一页面里另开一个主线程 IDB 连接（{@link createMainThreadIdbRxDB}）连上同一个库，按截止依次
 * 等主实例的 `connect()` 停手（成败不论；两边同时建触发器会撞 `database is locked`）→ 连接 → 读业务表行数与工作树
 * → `backup()`，返回 base64 归档；不动主实例（它可能在 Worker / SharedWorker 里，
 * 没有 `backup()`）。所有失败折成 `{ ok: false, reason }`，从不抛；第二实例在返回前销毁（截止落在 `connect()`
 * 上时等它 settle 后在后台销毁）。
 *
 * 备份持写锁期间，主实例若恰好写入，可能偶发 `database is locked`（owner 2026-10-02 接受：只在用例已失败后
 * 发生，且只影响那次失败处理）。
 *
 * `snapshot()` 读主实例的结构文本、业务表行数与工作树，供 AC#4 比较导出前后。
 *
 * 只在浏览器里安装；dev 应用专用，不进公开包。
 *
 * @param primary - 应用的主实例（已 `init()`）
 * @param options - `dbName` 为原始库名；`baseHref` 为应用的 `APP_BASE_HREF`
 */
export function installFailureArchiveApi(primary: RxDB, options: { dbName: string; baseHref: string }): void {
  if (typeof window === 'undefined') return;
  const { dbName, baseHref } = options;
  // 上一次 `archive()` 的第二实例销毁完成
  let idle: Promise<void> = Promise.resolve();

  const archive = async (request: FailureArchiveRequest): Promise<FailureArchivePageResult> => {
    const previous = idle;
    let markIdle!: () => void;
    idle = new Promise(resolve => (markIdle = resolve));
    await previous;
    const started = performance.now();
    const signal = AbortSignal.timeout(request.deadlineMs);
    try {
      // 主实例的 `connect()` 会重建触发器；重开的页面上它可能还没连完，第二实例同时连接会撞 `database is locked`。
      // 只等它停手，成败不论：主实例连不上时库里的数据照样要导出
      await beforeDeadline(primary.connect(DEMO_ADAPTER_NAME).then(noop, noop), signal);
    } catch (error) {
      markIdle();
      return { ok: false, dbName, reason: toFailureArchiveReason('connect', error, signal) };
    }
    const secondary = createMainThreadIdbRxDB(dbName, baseHref);
    let stage: FailureArchiveStage = 'connect';
    let settled = false;
    const connecting = secondary.connect(DEMO_ADAPTER_NAME).finally(() => (settled = true));
    try {
      const adapter = await beforeDeadline(connecting, signal);
      stage = 'inspect';
      const tables = await beforeDeadline(countBusinessTables(adapter), signal);
      const workingTree = await beforeDeadline(readWorkingTree(secondary), signal);
      stage = 'backup';
      const sink = createCappedSink(request.maxBytes);
      await adapter.backup(sink.stream, { signal, lockTimeoutMs: request.lockTimeoutMs });
      const bytes = sink.bytes();
      const durationMs = Math.round(performance.now() - started);
      return { ok: true, dbName, base64: toBase64(bytes), bytes: bytes.byteLength, durationMs, tables, workingTree };
    } catch (error) {
      return { ok: false, dbName, reason: toFailureArchiveReason(stage, error, signal) };
    } finally {
      const released = releaseSecondary(secondary, connecting).then(markIdle);
      // 截止落在 `connect()` 上：不阻塞返回，销毁在后台等 `connect()` settle
      if (settled) await released;
    }
  };

  const snapshot = async (): Promise<DemoDbSnapshot> => {
    await idle;
    const adapter = await primary.connect(DEMO_ADAPTER_NAME);
    return {
      schemaSql: String(await firstCell(adapter, SCHEMA_SQL)),
      tables: await countBusinessTables(adapter),
      workingTree: await readWorkingTree(primary)
    };
  };

  window.__rxdbFailureArchive = { dbName, archive, snapshot };
}
