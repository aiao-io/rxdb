---
id: US-909
title: 会话录制回放与失败现场数据还原
status: In Progress
priority: Medium
epic: epic-004-future-features
created: 2026-09-18
updated: 2026-10-02
tags: [future, replay, debugging, e2e, playwright-trace, working-tree, rrweb]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 阶段 A 无前置；阶段 B 的传输限制经同库名的主线程 IDB 第二连接绕开（plan 前 spike，不过才依赖 🚧 Worker / SharedWorker 传输的备份恢复）
- [x] Negotiable (可协商): trace 内容选项与开销上限、第二连接的导出细节与归档流回 Node 的方式、事件流的存放位置在各阶段 plan 冻结
- [x] Valuable (有价值): 阶段 A 关闭「本地失败从不产生 trace、CI 只留第一次重试、devtools 扩展 e2e 从不录」的既有缺口；阶段 B / C 的价值门禁由 owner 于 2026-10-01 豁免（见交付阶段的排期决定）
- [x] Estimable (可估算): 阶段 A 是六个 Playwright 配置各改一行 + CI 注释同步 + 开销实测
- [ ] Small (小): 全故事不小，按 A / B / C 分阶段交付，不拆子故事文件；阶段 A 单 PR 可完成
- [x] Testable (可测试): 各阶段 AC 以 e2e / 单测 / 契约测试可复验
-->

# 用户故事：会话录制回放与失败现场数据还原

## 作为/我想要/以便

**作为** 本仓库 e2e 与 demo 应用的维护者（阶段 C 之后扩展为使用 `@aiao/rxdb` 的应用开发者）
**我想要** e2e 失败时自动留下失败那次尝试的界面现场，需要时再把失败时刻的应用数据带出来导入调试
**以便** 一次失败就有案发现场，不靠反复重跑猜测复现条件

## 现状与证据

1. **e2e 失败没有现场（阶段 A 的病灶）**：五个 web e2e 项目（`dev-rxdb-angular-e2e` / `dev-rxdb-react-e2e` /
   `dev-rxdb-vue-e2e` / `dev-rxdb-supabase-e2e` / `dev-rxdb-http-e2e`）的 `playwright.config.ts` 都是
   `trace: 'on-first-retry'` 叠 `retries: isCI ? 2 : 0`。本地没有重试，失败**从不产生 trace**；CI 上只录第一次重试——
   flaky 用例在第一次重试就通过时，留下的是那次**通过**的 trace，首次失败没有任何记录。
   [`rxdb-devtools-extension-e2e`](../../../apps/rxdb-devtools-extension-e2e/playwright.config.ts) 同样是 `retries: isCI ? 2 : 0`，
   却没设 `trace`（默认 `off`），CI 重试也不录。
   [angular 的配置](../../../apps/dev-rxdb-angular-e2e/playwright.config.ts)在 `retries` 上方的注释把本地复现的正确动作
   定为 `--retries=0 --repeat-each=N`，这条路径上同样没有 trace。
2. **界面现场不缺工具，缺配置**：Playwright 1.63 的 trace 含每个动作前后可检查的 DOM 快照、screencast、console、network
   与源码位置。`TraceMode` 的 `'retain-on-failure'` 每次尝试都录、只留失败的那次，且「A failed run's trace is kept even
   when a later retry passes」；`'retain-on-first-failure'` 只录首次尝试、失败才留（`playwright/types/test.d.ts` 的
   `TraceMode` TSDoc）。`use.trace` 也接受 `{ mode, snapshots, screenshots, sources, attachments }` 对象，可以按项关掉录制内容。
   trace 挂在 `runAfterCreateBrowserContext` 上，`browser.newContext()` 与 `launchPersistentContext()` 新建的上下文同样被录
   （读 `playwright-core` 1.63 源码确认，未实跑）：`state-isolation.spec.ts` 这类自建上下文的用例、devtools 扩展 e2e 在
   `extension.fixture.ts` 里用 `chromium.launchPersistentContext()` 建的上下文都在内。六个配置都展开 `nxE2EPreset`，产物落它的
   `outputDir`（`test-output/playwright/output`）；[`ci-template.yml`](../../../.github/workflows/ci-template.yml) 的
   「Upload Playwright artifacts」步骤以 `!cancelled()` 为条件、按 `apps/${{ matrix.project }}/test-output/playwright/**`
   上传并保留 7 天，重试后转绿的 job 也上传，不需要新通道。该步骤上方的注释写着 `on-first-retry`，随配置一起改。
3. **trace 看不到的是库里的数据**：确定性失败不需要它——spec 本身就是数据场景的构造过程，本地带 trace 重跑即得同一状态；
   重跑拿不回来的只有非确定性失败（竞态 / 时序）在失败时刻的库内容。目前没有一条「trace 看完仍要失败时刻数据才能定位」
   的失败记录；阶段 B 原以这条证据为门禁，owner 于 2026-10-01 豁免（见交付阶段的排期决定）。
