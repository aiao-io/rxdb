---
id: US-909
title: 会话录制回放与失败现场数据还原
status: Backlog
priority: Medium
epic: epic-004-future-features
created: 2026-09-18
updated: 2026-10-01
tags: [future, replay, debugging, e2e, playwright-trace, working-tree, rrweb]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 阶段 A 无前置；阶段 B 的硬前置（🚧 Worker / SharedWorker 传输的备份恢复）与价值证据在交付阶段门禁列单独声明
- [x] Negotiable (可协商): trace 保留模式与开销上限、归档从页面流回 Node 的方式、事件流的存放位置在各阶段 plan 冻结
- [x] Valuable (有价值): 阶段 A 关闭「本地失败从不产生 trace、CI 只留第一次重试」的既有缺口；阶段 B / C 各需价值证据
- [x] Estimable (可估算): 阶段 A 是五个 Playwright 配置各改一行 + CI 注释同步 + 开销实测
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
   [angular 的配置](../../../apps/dev-rxdb-angular-e2e/playwright.config.ts)在 `retries` 上方的注释把本地复现的正确动作
   定为 `--retries=0 --repeat-each=N`，这条路径上同样没有 trace。
2. **界面现场不缺工具，缺配置**：Playwright 1.63 的 trace 含每个动作前后可检查的 DOM 快照、screencast、console、network
   与源码位置。`TraceMode` 的 `'retain-on-failure'` 每次尝试都录、只留失败的那次，且「A failed run's trace is kept even
   when a later retry passes」；`'retain-on-first-failure'` 只录首次尝试、失败才留（`playwright/types/test.d.ts` 的
   `TraceMode` TSDoc）。trace 挂在 `runAfterCreateBrowserContext` 上，`browser.newContext()` 与 `launchPersistentContext()`
   新建的上下文同样被录（读 `playwright-core` 1.63 源码确认，未实跑），`state-isolation.spec.ts` 这类自建上下文的用例也在内。
   产物落 `nxE2EPreset` 的 `outputDir`（`test-output/playwright/output`）；[`ci-template.yml`](../../../.github/workflows/ci-template.yml)
   的「Upload Playwright artifacts」步骤已按 `apps/${{ matrix.project }}/test-output/playwright/**` 上传、保留 7 天，
   不需要新通道。该步骤上方的注释写着 `on-first-retry`，随配置一起改。
3. **trace 看不到的是库里的数据**：确定性失败不需要它——spec 本身就是数据场景的构造过程，本地带 trace 重跑即得同一状态；
   重跑拿不回来的只有非确定性失败（竞态 / 时序）在失败时刻的库内容。目前没有一条「trace 看完仍要失败时刻数据才能定位」
   的失败记录，阶段 B 因此以价值证据为门禁。
4. **阶段 B 的硬阻塞：demo 用的传输组合备份不了**：[US-217](../adapter/US-217-local-database-backup-restore.md) 是 `Done`，
   但 wa-sqlite 与 sqlite-wasm 只交付主线程连接的备份 / 恢复（US-217 验收标准 AC#17 的说明「wa-sqlite 与 sqlite-wasm
   只交付主线程连接」）。[`RxDBAdapterSqlite.backupStorage()`](../../../packages/rxdb-adapter-sqlite-wasm/src/RxDBAdapterSqlite.ts)
   （wa-sqlite 的同名方法同构）在设了 `worker` / `workerInstance` 或 `sharedWorker` / `sharedWorkerInstance` 时返回
   `{ kind: 'unsupported', field: 'transport' }`，`backup()` / `restore()` / `cleanupIncompleteRestore()` 报
   `unsupported_combination`，由两个适配器各自的 `*-backup-transport.spec.ts` 断言。三个 demo 的 `setup_rxdb_sqlite-wasm.ts`
   只有两条分支：OPFS + dedicated Worker、IDB + SharedWorker，正是 [US-201](../adapter/US-201-sqlite-adapter.md) 的标准配置
   「OPFS 优先 → IDB + SharedWorker 降级」，两条都在拒绝范围内；Angular e2e 走 8200 端口强制 IDB，即 SharedWorker 分支。
   失败现场的导出与 dev 应用的导入两端都卡在这里。OPFS 的同步访问句柄只在 Worker 里可用，主线程连接绕不开 OPFS 这一档
   （**推断**）。US-217 的 Out of Scope 没有列这个缺口。
