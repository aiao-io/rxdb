# Data Model: US-909 阶段 B

**Date**: 2026-10-02 | **Plan**: [plan.md](plan.md)

## 1. 页内测试 API：`window.__rxdbFailureArchive`

由 `setup_rxdb_sqlite-wasm.ts` 在 `rxdb.init()` 之后安装（仿 `installSearchDemoTestApi`），只在主实例走 IDB 时（e2e 端口 8200
或打开导入库）安装，且按需 `import()`——备份读写不进初始包；fixture 归档前会等它出现。只在 dev 应用里，不进公开包。

```ts
interface FailureArchiveRequest {
  readonly deadlineMs: number; // 页内截止，默认 20_000（research D5）
  readonly lockTimeoutMs: number; // 默认 10_000
  readonly maxBytes: number; // 默认 32 * 1024 * 1024（research D4）
}

type FailureArchiveStage = 'connect' | 'backup' | 'inspect';

interface FailureArchiveReason {
  readonly stage: FailureArchiveStage | 'page' | 'transfer';
  readonly code: string; // RxDBBackupError.code | 'timeout' | 'context_unavailable' | 'error'
  readonly message: string;
}

type WorkingTreeSummary =
  | { readonly enabled: false }
  | {
      readonly enabled: true;
      readonly branchId: string;
      readonly headCommitId: string | null;
      readonly clean: boolean;
      readonly entryCount: number;
    };

type FailureArchivePageResult =
  | {
      readonly ok: true;
      readonly dbName: string; // 原始库名（不带 @0_1）
      readonly base64: string; // 完整归档
      readonly bytes: number;
      readonly durationMs: number; // connect + inspect + backup
      readonly tables: Record<string, number>;
      readonly workingTree: WorkingTreeSummary;
    }
  | { readonly ok: false; readonly dbName: string; readonly reason: FailureArchiveReason };

interface DemoDbSnapshot {
  // AC#4 逻辑不变式的比较对象（读主实例）
  readonly schemaSql: string; // SELECT group_concat(sql, char(10)) FROM sqlite_schema（按 name 排序）
  readonly tables: Record<string, number>;
  readonly workingTree: WorkingTreeSummary;
}

interface FailureArchiveApi {
  readonly dbName: string; // 原始库名；fixture 以它出现作为「API 已就绪」
  archive(request: FailureArchiveRequest): Promise<FailureArchivePageResult>;
  snapshot(): Promise<DemoDbSnapshot>;
}
```

**规则**

- `archive()` 不抛：所有失败都折成 `{ ok: false, reason }`。第二实例在 `finally` 里 `destroy()`；截止落在 `connect()` 上时
  等 `connect()` settle 后再 `destroy()`，不阻塞返回。
- **先等主实例**：建第二实例之前先等主实例的 `connect()` 停手（成败不论，受同一截止约束）。重开的页面上主实例可能还在
  重建触发器，两边同时连接会撞 `database is locked`（CI 上两条 AC#5 用例每次都撞）；截止落在这一步上报
  `stage: 'connect'` 的 `timeout`。
- **串行**：`archive()` 等上一次的第二实例销毁完成才开始；`snapshot()` 也等它，避免读到导出中途的锁。
- `inspect` 阶段（行数 + 工作树）在 `connect()` 之后、`backup()` 之前，读第二实例。
- **业务表**：`DEMO_ENTITIES` 每个实体经 `get_table_name_by_metadata(getEntityMetadata(E))` 得到的表；键为表名。
  不按前缀猜系统表。
- **工作树**：`workingTree.status()` 抛 `WorkingTreeCapabilityDisabledError` → `{ enabled: false }`；其他异常照常失败
  （`stage: 'inspect'`）。HEAD 取 `listCommits({ limit: 1 })` 页的 `headCommitId` 与 `branchId`。
- **原因映射**（纯函数 `toFailureArchiveReason(stage, error, signal)`）：

  | 输入                                                               | `code`                                         |
  | ------------------------------------------------------------------ | ---------------------------------------------- |
  | 截止已到（`signal.aborted` 且 reason 为 `TimeoutError`），任何阶段 | `timeout`                                      |
  | `RxDBBackupError`                                                  | `error.code`（如 `lock_timeout` / `io_error`） |
  | 其他 `Error`                                                       | `error`，`message` 带 `name: message`          |

- `maxBytes`：sink 累计字节超过上限时 `write` 以 `RangeError('failure archive exceeds maxBytes <n>')` 拒绝，
  `backup()` 报 `RxDBBackupError('io_error')`，`message` 拼上 `cause` 的消息。

## 2. 测试附件

| 名称                   | `contentType`              | 何时                               |
| ---------------------- | -------------------------- | ---------------------------------- |
| `rxdb-failure-archive` | `application/octet-stream` | 导出成功                           |
| `rxdb-failure-summary` | `application/json`         | 每次触发失败处理（成功或失败都有） |

通过的用例、预期失败（`test.fail()`）、`skipped` / `interrupted` 不留任何附件（research D6）。

## 3. 摘要 `rxdb-failure-summary`（JSON）