4. **阶段 B 的传输限制：demo 的 adapter 实例备份不了，库本身够得着**：[US-217](../adapter/US-217-local-database-backup-restore.md)
   是 `Done`，但 wa-sqlite 与 sqlite-wasm 只交付主线程连接的备份 / 恢复（US-217 验收标准 AC#17 的说明「wa-sqlite 与 sqlite-wasm
   只交付主线程连接」）。[`RxDBAdapterSqlite.backupStorage()`](../../../packages/rxdb-adapter-sqlite-wasm/src/RxDBAdapterSqlite.ts)
   （wa-sqlite 的同名方法同构）在设了 `worker` / `workerInstance` 或 `sharedWorker` / `sharedWorkerInstance` 时返回
   `{ kind: 'unsupported', field: 'transport' }`，`backup()` / `restore()` / `cleanupIncompleteRestore()` 报
   `unsupported_combination`，由两个适配器各自的 `*-backup-transport.spec.ts` 断言；它的 TSDoc 给的理由是这两种传输「还没有实测」。
   三个 demo 的 `setup_rxdb_sqlite-wasm.ts` 只有两条分支：OPFS + dedicated Worker、IDB + SharedWorker，正是
   [US-201](../adapter/US-201-sqlite-adapter.md) 的「OPFS VFS (优先) → IDB VFS + SharedWorker (降级)」；Angular e2e 走 8200 端口强制 IDB，
   即 SharedWorker 分支，demo 自己的 adapter 实例在导出、导入两端都被拒。被拒的是传输，不是库：
   - [`buildStorageOptions()`](../../../packages/rxdb-adapter-sqlite-wasm/src/sqlite-load.utils.ts) 的 idb 档恒为
     ``useIdbStorage(`${dbName}.sqlite`, { lockPolicy, lockTimeout })``（`IDBBatchAtomicVFS`），与连接跑在主线程还是
     SharedWorker 无关（demo 的 SharedWorker 入口就是 `new SqliteClient()` 经 comlink 暴露）。同库名、`vfs: 'idb'`、不设 worker
     的主线程连接打开的是同一份 IndexedDB 库（读源码确认，未实跑），而主线程 idb 正是 US-217 交付并测过的组合。
   - 备份是经已连接 client 的逻辑转储（[`writeSqliteBackup`](../../../packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.ts)：
     按 `sqlite_schema` 列出库里全部表，结构语句与行字面量在同一个读事务内取得），不要求独占，`backup()` 的 `@throws` 里没有
     `target_busy`。归档的结构指纹取自发起备份那个实例的 `rxdb.config.entities`（`getRxDBBackupSchemaFingerprint`）。
   - SharedWorker 传输不只是没实测：一个 SharedWorker 里只有一个 `SqliteClient`，被所有标签页的端口共用，转储的读事务
     隔离不了别的标签页的语句（**推断**）。

   OPFS 的同步访问句柄只在 dedicated Worker 里可用（`FileSystemFileHandle.createSyncAccessHandle()`），OPFS 档没有主线程绕行；
   React / Vue demo 按 `checkOPFSAvailable()` 选分支，e2e 走的是这一档。US-217 的 Out of Scope 没有列传输这个缺口。

5. **数据版本控制基建已存在**：working-tree 写捕获与提交（US-305 / US-306 `Done`）；`restore({ commitId }, credentials)`
   （[US-307](../collaboration/US-307-restore-session.md) `Done`）把当前分支 HEAD 可达的历史 commit 内容作为未提交变更写回
   工作树，HEAD 不动。门面 [`WorkingTreeManager`](../../../packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts)
   只有 Promise 方法，没有 commit 生命周期事件。工作树状态全在库内的表里（working-tree 贡献的十张系统表），全库备份连同
   未提交条目一起带走。Angular demo 在空库启动时 `enableIfEmpty()`，e2e 每个用例都是新库名；除了设
   `rxdb-e2e-skip-working-tree-auto-enable` 的两个 working-tree spec，其余 spec 都不提交，失败时刻写下的数据都是未提交条目
   （按 spec 源码判断）。`dev-rxdb-angular` 的 working-tree 页已有 `listCommits` + `restore`、提交与整棵工作树 `discard()` 的界面
   （`working-tree.page.ts`，e2e `working-tree.spec.ts` 覆盖），导入归档后查看未提交条目、在 commit 之间来回不需要新界面。