5. **数据版本控制基建已存在**：working-tree 写捕获与提交（US-305 / US-306 `Done`）；`restore({ commitId }, credentials)`
   （[US-307](../collaboration/US-307-restore-session.md) `Done`）把当前分支 HEAD 可达的历史 commit 内容作为未提交变更写回
   工作树，HEAD 不动。门面 [`WorkingTreeManager`](../../../packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts)
   只有 Promise 方法，没有 commit 生命周期事件；[`commitWorkingTree()`](../../../packages/rxdb-plugin-working-tree/src/working-tree/commit-command.ts)
   在干净工作树上抛 `CommitValidationError('empty_commit')`，不产生空提交。`dev-rxdb-angular` 的 working-tree 页已有
   `listCommits` + `restore` 的界面（`working-tree.page.ts`，e2e `working-tree.spec.ts` 覆盖），导入归档后在 commit 之间
   来回不需要新界面。
6. **同一个库里的新实体默认进版本化域**：[`versioned-domain.ts`](../../../packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts)
   默认 tracked，untracked 只有三类，新增第四类须先改 [epic-006](../../epics/epic-006-working-tree-commits.md)「版本化域」
   （硬规则）。录制事件若作为普通实体写进启用了 working-tree 的库，每条事件都是一条未提交条目。插件可在 `connect()`
   之前经 `registerSystemEntities()`（[`system-entities.ts`](../../../packages/rxdb/src/system/system-entities.ts)）追加系统表，
   捕获按目标类别 `system` 跳过，working-tree 自己的十张表就走这条（读源码，未实测）。
7. **rrweb 的位置**：MIT；回放是录制 DOM 的重新渲染，**不重执行应用代码**。它在 e2e 路径上相对 trace 的增量只有
   「动作之间连续的 DOM 变化可检查」（trace 在动作之间只有 screencast 帧），目前没有需要它的失败症状，所以 rrweb 只在
   阶段 C 的应用内录制出现。

## 交付阶段

| 阶段 | 状态 | 交付                                                                                                                                                                    | 必过 AC         | 门禁                                                                                                                                                                               |
| ---- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A    | ⬜   | 五个 web e2e 配置的 `trace` 改为只留失败尝试（`retain-on-failure` 或 `retain-on-first-failure`，plan 按实测开销选）；CI 注释同步                                        | AC#1～3         | 无前置；plan 实测开销并冻结上限                                                                                                                                                    |
| B    | ⬜   | Angular e2e 失败现场数据归档（工作树有未提交条目则先补失败快照提交 → `adapter.backup()` → 作为 test 附件）+ `dev-rxdb-angular` 导入入口（`connect()` 前恢复到新的空库） | AC#1～3、4～9   | 🚧 wa-sqlite / sqlite-wasm Worker / SharedWorker 传输的备份恢复（无故事文件）；价值证据：记录到至少一次「trace 看完仍需失败时刻数据才能定位」的真实 e2e 失败，写进本文件现状与证据 |
| C    | ⬜   | `rxdb-plugin-replay` 应用内 rrweb 录制插件 + commit 关联 + 三框架 Replayer 组件 + demo opt-in                                                                           | AC#1～3、10～17 | 价值待证：须写出「今天用户踩得到的具体症状」才允许排期（CONVENTIONS 病灶数 ≥ 抽象数）；三框架 parity 铁律                                                                          |

AC#1～3 从阶段 A 起执行，后续每个阶段都必须继续通过：阶段 B 的失败处理不得吞掉原始失败，也不得挤掉 trace。一个 PR 只交付一个阶段。
阶段 B / C 不伪造数据侧关联：B 的数据来自真实库导出，C 的 commit 标记来自真实 commit 生命周期，都不按时间戳事后反查 commit。

## 范围边界

### In Scope

- 阶段 A：五个 web e2e 配置切换 trace 保留模式；`ci-template.yml` 里描述 trace 模式的注释同步；两种保留模式的开销实测与上限冻结。
- 阶段 B：Angular e2e 共享 fixture（全部 spec 从它取 `test`，lint 禁止从 `@playwright/test` 直接取 `test`）；失败时经页内测试 API
  补快照提交并 `adapter.backup()`，归档与摘要作为 test 附件；`dev-rxdb-angular` 导入入口：`connect()` 前恢复到新的空库，
  之后用既有 working-tree 页在 HEAD 可达的 commit 之间恢复。
- 阶段 C：`rxdb-plugin-replay` 的录制 / 停止 / 导出 API 与生命周期；事件流每事件一文档；commit 自定义事件与 `restore()` 联动；
  脱敏选项透传（`maskAllInputs` / `blockSelector` 等）；三框架 Replayer 组件（parity）；`dev-rxdb-angular` 的 opt-in 录制演示。

### Out of Scope

