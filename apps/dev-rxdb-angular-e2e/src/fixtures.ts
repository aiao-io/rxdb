import { test as base, type Page, type TestInfo } from '@playwright/test';

export { expect } from '@playwright/test';

/**
 * e2e 失败现场数据归档（US-909 阶段 B）。
 *
 * @remarks
 * 本模块导出的 `test` 带一个 auto fixture：用例**意外地**以 `failed` / `timedOut` 结束时（`test.fail()` 的预期失败、
 * `skipped`、`interrupted` 不算），在拆卸阶段经页内 API `window.__rxdbFailureArchive` 把该用例的 e2e 库导出成
 * US-217 备份归档，挂成附件 `rxdb-failure-archive`，另附摘要 `rxdb-failure-summary`。通过的用例什么都不做。
 * spec 一律从这里取 `test`（lint 守卫 `no-restricted-imports`）。
 *
 * 归档自己不抛：任何一步失败都记进摘要的 `reason`，原始失败与 trace 原样保留。
 *
 * **超时阶梯**：页内截止 20 s（连接 + 读取 + 备份）< Node 端护栏 25 s（`page.evaluate` 回传）< 拆卸追加的 60 s 预算
 * （含主页面已关闭 / 崩溃时重开页面）。
 *
 * **并发锁风险**：备份持写锁期间，页面若恰好写入，可能偶发 `database is locked`（owner 2026-10-02 接受：只在用例
 * 已失败后发生）。
 *
 * 类型与页内 API 的契约见 `git show 2e820521:specs/004-us-909-failure-data-archive/data-model.md`；e2e 项目不引用应用源码，所以这里另写一份。
 *
 * @module fixtures
 */

/** 一次归档的预算（页内）。 */
export interface FailureArchiveRequest {
  readonly deadlineMs: number;
  readonly lockTimeoutMs: number;
  readonly maxBytes: number;
}

/** 没能归档的原因。 */
export interface FailureArchiveReason {
  readonly stage: 'connect' | 'inspect' | 'backup' | 'page' | 'transfer';
  /** `RxDBBackupError.code` / `timeout` / `context_unavailable` / `error` */
  readonly code: string;
  readonly message: string;
}

/** 工作树摘要。 */
export type WorkingTreeSummary =
  | { readonly enabled: false }
  | {
      readonly enabled: true;
      readonly branchId: string;
      readonly headCommitId: string | null;
      readonly clean: boolean;
      readonly entryCount: number;
    };

/** 页内 `archive()` 的结果。 */
export type FailureArchivePageResult =
  | {
      readonly ok: true;
      readonly dbName: string;
      readonly base64: string;
      readonly bytes: number;
      readonly durationMs: number;
      readonly tables: Record<string, number>;
      readonly workingTree: WorkingTreeSummary;
    }
  | { readonly ok: false; readonly dbName: string; readonly reason: FailureArchiveReason };

/** 页内 `snapshot()` 的结果：主实例的逻辑内容。 */
export interface DemoDbSnapshot {
  readonly schemaSql: string;
  readonly tables: Record<string, number>;
  readonly workingTree: WorkingTreeSummary;
}

interface FailureArchiveApi {
  readonly dbName: string;
  archive(request: FailureArchiveRequest): Promise<FailureArchivePageResult>;
  snapshot(): Promise<DemoDbSnapshot>;
}

declare global {
  interface Window {
    __rxdbFailureArchive?: FailureArchiveApi;
  }
}

/** 摘要附件 `rxdb-failure-summary` 的内容。 */
export interface FailureArchiveSummary {
  readonly format: 'aiao-rxdb-e2e-failure-summary';
  readonly version: 1;
  /** 归档时的 `testInfo.status`：自动触发时是 `failed` / `timedOut` */
  readonly testStatus: TestInfo['status'];
  readonly page: 'original' | 'reopened' | 'unavailable';
  readonly outcome: 'archived' | 'not_archived';
  /** 原始库名；没能进入应用页面时为 `null` */
  readonly dbName: string | null;
  /** Node 端从开始到归档附件写完 */
  readonly durationMs: number;
  readonly archive?: { readonly attachment: typeof ARCHIVE_ATTACHMENT; readonly bytes: number };
  readonly tables?: Record<string, number>;
  readonly workingTree?: WorkingTreeSummary;
  readonly reason?: FailureArchiveReason;
}

/** {@link archiveFailure} 的选项；默认值即自动触发时的取值，覆盖只用于制造 AC#8 的失败。 */
export type ArchiveFailureOptions = Partial<FailureArchiveRequest> & {
  /** Node 端等 `page.evaluate` 回传的护栏 */
  readonly nodeGuardMs?: number;
  /** 主页面已崩溃（fixture 由 `page.on('crash')` 得知） */
  readonly crashed?: boolean;
};

const ARCHIVE_ATTACHMENT = 'rxdb-failure-archive';
const SUMMARY_ATTACHMENT = 'rxdb-failure-summary';
const DEFAULT_REQUEST: FailureArchiveRequest = {
  deadlineMs: 20_000,
  lockTimeoutMs: 10_000,
  maxBytes: 32 * 1024 * 1024
};
const DEFAULT_NODE_GUARD_MS = 25_000;
const API_WAIT_MS = 10_000;
const TEARDOWN_BUDGET_MS = 60_000;
/** 与 dev 应用 `setup_rxdb_sqlite-wasm.ts` 同名：重开的页面不得在导出前自动启用工作树（那等于改了库）。 */
const WORKING_TREE_AUTO_ENABLE_SKIP_KEY = 'rxdb-e2e-skip-working-tree-auto-enable';

type PageChoice =
  | { readonly page: 'original' | 'reopened'; readonly target: Page }
  | { readonly page: 'unavailable'; readonly reason: FailureArchiveReason };