6. **同一个库里的新实体默认进版本化域**：[`versioned-domain.ts`](../../../packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts)
   默认 tracked，untracked 只有三类，新增第四类须先改 [epic-006](../../epics/epic-006-working-tree-commits.md)「版本化域」
   （硬规则）。录制事件若作为普通实体写进启用了 working-tree 的库，每条事件都是一条未提交条目。插件可在 `connect()`
   之前经 `registerSystemEntities()`（[`system-entities.ts`](../../../packages/rxdb/src/system/system-entities.ts)）追加系统表，
   捕获按目标类别 `system` 跳过，working-tree 自己的十张表就走这条（读源码，未实测）。
7. **rrweb 的位置**：MIT；回放是录制 DOM 的重新渲染，**不重执行应用代码**。它在 e2e 路径上相对 trace 的增量只有
   「动作之间连续的 DOM 变化可检查」（trace 在动作之间只有 screencast 帧），目前没有需要它的失败症状，所以 rrweb 只在
   阶段 C 的应用内录制出现。

## 交付阶段

| 阶段 | 状态 | 交付                                                                                                                                                                            | 必过 AC         | 门禁                                                                                                           |
| ---- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------- |
| A    | ✅   | 六个 Playwright 配置（五个 web demo e2e + devtools 扩展 e2e）的 `trace` 改为 `retain-on-failure`；CI 注释同步                                                                   | AC#1～3         | 无前置；plan 冻结开销上限与量法，实测即 AC#3                                                                   |
| B    | ⚠️   | Angular e2e 失败现场数据归档（同库名的主线程 IDB 第二连接 `backup()`，原样导出，作为 test 附件）+ `dev-rxdb-angular` 导入入口（主线程 IDB 连接在 `connect()` 前恢复到新的空库） | AC#1～3、4～9   | 价值证据门禁已豁免（排期决定）；plan 前 spike 第二连接（技术笔记两项）2026-10-02 通过，见技术笔记的 spike 结论 |
| C    | ⚠️   | `rxdb-plugin-replay` 应用内 rrweb 录制插件 + commit 关联 + 三框架 Replayer 组件 + demo opt-in                                                                                   | AC#1～3、10～17 | 价值待证门禁（CONVENTIONS 病灶数 ≥ 抽象数）已豁免（排期决定）；三框架 parity 铁律                              |

**排期决定（owner，2026-10-01）**：A / B / C 全做，按 A → B → C 顺序交付，每个阶段单独 plan。B / C 的价值门禁豁免；B 的第二连接
spike 是可行性门禁，不豁免；三框架 parity 照旧。

AC#1～3 从阶段 A 起执行，后续每个阶段都必须继续通过：阶段 B 的失败处理不得吞掉原始失败，也不得挤掉 trace。一个 PR 只交付一个阶段。
阶段 B / C 不伪造数据侧关联：B 的数据来自真实库导出、导出前后逻辑内容不变（不补提交、不丢弃），C 的 commit 标记来自真实 commit 生命周期，都不按时间戳事后反查 commit。

## 范围边界

### In Scope

- 阶段 A：六个 Playwright 配置（五个 web demo e2e + `rxdb-devtools-extension-e2e`）切到 `retain-on-failure`；`ci-template.yml`
  里描述 trace 模式的注释同步；录制开销实测与上限冻结。
- 阶段 B：Angular e2e 共享 fixture（全部 spec 从它取 `test`，lint 禁止从 `@playwright/test` 直接取 `test`）；失败时经页内测试 API
  起同库名的主线程 IDB 第二连接并 `backup()`，原样导出，归档与摘要作为 test 附件；`dev-rxdb-angular` 导入入口：主线程 IDB 连接
  在 `connect()` 前恢复到新的空库，dev 应用按 IDB 分支打开它，之后用既有 working-tree 页查看未提交条目、在 HEAD 可达的 commit
  之间恢复。
- 阶段 C：`rxdb-plugin-replay` 的录制 / 停止 / 导出 API 与生命周期；事件流每事件一文档；commit 自定义事件与 `restore()` 联动；
  脱敏选项透传（`maskAllInputs` / `blockSelector` 等）；三框架 Replayer 组件（parity）；`dev-rxdb-angular` 的 opt-in 录制演示。

### Out of Scope

- `dev-rxdb-electron-e2e`：它的用例经 `_electron.launch()` 拉起应用，这条路不触发 `runAfterCreateBrowserContext`
  （`playwright-core` 1.63 里只有 `browser.newContext()`、`launchPersistentContext()` 与带默认上下文的 connect 三处调用，读源码确认），
  配置里的 `trace: 'on-first-retry'` 实际不生效，要录得手动开 `context.tracing`。
- `dev-rxdb-miniprogram-e2e`（`trace: 'off'`）：Playwright 只当测试运行器，miniprogram-automator 驱动微信开发者工具，没有浏览器
  上下文可录。`dev-rxdb-tauri-e2e` 跑的是 vitest，不经 Playwright。