- `dev-rxdb-electron-e2e`：它的用例经 `_electron.launch()` 拉起应用，这条路不触发 `runAfterCreateBrowserContext`
  （`playwright-core` 1.63 里只有 `browser.newContext()`、`launchPersistentContext()` 与带默认上下文的 connect 三处调用，读源码确认），
  `use.trace` 管不到，要录得手动开 `context.tracing`。`rxdb-devtools-extension-e2e`（未设 `trace`）与
  `dev-rxdb-miniprogram-e2e`（`trace: 'off'`）维持现状。
- 阶段 B 的 React / Vue e2e 数据归档：e2e 基础设施不属于三框架绑定 API，先在 Angular 一端证实价值再对称扩展。
- 阶段 B 归档用例自建上下文（`browser.newContext()`）里的库：只归档用例主 `page` 所在上下文的库。
- rrweb 注入 e2e fixture：trace 已覆盖界面现场；出现「trace 看不出、需要动作之间连续 DOM」的失败症状再议。
- 事件流云端上报与多端同步（`pushRepository` / HTTP / Supabase 通道）——价值待证，未来另立。
- FTS / 向量检索与 AI 会话分析——vision 阶段 6 范围，本故事只保证事件流是结构化、可被未来检索的数据。
- canvas / WebGL / iframe 保真增强与 shadow DOM 边缘场景；执行级 record-replay（浏览器引擎级确定性复现）。
- 移动端 / 小程序宿主录制。
- 压缩、采样与保留策略的完整治理——阶段 C 只承诺体积上限与超限显式报告。

## 验收标准