// 页内结果，或页内结果之前就失败了（没能进入应用页面时库名未知）
type Transfer =
  FailureArchivePageResult | { readonly ok: false; readonly dbName: null; readonly reason: FailureArchiveReason };

const describeError = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

async function choosePage(page: Page, crashed: boolean): Promise<PageChoice> {
  if (!page.isClosed() && !crashed) return { page: 'original', target: page };
  try {
    // 库名在 localStorage，同一上下文的新页面连的是同一个库
    const target = await page.context().newPage();
    await target.addInitScript(key => window.localStorage.setItem(key, '1'), WORKING_TREE_AUTO_ENABLE_SKIP_KEY);
    await target.goto('/home');
    return { page: 'reopened', target };
  } catch (error) {
    return {
      page: 'unavailable',
      reason: { stage: 'page', code: 'context_unavailable', message: describeError(error) }
    };
  }
}

async function waitForApi(target: Page): Promise<string> {
  const handle = await target.waitForFunction(() => window.__rxdbFailureArchive?.dbName, undefined, {
    timeout: API_WAIT_MS
  });
  return String(await handle.jsonValue());
}

// 护栏只管 `page.evaluate` 回传；到点时页内归档仍在后台跑完，下一次页内调用会排在它后面
async function transfer(target: Page, request: FailureArchiveRequest, nodeGuardMs: number): Promise<Transfer> {
  let dbName: string;
  try {
    dbName = await waitForApi(target);
  } catch (error) {
    const code = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'error';
    return { ok: false, dbName: null, reason: { stage: 'page', code, message: describeError(error) } };
  }
  const evaluating = target.evaluate(async req => {
    const api = window.__rxdbFailureArchive;
    if (!api) throw new Error('window.__rxdbFailureArchive disappeared');
    return api.archive(req);
  }, request);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<'expired'>(resolve => (timer = setTimeout(() => resolve('expired'), nodeGuardMs)));
  try {
    const settled = await Promise.race([evaluating, guard]);
    if (settled !== 'expired') return settled;
    // 输掉的 evaluate 稍后可能因页面关闭而拒绝，这里接住，不让它成为未处理的拒绝
    evaluating.catch(() => undefined);
    const message = `page.evaluate did not return within nodeGuardMs ${nodeGuardMs}`;
    return { ok: false, dbName, reason: { stage: 'transfer', code: 'timeout', message } };
  } catch (error) {
    return { ok: false, dbName, reason: { stage: 'transfer', code: 'error', message: describeError(error) } };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 导出当前用例的 e2e 库，挂归档与摘要附件。
 *
 * @remarks
 * 主页面已关闭或已崩溃时，在同一上下文新开页面导出同一个库（摘要 `page: 'reopened'`）；上下文也不可用时不导出
 * （`page: 'unavailable'`，`reason.code: 'context_unavailable'`）。从不因归档失败而抛。
 *
 * auto fixture 在用例失败时调用它；`failure-archive.spec.ts` 直接调用它验证归档行为。
 *
 * @param page - 用例的主页面
 * @param testInfo - 附件挂在这个用例上
 * @param options - 预算覆盖与崩溃标记
 * @returns 摘要（与摘要附件内容相同）
 */
export async function archiveFailure(
  page: Page,
  testInfo: TestInfo,
  options: ArchiveFailureOptions = {}
): Promise<FailureArchiveSummary> {
  const started = Date.now();
  const { nodeGuardMs = DEFAULT_NODE_GUARD_MS, crashed = false, ...overrides } = options;
  const request: FailureArchiveRequest = { ...DEFAULT_REQUEST, ...overrides };
  const head = { format: 'aiao-rxdb-e2e-failure-summary', version: 1, testStatus: testInfo.status } as const;

  const chosen = await choosePage(page, crashed);
  const transferred: Transfer =
    chosen.page === 'unavailable' ?
      { ok: false, dbName: null, reason: chosen.reason }
    : await transfer(chosen.target, request, nodeGuardMs);

  let summary: FailureArchiveSummary;
  if (transferred.ok) {
    await testInfo.attach(ARCHIVE_ATTACHMENT, {
      body: Buffer.from(transferred.base64, 'base64'),
      contentType: 'application/octet-stream'
    });
    summary = {
      ...head,
      page: chosen.page,
      outcome: 'archived',
      dbName: transferred.dbName,
      durationMs: Date.now() - started,
      archive: { attachment: ARCHIVE_ATTACHMENT, bytes: transferred.bytes },
      tables: transferred.tables,
      workingTree: transferred.workingTree
    };
  } else {
    summary = {
      ...head,
      page: chosen.page,
      outcome: 'not_archived',
      dbName: transferred.dbName,
      durationMs: Date.now() - started,
      reason: transferred.reason
    };
  }
  await testInfo.attach(SUMMARY_ATTACHMENT, {
    body: JSON.stringify(summary, null, 2),
    contentType: 'application/json'
  });
  return summary;
}

const shouldArchive = (testInfo: TestInfo): boolean =>
  testInfo.status !== testInfo.expectedStatus && (testInfo.status === 'failed' || testInfo.status === 'timedOut');

/**
 * 带失败现场归档 auto fixture 的 `test`；spec 一律从这里取。
 */
export const test = base.extend<{ failureArchive: void }>({
  failureArchive: [
    async ({ page }, use, testInfo) => {
      let crashed = false;
      page.on('crash', () => (crashed = true));
      await use();
      if (!shouldArchive(testInfo)) return;
      testInfo.setTimeout(testInfo.timeout + TEARDOWN_BUDGET_MS);
      await archiveFailure(page, testInfo, { crashed });
    },
    { auto: true }
  ]
});