- 阶段 B 的 React / Vue e2e 数据归档：e2e 基础设施不属于三框架绑定 API，先在 Angular 一端证实价值再对称扩展；两者的 e2e 走
  OPFS + Worker 分支，没有主线程绕行，扩展时依赖 🚧 传输故事。
- 阶段 B 归档用例自建上下文（`browser.newContext()`）里的库：只归档用例主 `page` 所在上下文的库。
- rrweb 注入 e2e fixture：trace 已覆盖界面现场；出现「trace 看不出、需要动作之间连续 DOM」的失败症状再议。
- 事件流云端上报与多端同步（`pushRepository` / HTTP / Supabase 通道）——价值待证，未来另立。
- FTS / 向量检索与 AI 会话分析——vision 阶段 6 范围，本故事只保证事件流是结构化、可被未来检索的数据。
- canvas / WebGL / iframe 保真增强与 shadow DOM 边缘场景；执行级 record-replay（浏览器引擎级确定性复现）。
- 移动端 / 小程序宿主录制。
- 压缩、采样与保留策略的完整治理——阶段 C 只承诺体积上限与超限显式报告。

## 验收标准

|   # | 阶段 | 前置条件                                                                                                      | 操作                                                                   | 预期结果                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 状态 |
| --: | :--: | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--: |
|   1 |  A   | 本地（无重试）跑 angular / react / vue 任一 demo e2e 与 `rxdb-devtools-extension-e2e`，各临时加一条必失败断言 | 查看各自的 `test-output/playwright/output`                             | 失败用例留下 `trace.zip`，`playwright show-trace` 打开后能看到失败断言前后的 DOM 快照；devtools 扩展 e2e 的 trace 来自 fixture 自建的持久上下文；通过的用例不留 trace。结论：angular 与扩展各加一个临时探针（一条必过、一条必失败），改配置前 1 passed / 1 failed 且无 `trace.zip`，改后各恰好一份 `trace.zip`，都落在必失败用例的目录里；失败断言的快照为 `after,before`；扩展 trace 含 `chrome-extension://`。最终配置（`screenshots: false`）上重核仍成立                                                                                                                                                                                                                                                                                            |  ✅  |
|   2 |  A   | CI（`retries: 2`）上一条首次失败、重试通过的用例（临时分支上在 `testInfo.retry === 0` 时断言失败制造）        | 下载该 job 的 Playwright artifact                                      | job 转绿，首次失败那次尝试的 trace 在 artifact 里；六个配置的 trace 模式都是 `retain-on-failure`。结论：run `36892293781`（headSha `881b3bf5`）里 `ci / e2e (angular)` 绿，探针首次失败、重试通过（1 flaky / 133 passed）；angular artifact 里恰好一份 `trace.zip`，在探针不带 `-retry` 后缀的首次尝试目录下，没有别的 trace；六个配置都是 `{ mode: 'retain-on-failure', screenshots: false }`。同一 run 的 `ci / gate` 红是 gate 对纯 e2e 改动的误判（`has_tests=false`），与本 AC 无关                                                                                                                                                                                                                                                                |  ✅  |
|   3 |  A   | plan 冻结的开销上限与轮数 N                                                                                   | 同机、`--retries=0`，同一 demo e2e 全量在切换前后各跑 N 轮，比墙钟时长 | 增幅不超过冻结上限。结论：plan 冻结的上限是 +10%；angular 全量实测 +36.4%（N=5）与 +37.1%（N=9），按 research D6 关掉 `screenshots` 后仍为 +32.7%（N=5，off 中位数 73.2 s、on 97.1 s，off 臂噪声 3.8%）。开销主要来自 DOM 快照与 network / console 事件，没有不破坏 AC#1 的开关。2026-10-01 用户裁决：接受开销，上限改为 +33%，保留 `screenshots: false`，按新上限判 `valid-pass`。原始记录见 `specs/003-us-909-trace-retain-on-failure/ac3-runs.tsv`                                                                                                                                                                                                                                                                                                   |  ✅  |
|   4 |  B   | 用例失败                                                                                                      | fixture 的失败处理执行完                                               | 经同库名的主线程 IDB 第二连接 `backup()`，导出前后逻辑内容不变：结构文本（`sqlite_schema.sql`）、各业务表行数与 `status()` 相等，不补提交、不丢弃（`PRAGMA schema_version` / `data_version` 不在内，见技术笔记的 spike 结论）；归档与摘要作为 test 附件出现在报告里；摘要记各业务表行数与 `status()` 的 `clean` / `entryCount` / HEAD，working-tree 未启用时记「未启用」。结论：`failure-archive.spec.ts` 写两条 Todo 后归档，`snapshot()` 前后的结构文本、业务表行数、工作树完全相等；附件 `rxdb-failure-archive`（`application/octet-stream`）字节数 = 摘要 `archive.bytes`，摘要（`application/json`）的 `tables` / `workingTree` 与 `snapshot()` 一致。自动触发由临时探针核过：失败原因仍是原断言，附件含归档、摘要与 trace，`trace.zip` 在用例目录 |  ✅  |
|   5 |  B   | 用例失败时主 `page` 已关闭或已崩溃                                                                            | 同上                                                                   | 在同一上下文新开页面导出同一库名（Angular 的隔离库名存在 `localStorage`，同上下文共享）；上下文已不可用时摘要写明原因，不导出。结论：主页面 `close()` 后与 `chrome://crash` 后摘要 `page: 'reopened'`、导出成功、`dbName` 不变；`context.close()` 后 `page: 'unavailable'`、`reason.code: 'context_unavailable'`，没有归档附件                                                                                                                                                                                                                                                                                                                                                                                                                          |  ✅  |
|   6 |  B   | 用例通过                                                                                                      | 同上                                                                   | 不导出、不留附件；Angular e2e 全部 spec 从共享 fixture 模块取 `test`，lint `no-restricted-imports` 禁止从 `@playwright/test` 直接取 `test`。结论：失败判定为 `status !== expectedStatus` 且为 `failed` / `timedOut`；`eslint.config.mjs` 的 `no-restricted-imports` 只禁 `@playwright/test` 的 `test`（类型与 `expect` 照常）。阶段 B 全量 Angular e2e 139/139 通过（墙钟 122 s），JSON 报告里 `failure-archive*.spec.ts` 以外零 `rxdb-failure-*` 附件                                                                                                                                                                                                                                                                                                  |  ✅  |
|   7 |  B   | 一份失败归档                                                                                                  | 在 `dev-rxdb-angular` 的导入入口导入                                   | 主线程 IDB 连接在 `connect()` 前恢复到新的空库，dev 应用随后打开该库；各业务表行数、工作树的 HEAD 与未提交条目数与摘要一致；归档含 HEAD 可达的历史 commit 时，先在 working-tree 页提交或丢弃未提交条目，再恢复该 commit 返回 `ok: true`。结论：`failure-archive-import.spec.ts` 两次提交加一条未提交改动后归档，在新上下文的 `/failure-archive` 导入：显示的库名 = 摘要 `dbName`，打开后业务表与工作树（HEAD、`entryCount`）= 摘要；在导入的库上丢弃未提交条目、右键 c1 恢复，进入「恢复中」且有未提交改动。同一归档再导入报 `target_not_empty`，「打开该库」打开的是同一个库。导入恢复到归档原库名（`authDomain` 约束），不是新起的名字                                                                                                                |  ✅  |
|   8 |  B   | 导出超时 / 第二连接 `connect()` 失败 / `backup()` 报 `RxDBBackupError`（`lock_timeout` / `io_error` 等）      | 触发失败处理                                                           | 按原因写进摘要，不挂死 run、不吞掉原始失败与 trace；超时值由 plan 冻结。结论：冻结值为页内截止 20 s、备份锁等待 10 s、Node 护栏 25 s、失败处理期间用例超时 +60 s。`nodeGuardMs: 1` → `transfer/timeout`，`deadlineMs: 1` → `connect/timeout`，`maxBytes: 1` → `backup/io_error`，都只留摘要附件，之后主实例仍能写入                                                                                                                                                                                                                                                                                                                                                                                                                                     |  ✅  |
|   9 |  B   | 8200 端口的 e2e 隔离（`getE2eDbName` 独立库名、强制 IDB）                                                     | 跑带归档的全量 Angular e2e                                             | 归档只含被测用例自己的库；既有 e2e DB 隔离语义不破坏。结论：摘要 `dbName` = 8200 端口 `localStorage` 的 e2e 库名键，归档 manifest `authDomain` 去掉 `@` 后缀即该库名；第二实例按同一原始库名主线程开 IDB，不碰别的库。全量 Angular e2e 139/139 通过，既有隔离语义未破坏                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |  ✅  |
|  10 |  C   | 插件挂载（`rxdb.use(...)` 后 connect）                                                                        | 调用录制 / 停止 / 导出 API                                             | scoped lifecycle 正确（inject 依赖声明）；停止时缓冲区排空，已录事件全部落库                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |  ⬜  |
|  11 |  C   | 录制期间高频交互（拖拽、连续输入），中途刷新页面                                                              | 按 sessionId + 时间范围查询事件流                                      | 每事件一文档、批量事务写入（不逐条 `save()`）；sessionId + timestamp 索引命中；事件序号跨刷新单调递增、无丢失                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |  ⬜  |
|  12 |  C   | 录制期间 working-tree 已启用                                                                                  | 录一段会话后看 `status()`                                              | 事件流写入不产生工作树条目（`entryCount` 不因录制增长）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |  ⬜  |
|  13 |  C   | 某 session 已入库                                                                                             | Replayer 跳到时刻 T                                                    | T 时刻应在的节点 / 文本出现在回放 DOM 中（用例冻结具体的 T 与断言节点）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |  ⬜  |
|  14 |  C   | 录制期间 working-tree 产生多次 commit                                                                         | 检查事件流，再在时间轴选某个 commit 恢复                               | 每次 commit 留一条携带 `commitId` 的 `EventType.Custom` 事件，顺序与 commit 一致；选中后经 `restore({ commitId }, credentials)` 返回 `ok: true`、数据与该 commit 一致；四种拒绝（`conflict` / `dirty_working_tree` / `incompatible_schema` / `unreachable_target`）各给可操作提示                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |  ⬜  |
|  15 |  C   | plan 冻结的体积上限（具体数值）                                                                               | 注入超限事件量                                                         | 按冻结策略截断并显式报告，不静默丢弃、不无限增长                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |  ⬜  |
|  16 |  C   | 配置脱敏选项                                                                                                  | 录制含敏感输入的表单                                                   | 敏感值不进事件流（`maskAllInputs` / `blockSelector` 生效）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |  ⬜  |
|  17 |  C   | 三框架宿主各自集成 Replayer 组件；`dev-rxdb-angular` 集成录制                                                 | 组件测试、parity e2e、手动录制一段会话                                 | Angular / React / Vue 同 API 同功能、无单端缺失；demo 录制 → 入库 → 回放闭环，录制默认关闭（opt-in）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |  ⬜  |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- **阶段 A 的模式：`retain-on-failure`。** 两种只留失败的模式在首次尝试上开销相同（都录），差别只在 CI 的重试：
  `retain-on-failure` 重试也录、每次失败都留；`retain-on-first-failure` 不录重试，首次失败后重试又以另一种方式失败时，第二种
  失败没有 trace。重试只跟在失败后面，多录的开销只落在失败用例上，所以取前者，代价是硬失败在 CI 上留三份 trace。本地
  `--retries=0` 下 `on-first-retry` 等于不录，AC#3 量的就是「录与不录」的差。超限时唯一的调节杆是 `screenshots`：`snapshots`
  是 AC#1 的验收内容；`sources` / `attachments` 只在保留的 trace 上收集，通过的用例不付这份开销；两种只留失败的模式首次尝试都录，
  换模式也省不下。保留期沿用既有产物通道：本地是 `outputDir`，CI 是 artifact 7 天。