|   # | 阶段 | 前置条件                                                                   | 操作                                                                   | 预期结果                                                                                                                                                                                                                                                                          | 状态 |
| --: | :--: | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--: |
|   1 |  A   | 本地（无重试）跑 angular / react / vue 任一 demo e2e，临时加一条必失败断言 | 查看 `test-output/playwright/output`                                   | 失败用例留下 `trace.zip`，`playwright show-trace` 打开后能看到失败断言前后的 DOM 快照；通过的用例不留 trace                                                                                                                                                                       |  ⬜  |
|   2 |  A   | CI（`retries: 2`）上一条首次失败的用例（可在临时分支上用必失败断言制造）   | 下载该 job 的 Playwright artifact                                      | 首次失败那次尝试的 trace 在 artifact 里，之后重试通过也不丢；五个 web e2e 配置都不再出现 `on-first-retry`                                                                                                                                                                         |  ⬜  |
|   3 |  A   | plan 冻结的开销上限与轮数 N                                                | 同机、`--retries=0`，同一 demo e2e 全量在切换前后各跑 N 轮，比墙钟时长 | 增幅不超过冻结上限                                                                                                                                                                                                                                                                |  ⬜  |
|   4 |  B   | 用例失败，失败时工作树有未提交条目（`status().clean === false`）           | fixture 的失败处理执行完                                               | 先补一次标成失败快照的提交，再 `adapter.backup()`；归档与摘要作为 test 附件出现在报告里；归档里的 HEAD 是该快照提交                                                                                                                                                               |  ⬜  |
|   5 |  B   | 用例失败，失败时工作树干净 / 未启用 / 快照提交被拒                         | 同上                                                                   | 干净：不提交，HEAD 即失败时刻状态；未启用（`rxdb-e2e-skip-working-tree-auto-enable` 且未手动启用）：只导出；提交被拒：原因写进摘要后照常导出，不退回失败前的最后一个 commit                                                                                                       |  ⬜  |
|   6 |  B   | 用例通过                                                                   | 同上                                                                   | 不导出、不留附件；Angular e2e 全部 spec 从共享 fixture 模块取 `test`，lint `no-restricted-imports` 禁止从 `@playwright/test` 直接取 `test`                                                                                                                                        |  ⬜  |
|   7 |  B   | 一份失败归档                                                               | 在 `dev-rxdb-angular` 的导入入口导入                                   | `connect()` 前恢复到新的空库；各业务表行数与摘要一致；`listCommits` 完整、HEAD 与归档一致；在 working-tree 页恢复任一 HEAD 可达的历史 commit 返回 `ok: true`                                                                                                                      |  ⬜  |
|   8 |  B   | 导出超时 / `unsupported_combination` / `lock_timeout` / `target_busy`      | 触发失败处理                                                           | 按原因写进摘要，不挂死 run、不吞掉原始失败与 trace；超时值由 plan 冻结                                                                                                                                                                                                            |  ⬜  |
|   9 |  B   | 8200 端口的 e2e 隔离（`getE2eDbName` 独立库名、强制 IDB）                  | 跑带归档的全量 Angular e2e                                             | 归档只含被测用例自己的库；既有 e2e DB 隔离语义不破坏                                                                                                                                                                                                                              |  ⬜  |
|  10 |  C   | 插件挂载（`rxdb.use(...)` 后 connect）                                     | 调用录制 / 停止 / 导出 API                                             | scoped lifecycle 正确（inject 依赖声明）；停止时缓冲区排空，已录事件全部落库                                                                                                                                                                                                      |  ⬜  |
|  11 |  C   | 录制期间高频交互（拖拽、连续输入），中途刷新页面                           | 按 sessionId + 时间范围查询事件流                                      | 每事件一文档、批量事务写入（不逐条 `save()`）；sessionId + timestamp 索引命中；事件序号跨刷新单调递增、无丢失                                                                                                                                                                     |  ⬜  |
|  12 |  C   | 录制期间 working-tree 已启用                                               | 录一段会话后看 `status()`                                              | 事件流写入不产生工作树条目（`entryCount` 不因录制增长）                                                                                                                                                                                                                           |  ⬜  |
|  13 |  C   | 某 session 已入库                                                          | Replayer 跳到时刻 T                                                    | T 时刻应在的节点 / 文本出现在回放 DOM 中（用例冻结具体的 T 与断言节点）                                                                                                                                                                                                           |  ⬜  |
|  14 |  C   | 录制期间 working-tree 产生多次 commit                                      | 检查事件流，再在时间轴选某个 commit 恢复                               | 每次 commit 留一条携带 `commitId` 的 `EventType.Custom` 事件，顺序与 commit 一致；选中后经 `restore({ commitId }, credentials)` 返回 `ok: true`、数据与该 commit 一致；四种拒绝（`conflict` / `dirty_working_tree` / `incompatible_schema` / `unreachable_target`）各给可操作提示 |  ⬜  |
|  15 |  C   | plan 冻结的体积上限（具体数值）                                            | 注入超限事件量                                                         | 按冻结策略截断并显式报告，不静默丢弃、不无限增长                                                                                                                                                                                                                                  |  ⬜  |
|  16 |  C   | 配置脱敏选项                                                               | 录制含敏感输入的表单                                                   | 敏感值不进事件流（`maskAllInputs` / `blockSelector` 生效）                                                                                                                                                                                                                        |  ⬜  |
|  17 |  C   | 三框架宿主各自集成 Replayer 组件；`dev-rxdb-angular` 集成录制              | 组件测试、parity e2e、手动录制一段会话                                 | Angular / React / Vue 同 API 同功能、无单端缺失；demo 录制 → 入库 → 回放闭环，录制默认关闭（opt-in）                                                                                                                                                                              |  ⬜  |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- **阶段 A 的模式选择**：本地两种模式等价（本地没有重试）。CI 上 `retain-on-failure` 每次尝试都录，硬失败留三份；
  `retain-on-first-failure` 只录首次尝试，重试不付录制开销。AC#2 只要求首次失败有 trace，两者都满足，plan 按 AC#3 的实测选。
  保留期沿用既有产物通道：本地是 `outputDir`，CI 是 artifact 7 天。
- **阶段 B 的数据怎么带出来：导出，不用持久上下文。** e2e 跑在 Playwright 默认的临时浏览器上下文里，上下文关闭时 IDB 里的库
  连同提交历史一起丢弃；`restore({ commitId })` 只能在持有同一份提交历史的库上调用。失败处理经页内测试 API（仿
  [`search-demo-api.ts`](../../../packages/rxdb-test/src/testing/search-demo-api.ts) 的 `installSearchDemoTestApi`）调
  `adapter.backup()`，归档经 `page.evaluate` 分块或 `exposeBinding` 流回 Node，再 `testInfo.attach`；流回方式由 plan 冻结。
  不选的路：
  - 每个 test 一份持久 profile：带不出这台机器（**推断**，未实测）。
  - 直接拷 IDB / OPFS 文件：是 [US-904](US-904-devtools-native-storage-contract.md) 已停用的热拷贝，也等于在 e2e 里复刻一份适配器的存储布局。
  - 按实体导出 JSON：带不走提交历史。
  - 关页后在同源新页面用主线程 IDB 连接备份同一个库名：依赖 SharedWorker 与主线程两种传输的存储布局一致（**推断**，未实测），
    且把一次失败处理变成第二次应用启动。