```ts
interface FailureArchiveSummary {
  readonly format: 'aiao-rxdb-e2e-failure-summary';
  readonly version: 1;
  readonly testStatus: TestInfo['status']; // 归档时的状态；自动触发时是 failed / timedOut，spec 直接调用时多为 passed
  readonly page: 'original' | 'reopened' | 'unavailable';
  readonly outcome: 'archived' | 'not_archived';
  readonly dbName: string | null; // page 不可用时为 null
  readonly durationMs: number; // Node 端从开始到附件写完
  // outcome === 'archived'
  readonly archive?: { readonly attachment: 'rxdb-failure-archive'; readonly bytes: number };
  readonly tables?: Record<string, number>;
  readonly workingTree?: WorkingTreeSummary;
  // outcome === 'not_archived'
  readonly reason?: FailureArchiveReason;
}
```

**规则**：`archived` 时 `archive` / `tables` / `workingTree` 必有、`reason` 不出现；`not_archived` 时只有 `reason`。

## 4. fixture 模块 `apps/dev-rxdb-angular-e2e/src/fixtures.ts`

```ts
export const test: TestType<...>;           // base.extend：auto fixture `failureArchive`，依赖 page / context
export { expect } from '@playwright/test';
export function archiveFailure(
  page: Page,
  testInfo: TestInfo,
  options?: Partial<FailureArchiveRequest> & { nodeGuardMs?: number; crashed?: boolean }
): Promise<FailureArchiveSummary>;
```

- auto fixture：setup 订阅 `page.on('crash')`；`await use()` 之后按 research D6 判定，命中则
  `testInfo.setTimeout(testInfo.timeout + 60_000)` → `archiveFailure(...)`。fixture 自己不抛，原始失败与 trace 原样保留。
- `archiveFailure` 选页（research D7）→ 等 `window.__rxdbFailureArchive` → `page.evaluate(archive)` 与 `nodeGuardMs`
  （默认 25 000）race → 写附件 → 返回摘要。`options` 只给 `failure-archive.spec.ts` 制造 AC#8 的失败。

## 5. 导入覆盖键

| 键                           | 存放           | 值                      | 读者                                                                                       |
| ---------------------------- | -------------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| `rxdb-demo-imported-db-name` | `localStorage` | 原始库名（不带 `@0_1`） | `setup_rxdb_sqlite-wasm.ts`：有值则用作库名并强制 IDB + SharedWorker；也安装 §1 的页内 API |

读写集中在 `rxdb/imported-db.ts`（`getImportedDbName` / `openImportedDb` / `leaveImportedDb`），不引用备份读写；读 manifest 与
恢复在 `rxdb/failure-archive-import.ts`，只随导入页懒加载。

## 6. 导入页状态（`/failure-archive`）

| `data-phase` | 含义           | 界面                                                                                   |
| ------------ | -------------- | -------------------------------------------------------------------------------------- |
| `idle`       | 未选文件       | 文件输入 + 说明                                                                        |
| `parsed`     | manifest 已读  | 库名、创建时间、格式版本；「导入并打开」                                               |
| `importing`  | 恢复中         | 按钮禁用，`aria-busy="true"`                                                           |
| `error`      | 解析或恢复失败 | `role="alert"` 显示 `code` 与消息；`target_not_empty` / `target_busy` 另有「打开该库」 |

成功后不停留在页面上：写覆盖键并 reload。打开导入库时，`app` 外壳顶部显示提示条「正在查看导入的失败现场库 <名>」与「回到默认库」。

- 恢复前先 `cleanupIncompleteRestore()`（没有标记时什么都不做），上一次中途被打断的恢复不会让这次报 `restore_incomplete`。
- 「打开该库」也覆盖 `target_busy`：同名库正被本机另一个标签页（SharedWorker）打开时，恢复拿不到独占锁报的是它，而不是
  `target_not_empty`；两种情况库都已在本机。判定为纯函数 `canOpenExisting(code)`。
- 错误码由纯函数 `toImportFailure(error)` 给出：`RxDBBackupError` → 其 `code`；`UnsupportedArchiveError`（`dbNameFromManifest`
  认不出库名）→ `unsupported_archive`；其他 → `error`。
- test id：页面根 `failure-archive-page`（带 `data-phase` / `aria-busy`）、`failure-archive-db-name` / `-created-at` /
  `-format-version`、`failure-archive-error`（`-code`）；提示条 `imported-db-banner`、`imported-db-name`。文件输入的
  `<label>` 文本为「选择归档文件」。

**manifest → 库名**（纯函数 `dbNameFromManifest(manifest)`）：`authDomain` 就是源实例的 `config.dbName`
（`<库名>@<RXDB_DB_NAME_SUFFIX>`），返回最后一个 `@` 之前的部分。`encryption === null`、没有 `@` 或前缀为空时抛 `UnsupportedArchiveError`，
页面进 `error` 态（`code: 'unsupported_archive'`）。`RXDB_DB_NAME_SUFFIX` 不在 `@aiao/rxdb` 公开面上，本特性不碰
`packages/*`，所以不在这里比对后缀：目标实例按取出的库名构造，后缀不符时 `restore()` 自己的兼容性校验报
`auth_domain_mismatch`，同样进 `error` 态，不猜、不改名重试。