- **阶段 B 的数据怎么带出来：原样导出，经第二个主线程连接。** e2e 跑在 Playwright 默认的临时浏览器上下文里，上下文关闭时
  IDB 里的库连同提交历史一起丢弃，只能在上下文关闭前导出。demo 自己的 adapter 实例走 SharedWorker，`backup()` 被拒（现状与
  证据第 4 条）；失败处理经页内测试 API（仿 [`search-demo-api.ts`](../../../packages/rxdb-test/src/testing/search-demo-api.ts) 的
  `installSearchDemoTestApi`）在同一页面起第二个 RxDB 实例：同库名、`vfs: 'idb'`、不设 worker，`connect()` 后调
  `getAdapter(name).backup(sink)`。这个 API 放在 `dev-rxdb-angular` 里：只有 Angular 一端用，不给公开包 `@aiao/rxdb-test`
  加导出与 adapter 依赖，React / Vue 扩展时再上提。第二个实例必须与 dev 应用同配置——同一份实体、迁移与插件：归档的结构指纹由
  `rxdb.config.entities` 算出，同一份列表才得出同一个指纹；`connect()` 在既有库上先过
  [`RxDB`](../../../packages/rxdb/src/RxDB.ts) 的 `#assertClaimedCapabilities`，库里记过迁移的系统能力（working-tree 等）
  本实例没挂就拒开，缺的表与迁移则会被补写进库。归档经 `page.evaluate` 分块或 `exposeBinding` 流回 Node，再 `testInfo.attach`；
  流回方式由 plan 冻结。plan 之前先 spike 两件事（都是**推断**）：
  1. 与 SharedWorker 的连接并存时，第二连接的 `connect()` 在既有库上全是空操作（系统表、迁移水位与 `migrateSystemSchema()`
     都已到位，不写库），转储拿到一致快照、不挂死（adapter 的 `idbLockPolicy` / `idbLockTimeout`）；或先关主 `page`，让
     SharedWorker 随最后一个文档退出，再在新页导出。
  2. 导入入口用主线程 IDB 连接恢复出的库，dev 应用经 IDB + SharedWorker 分支能正常打开。

  spike 不过，阶段 B 改为依赖 🚧 传输故事，由 demo 自己的 adapter 实例导出。不选的路：
  - 失败时先补一次快照提交再导出：备份是全部表的逻辑转储，工作树的未提交条目本就在归档里；补提交反而抹掉「失败时哪些改动
    还没提交」，还把 CAS 凭据、`operationId`、恢复会话中途的提交拒绝与干净工作树上的 `empty_commit` 带进失败处理。导入后要在
    commit 之间恢复，由开发者在 working-tree 页先提交或丢弃。
  - 每个 test 一份持久 profile：带不出这台机器（**推断**，未实测）。
  - 直接拷 IDB / OPFS 文件：是 [US-904](US-904-devtools-native-storage-contract.md) 已停用的热拷贝，也等于在 e2e 里复刻一份适配器的存储布局。
  - 按实体导出 JSON：带不走提交历史与工作树状态。

  **spike 结论（2026-10-02，临时 spec，已删除）**：两项都过。第二连接看到的各表行数与 `status()` 与主实例一致；e2e 库上
  `connect()` ≈1.0 s、连接加备份 ≈1.25 s，归档 ≈150 KB；第二实例销毁后主实例照常写；归档在新上下文恢复后，dev 应用经
  IDB + SharedWorker 分支打开，行数、`entryCount` 与 HEAD 一致。推断 1 的「`connect()` 全是空操作」不成立：
  [`RxDBAdapterSqliteBase`](../../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts) 每个事务都调
  `switch_transaction_id` 重写触发器，`PRAGMA schema_version` / `data_version` 随之变化（主实例自己每次写入也一样），
  结构文本与数据不变。owner 于 2026-10-02 裁决两点：
  - AC#4 的「导出前不改动库」改为逻辑不变式（结构文本、各业务表行数、`status()` 相等）。
  - 备份窗口内主实例写入偶发 `database is locked`（5 轮 1 次，主实例没有 busy 等待）：接受，在 fixture 的 TSDoc 写明。
    失败处理发生在用例体结束后，主页面通常已空闲，窗口 ≈1 s。