- **快照提交的口径**：`status().clean === false` 才补提交（干净时 `commit()` 抛 `empty_commit`）。提交后工作树干净，导入后的
  `restore()` 不撞 `dirty_working_tree`，失败时刻的全部数据都在 HEAD 里。三个 CAS 凭据取自一次新鲜的 `status()`；`authorId` /
  `operationId` 的取值由 plan 冻结（同一次失败处理的重试必须带同一个 `operationId`）。失败发生在恢复会话中途
  （`status().restoring` / `conflicted`）时提交是否被接受，由 plan 实测。
- **导入的口径**：恢复要求空目标，且必须在 `connect()` 之前经 `rxdb.getAdapter(name)` 调用；导入入口用一个新库名，不覆盖 dev
  应用正在用的库。中断的导入由 `cleanupIncompleteRestore()` 清理。
- **调用约束**：`restore({ commitId })` 的目标必须在当前分支 HEAD 的可达父链上（US-307 FR-033），其他分支上的 commit 先
  `switchBranch`；三个 CAS 凭据（`WorkingTreeCredentials`）取自一次新鲜的 `status()`；被拒走返回值（`conflict` /
  `dirty_working_tree` / `incompatible_schema` / `unreachable_target`）。
- **阶段 C 的事件流放哪**：候选一是经 `registerSystemEntities()` 登记为系统表，不进版本化域（现状与证据第 6 条）；候选二是独立的
  录制库。新增 untracked 类须先改 epic-006，不在候选内。plan 冻结。
- **阶段 C 的数据模型**：每事件一文档，字段（plan 冻结）：sessionId / 序号 / type / timestamp / payload；复合索引
  sessionId + timestamp。理由是追加写放大（内嵌大数组每追加一次就重写整文档）与按时间范围查询；同步冲突按整文档 LWW 处理
  （[`LWWConflictResolver`](../../../packages/rxdb/src/sync-contract/LWWConflictResolver.ts)）只在事件流进入同步时相关，同步不在范围内。
  高频小事件聚批走 `saveMany` 事务写入，不逐条 `save()`。
- **阶段 C 的 commit 关联挂点**：rrweb 自定义事件（`EventType.Custom`）携带 `commitId`，写入时机挂 commit 生命周期。门面没有
  commit 事件；候选挂点是实体事件总线订阅（仿 [`rxdb-plugin-search` 的 `ENTITY_LOCAL_*_EVENT` 增量索引模式](../../../packages/rxdb-plugin-search/src/plugin.ts)），
  commit 行经 `saveMany` 写入时是否发该事件未验证，plan 冻结。禁止按时间戳反查 commit 充当关联。
- **回放与还原分工**：rrweb 回放 = 观察级；`restore()` = 状态级。调试闭环是「看回放定位 → 恢复数据 → 活应用交互调试」，
  不是「在回放里复现 bug」；非确定性问题（竞态 / 随机 / 时序）不承诺复现。
- **依赖**：`rrweb` / `@rrweb/record` / `@rrweb/replay`（MIT），钉精确版本（2.x 补丁版本发得密），不 fork 上游；新依赖过审计门禁，
  不得新增 high 漏洞。
- **阶段 C 的三框架封装**：沿用 `code-editor` + `code-editor-angular/react/vue` 的既有分包先例。
- 新增公开 API 同步 TSDoc、API baseline、类型兼容测试与覆盖率（核心 90% / 其他 80%）。

## 实现文件

| 阶段 | 路径                                                                       | 职责                                                  |
| ---- | -------------------------------------------------------------------------- | ----------------------------------------------------- |
| A    | `apps/dev-rxdb-{angular,react,vue,supabase,http}-e2e/playwright.config.ts` | `use.trace` 切换保留模式                              |
| A    | `.github/workflows/ci-template.yml`                                        | 「Upload Playwright artifacts」上方的 trace 模式注释  |
| B    | `apps/dev-rxdb-angular-e2e/`                                               | 共享 fixture、失败处理与归档附件、lint 守卫           |
| B    | `packages/rxdb-test/src/testing/`                                          | 页内测试 API（快照提交 + 备份），仿 `search-demo-api` |
| B    | `apps/dev-rxdb-angular/`                                                   | 安装页内测试 API；导入入口                            |
| C    | `packages/rxdb-plugin-replay/`                                             | 录制 / 存储 / 关联 / 脱敏插件包                       |
| C    | `packages/rxdb-plugin-replay-angular/`、`-react/`、`-vue/`                 | 三框架 Replayer 组件（parity）                        |
| C    | `apps/dev-rxdb-angular/`                                                   | opt-in 录制与回放演示                                 |
| C    | `requirements/api-baseline/`                                               | 新增公开 API 基线                                     |

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