- **导入的口径**：恢复要求空目标，且必须在 `connect()` 之前经 `rxdb.getAdapter(name)` 调用；导入入口用主线程 `vfs: 'idb'` 连接
  恢复到一个新库名，不覆盖 dev 应用正在用的库。这个新库名就是归档的原库名：demo 实体含加密实体，归档绑定
  `authDomain = <库名>@0_1`，恢复到别的库名报 `auth_domain_mismatch`；e2e 库名带随机后缀，不会与 dev 应用的库撞。
  manifest 不带库名字段，从 `authDomain` 取。dev 应用平时走 OPFS 分支，打开导入的库走 IDB 分支（与 8200 的强制 IDB 同一条路）。
  中断的导入由 `cleanupIncompleteRestore()` 清理。
- **共享 fixture 的改动面**：`apps/dev-rxdb-angular-e2e/src` 下 27 个 spec 从 `@playwright/test` 取 `test`，各改一行 import；
  `e2e-utils.ts` / `search-test-api.ts` 只取类型与 `expect`，lint 规则只禁 `test` 这个具名导入，不影响它们。
- **调用约束**：`restore({ commitId })` 的目标必须在当前分支 HEAD 的可达父链上（US-307 FR-033），其他分支上的 commit 先
  `switchBranch`；三个 CAS 凭据（`WorkingTreeCredentials`）取自一次新鲜的 `status()`；被拒走返回值（`conflict` /
  `dirty_working_tree` / `incompatible_schema` / `unreachable_target`）。
- **阶段 C 的事件流放哪（owner 2026-10-02 冻结）**：独立录制库。插件选项注入录制库工厂（`createRecordingDb`），demo 用主线程 IDB、
  另一个 dbName；事件不进被录应用库，因而天然不产生工作树条目。
- **阶段 C 的数据模型**：每事件一行（`replay_event`，主键 `${sessionId}:${seq}`，字段 sessionId / seq / type / timestamp / data /
  bytes；索引 `(sessionId, seq)` 唯一 + `(sessionId, timestamp)`），会话一行（`replay_session`，计数与状态）。理由是追加写放大
  （内嵌大数组每追加一次就重写整文档）与按时间范围查询；高频小事件聚批走 `saveMany` 事务写入，不逐条 `save()`。详见
  `specs/005-us-909-session-replay/data-model.md`。
- **阶段 C 的体积上限（owner 2026-10-02 冻结）**：单会话 16 MiB + 总量 128 MiB，按序列化后的事件字节计，均可配置。单会话超限 →
  停止该会话录制、写一条终止标记事件、会话状态 `truncated`（code `session_limit`）；总量超限 → 拒绝开始新会话（code
  `store_limit`），`deleteSession` 释放空间；绝不自动删除。
- **阶段 C 的 commit 关联挂点（owner 2026-10-02 冻结）**：`WorkingTreeManager` 门面加只读 `commits$`，事务提交后、`commit()`
  resolve 前发 `{ commitId, branchId }`（只在确实写入新 commit 时发；幂等重放、`ok: false`、抛错都不发）；录制插件订阅它写
  rrweb 自定义事件（`EventType.Custom`）。不走实体事件总线，禁止按时间戳反查 commit 充当关联。
- **回放与还原分工**：rrweb 回放 = 观察级；`restore()` = 状态级。调试闭环是「看回放定位 → 恢复数据 → 活应用交互调试」，
  不是「在回放里复现 bug」；非确定性问题（竞态 / 随机 / 时序）不承诺复现。
- **依赖**：`rrweb@2.1.6` + `@rrweb/types@2.1.6`（MIT），钉精确版本（2.x 补丁版本发得密），不 fork 上游；新依赖过审计门禁，
  不得新增 high 漏洞。原写的 `@rrweb/record` / `@rrweb/replay` 只是以 `^2.1.6` 再导出 `rrweb`，会让精确钉版失效，故改直接依赖
  `rrweb`（plan 偏离 4）。
- **阶段 C 的三框架封装**：沿用 `code-editor` + `code-editor-angular/react/vue` 的既有分包先例。
- 新增公开 API 同步 TSDoc、API baseline、类型兼容测试与覆盖率（核心 90% / 其他 80%）。

## 实现文件

| 阶段 | 路径                                                                                                                                           | 职责                                                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| A    | `apps/dev-rxdb-{angular,react,vue,supabase,http}-e2e/playwright.config.ts`、`apps/rxdb-devtools-extension-e2e/playwright.config.ts`            | `use.trace` 切到 `retain-on-failure`                                                               |
| A    | `.github/workflows/ci-template.yml`                                                                                                            | 「Upload Playwright artifacts」上方的 trace 模式注释                                               |
| B    | `apps/dev-rxdb-angular-e2e/src/fixtures.ts`、`eslint.config.mjs`                                                                               | 共享 fixture（auto 失败归档 + `archiveFailure()`）；lint 禁止从 `@playwright/test` 取 `test`       |
| B    | `apps/dev-rxdb-angular-e2e/src/failure-archive.spec.ts`、`failure-archive-import.spec.ts`、`working-tree-utils.ts`                             | AC#4、5、8、9 的归档行为；AC#7 的导入往返；working-tree 页共用步骤                                 |
| B    | `apps/dev-rxdb-angular/src/app/rxdb/demo-rxdb-config.ts`                                                                                       | 主实例与第二实例共用的实体、插件与主线程 IDB 配置                                                  |
| B    | `apps/dev-rxdb-angular/src/app/rxdb/failure-archive.ts`、`failure-archive-api.ts`                                                              | 纯函数（原因映射、限额 sink、base64、manifest → 库名）；页内测试 API `window.__rxdbFailureArchive` |
| B    | `apps/dev-rxdb-angular/src/app/rxdb/failure-archive-import.ts`、`imported-db.ts`、`pages/failure-archive/`、`components/imported-db-banner.ts` | 导入页（读 manifest、主线程 IDB 恢复）；覆盖键与外壳提示条                                         |
| C    | `packages/rxdb-plugin-replay/`                                                                                                                 | 录制 / 存储 / 关联 / 脱敏插件包                                                                    |
| C    | `packages/rxdb-plugin-replay-angular/`、`-react/`、`-vue/`                                                                                     | 三框架 Replayer 组件（parity）                                                                     |
| C    | `apps/dev-rxdb-angular/`                                                                                                                       | opt-in 录制与回放演示                                                                              |
| C    | `requirements/api-baseline/`                                                                                                                   | 新增公开 API 基线                                                                                  |

## References

- [US-201 SQLite 适配器](../adapter/US-201-sqlite-adapter.md) — demo 的 VFS / 传输组合
- [US-217 本地数据库一致性备份与恢复](../adapter/US-217-local-database-backup-restore.md) — 阶段 B 的导出 / 导入通道，只交付主线程连接
- [US-305 提交图与 HEAD 持久化](../collaboration/US-305-commit-graph-head.md)
- [US-306 工作树与提交操作](../collaboration/US-306-working-tree-commits.md)
- [US-307 历史恢复会话](../collaboration/US-307-restore-session.md)
- [epic-006 本地工作树与提交历史](../../epics/epic-006-working-tree-commits.md) — 「版本化域」
- [dev-rxdb-angular-e2e 的 playwright.config.ts](../../../apps/dev-rxdb-angular-e2e/playwright.config.ts)
- [Playwright trace modes](https://playwright.dev/docs/test-use-options#trace-modes)
- [rrweb](https://github.com/rrweb-io/rrweb)
- [vision.md 阶段 2 生产可靠性 / 阶段 6 搜索与本地 AI](../../vision.md)
