# 状态概览

> **真相源**：每个 story 的 YAML `status` 字段。本文件是派生视图，**不要**作为查询当前状态的唯一依据；如发现与 YAML 不一致，请优先信任 YAML 并修复本文件。
>
> 本文件**只回答「什么状态」**。排期与约束 → [roadmap.md](roadmap.md)；能力与覆盖缺口 → [capability-matrix.md](capability-matrix.md)；发布 → [release-plan.md](release-plan.md)。

## 状态汇总

| 状态           | 数量 |
| :------------- | :--- |
| ✅ Done        | 54   |
| 🚧 In Progress | 2    |
| 👀 In Review   | 1    |
| 📝 Backlog     | 5    |
| 🚫 Blocked     | 0    |
| **合计**       | 62   |

> 数字由 `grep -h "^status:" requirements/stories/*/US-*.md | sort | uniq -c` 推导，**请勿手写维护**；
> 合计等于 `stories/*/US-*.md` 里带 `status:` frontmatter 的文件数（63 个文件 − 1 个 [US-904 阶段 A 可行性记录](stories/future/US-904-phase-a-evidence.md)，那是证据留档不是故事）。`🚫 Blocked = 0` 只统计 YAML 显式 `status: Blocked`，不代表没有前置阻塞——见下方[前置阻塞](#前置阻塞不体现在-blocked-计数里)。

图例：✅ Done · 🚧 In Progress · 👀 In Review · ⬜ Backlog · 🚫 Blocked

## 进行中（2 条）

| Story                                                                                         | 还剩什么                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [US-904 DevTools 原生本地存储调试](stories/future/US-904-devtools-native-storage-contract.md) | 阶段 A ✅、阶段 B ✅；阶段 C 主体已交付（C1 面板抽取 AC#31/32/33/35 ✅、C2 四段 relay v2 迁移 AC#36/37/41/43 ✅，AC#40/#44 ⚠️ 部分，AC#34/#38/#39/#42 ⬜ 待人工浏览器回归与跨版本实证）；阶段 D 已开工并基本落地——AC#48/#50/#52/#53 ✅（AC#52 真实全链路 E2E 于 2026-09-03 真机跑通），AC#45/46/47/49/51 ⚠️（provider/单测侧已关，E2E 侧待补）                                                                                                                                                                                        |
| [US-905 Tauri DevTools 调试窗口](stories/future/US-905-tauri-native-devtools.md)              | 阶段 1（AC#1～#8）已基本落地：2 条 ✅（#7 conformance 80 断言、#8 e2e project 归属）、6 条 ⚠️。⚠️ 的判据都含「真实 Tauri 窗口 / 真实构建产物」那一半——本机能出真产物（tauri-cli 2.11.4，`tauri-package-release` 热跑 20s），缺的是驱动两个真实 WebView 的 harness。阶段 1 的代码侧收尾已做完（2026-09-01）：VFS 映射已接进运行时、面板版本取自 `tauri.conf.json`、`desktop-smoke` metadata 补记 release 隔离 spec。阶段 2（AC#9～#17）未开工——US-505 已于 2026-09-01 关闭，前置故事已齐，剩下的是阶段 1 那 6 条所需的 WebView harness |

## 待评审（1 条）

| Story                                                                            | 收尾条件                                                                                                                                                                                  |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [US-015 插件依赖声明与按需装卸](stories/core/US-015-plugin-inject-dependency.md) | 阶段 A 已交付；阶段 B 已移出承诺范围，**解锁条件 = 出现第一个 `plugin:*` 依赖声明**。其余未关闭故事没有一条会产生 `plugin:*` 消费方，故 `In Review` 是稳态而非过渡态，未解锁前不置 `Done` |

## 已取消

**跨 realm writer lease 与迁移 fencing（原 US-304）已取消**，故事与实现代码一并删除。
系统迁移的排他性由后端排他锁（`BEGIN EXCLUSIVE` / 表锁）与单事务提交承担，见
[US-303](stories/collaboration/US-303-bigint-binary-change-codec.md) 的 AC13 说明；跨 realm 的旧客户端
拦截由发布门禁（[release-plan.md](release-plan.md)）承担。这不解除 US-305 的前置——它仍需一次真实迁移发布，见下方[前置阻塞](#前置阻塞不体现在-blocked-计数里)。

## 按 Epic 索引

### [核心 MVP](epics/epic-001-core-mvp.md)

- ✅ [US-001 定义数据模型](stories/core/US-001-model-definition.md)
- ✅ [US-002 客户端代码生成](stories/core/US-002-client-generation.md)
- ✅ [US-003 数据查询](stories/core/US-003-data-query.md)
- ✅ [US-004 数据变更](stories/core/US-004-data-mutation.md)
- ✅ [US-005 关系映射](stories/core/US-005-relationship-mapping.md)
- ✅ [US-006 响应式查询](stories/core/US-006-reactive-queries.md)
- ✅ [US-007 变更追踪](stories/core/US-007-change-tracking.md)
- ✅ [US-008 事务支持](stories/core/US-008-transaction-support.md)
- ✅ [US-009 跨 Tab 同步](stories/core/US-009-cross-tab-sync.md)
- ✅ [US-010 树形数据结构](stories/core/US-010-tree-entity.md)
- ✅ [US-101 Angular 集成](stories/framework/US-101-angular-integration.md)
- ✅ [US-102 React 集成](stories/framework/US-102-react-integration.md)
- ✅ [US-103 Vue 集成](stories/framework/US-103-vue-integration.md)
- ✅ [US-201 SQLite 适配器](stories/adapter/US-201-sqlite-adapter.md)
- ✅ [US-202 PGlite 适配器](stories/adapter/US-202-pglite-adapter.md)
- ✅ [US-204 SQLite WASM 适配器](stories/adapter/US-204-sqlite-wasm-adapter.md)
- ✅ [US-205 SQLiteAI 适配器](stories/adapter/US-205-sqliteai-adapter.md)
- ✅ [US-501 Workspace 插件](stories/plugin/US-501-workspace-plugin.md)
- ✅ [US-502 Storage 插件](stories/plugin/US-502-storage-plugin.md)
- ✅ [US-503 图数据插件](stories/plugin/US-503-graph-data.md)

### [数据同步与协作](epics/epic-002-data-sync.md)

- ✅ [US-301 版本控制](stories/collaboration/US-301-version-control.md)
- ✅ [US-302 撤销/重做](stories/collaboration/US-302-undo-redo.md)
- ✅ [US-203 Supabase 适配器](stories/adapter/US-203-supabase-adapter.md)
- ✅ [US-803 本地数据加密](stories/future/US-803-local-encryption.md)

> 原挂在本 Epic 下的 US-305 已升级为 [epic-006](epics/epic-006-working-tree-commits.md)。

### [UI 与开发者工具](epics/epic-003-ui-developer-tools.md)

- ✅ [US-402 代码编辑器](stories/ui/US-402-code-editor.md)
- ✅ [US-902 DevTools 面板](stories/future/US-902-devtools-panel.md)
- 🚧 [US-904 DevTools 原生本地存储调试](stories/future/US-904-devtools-native-storage-contract.md)
  - ✅ 阶段 A Electron 43 MV3 可行性门禁（`decision: supported`）
  - ✅ 阶段 B v2 协议（控制面 + provider 数据面）
  - 🚧 阶段 C 共享面板 library 与 Chrome v2 迁移
    - ✅ C1 行为中性抽取 → `modules/rxdb-devtools-panel/`（AC#31/32/33/35；AC#34 待人工浏览器回归）
    - 🚧 C2 四段 relay 与 v2 切换（AC#36/37/41/43 ✅；AC#40/#44 ⚠️ 部分；AC#38/#39/#42 ⬜ 需跨版本产物与真实 service worker）
  - 🚧 阶段 D Electron 原生存储集成（AC#48/#50/#52/#53 ✅；AC#45/46/47/49/51 ⚠️ provider/单测侧已关、E2E 侧待补）
- 🚧 [US-905 Tauri DevTools 调试窗口](stories/future/US-905-tauri-native-devtools.md) — 阶段 1（AC#1～#8）已落地且代码侧收尾已做完：AC#7/#8 ✅，其余 6 条 ⚠️ 只差「真实 Tauri 窗口/产物」那一半；阶段 2（AC#9～#17）未开工，前置 US-210 + US-505 均已 Done

> US-401 / US-701 查询构建器系列不在本仓库范围内。

### [未来功能](epics/epic-004-future-features.md)

- ✅ [US-702 全文搜索](stories/future/US-702-full-text-search.md)
- ✅ [US-209 微信小程序 wa-sqlite 适配器](stories/adapter/US-209-miniprogram-adapter.md) — 实验性，仅微信逻辑层
- ⬜ [US-211 多端小程序宿主](stories/adapter/US-211-multi-miniprogram-platforms.md) — 阶段 A 抽 host + 可行性矩阵；B/C 按门禁放行支付宝 / 抖音 / 百度 / QQ
- ✅ [US-504 Electron 本地文件存储](stories/plugin/US-504-electron-local-file-storage.md)
- ✅ [US-207 Electron 连接本地 SQLite 文件](stories/adapter/US-207-desktop-local-database.md)
- ✅ [US-210 Tauri 连接应用作用域 SQLite 文件](stories/adapter/US-210-tauri-sqlite-local-database.md)
- ✅ [US-505 Tauri 本地文件存储](stories/plugin/US-505-tauri-local-file-storage.md) — US-504 的 Tauri 半边；AC#6/#7 随 2026-09-01 的三 OS 矩阵跑绿关闭
- ✅ [US-208 Electron PGlite 数据目录与事务宿主](stories/adapter/US-208-electron-pglite-data-directory.md) — 已按冻结的「IPC 事务 ID 协议」实现；AC#10 随同一跑关闭
- ✅ [US-703 PGlite 全文搜索](stories/future/US-703-pglite-full-text-search.md)
- ✅ [US-020 将 QueryCache 接入统一 Repository](stories/core/US-020-querycache-repository.md)
- ✅ [US-212 HTTP 远程适配器](stories/adapter/US-212-http-adapter.md)
- ✅ [US-213 HTTP 适配器 wire 级集成测试](stories/adapter/US-213-http-wire-integration-test.md)
- ✅ [US-214 HTTP 适配器浏览器端到端 demo](stories/adapter/US-214-http-browser-demo.md)
- ✅ [US-021 QueryCache 远端适配器缺席时配置期 fail-fast](stories/core/US-021-querycache-adapter-fail-fast.md)
- ✅ [US-022 QueryCache 远端行的列契约与缺列诊断](stories/core/US-022-querycache-remote-row-contract.md)
- ✅ [US-023 QueryCache 远端变更的失效上报口与实时同步](stories/core/US-023-querycache-remote-invalidation.md)
- ✅ [US-215 条件请求被静默停用时给出可观测信号](stories/adapter/US-215-conditional-request-silence.md)
- ✅ [US-216 参考后端以 RxDB 引擎实现](stories/adapter/US-216-server-side-rxdb.md) — 后端初始化 RxDB（pglite），协议端点改由 Repository/EntityManager 实现，前后端共享 schema 模块；单类收敛依赖另立的 core sync 覆盖故事

### [类型系统演进](epics/epic-005-type-system-evolution.md)

**八条故事已全部 Done，但 epic 仍是 `In Progress`——这是有意的。** 发布门禁有 6 条，条件 1（五条 bigint/binary 故事全 Done）已成立，条件 2～6 是发布动作与回归 gate，需要一次独立审计逐条留证后才能置 `Done`。故事清单全绿 ≠ 门禁成立。

- ✅ [US-011 定义 bigint 与 binary 类型及公共 API 契约](stories/core/US-011-property-type-bigint-binary.md)
- ✅ [US-206 本地适配器持久化与查询 bigint/binary](stories/adapter/US-206-bigint-binary-adapter.md)
- ✅ [US-303 bigint/binary change codec 与系统迁移](stories/collaboration/US-303-bigint-binary-change-codec.md)
- ✅ [US-804 加密字段支持 bigint/binary](stories/future/US-804-bigint-binary-encryption.md)
- ✅ [US-903 DevTools 展示 bigint/binary](stories/future/US-903-bigint-binary-devtools.md)
- ✅ [US-012 扩展字段语义与前端通信契约](stories/core/US-012-field-semantic-metadata.md)
- ✅ [US-019 拒绝重复声明的 URL scheme](stories/core/US-019-url-scheme-duplicate-rejection.md)
- ✅ [US-018 生成器元数据序列化管线与 default 语义](stories/core/US-018-generator-default-serialization.md) — `BREAKING CHANGE`，发布侧约束见 [roadmap 约束 12](roadmap.md#排期约束)

### [本地工作树与提交历史](epics/epic-006-working-tree-commits.md)

全部 ⬜ Backlog。**不得因分支名或 spec 已齐而把任一条标成 In Progress**（`specs/001-working-tree-commits/` 已有 spec / plan / data-model / research / quickstart / contracts，但**没有 `tasks.md`，运行时未开工**）。交付顺序 **新 bridge 发布（FR-030）→ US-305 → US-306 阶段 A → B → C →（US-307 ∥ US-308）**。排期上整链（含桥接发布）位于 [roadmap 批次 4](roadmap.md#批次-4epic-006-链整体压后)、排在所有其他批次之后。

- ⬜ [US-305 提交图与 HEAD 持久化](stories/collaboration/US-305-commit-graph-head.md) — 仍被 FR-030 挡住（`migration-release.json` 的 `bridge.tag`/`bridge.version` 为 `null`）
- ⬜ [US-306 工作树与提交操作](stories/collaboration/US-306-working-tree-commits.md)
  - ⬜ 阶段 A 工作树写入捕获与持久化
  - ⬜ 阶段 B 提交状态机（status / diff / commit / discard，无暂存区）
  - ⬜ 阶段 C 三框架工作树交互面与性能门禁
- ⬜ [US-307 历史恢复会话](stories/collaboration/US-307-restore-session.md) — 依赖 US-306 阶段 B
- ⬜ [US-308 分支隔离与跨 realm 冲突检测](stories/collaboration/US-308-branch-isolation-conflict.md) — 依赖 US-306 阶段 B

### [公开 API 门禁](epics/epic-007-public-api-gates.md)

- ✅ [US-601 子路径入口纳入 API 表面基线](stories/tooling/US-601-subpath-api-surface-baseline.md)

### [生命周期作用域](epics/epic-008-lifecycle-scope.md)

**Epic 已置 `Done`。** US-013 → US-014 的硬序已随两条交付解除。

- ✅ [US-013 LifecycleScope 生命周期作用域原语](stories/core/US-013-lifecycle-scope-primitive.md) — `@aiao/utils` 侧的原语；只交付原语，不迁移任何调用方
- ✅ [US-014 插件作用域契约](stories/core/US-014-plugin-scope-contract.md) — `install(scope)`，四个插件包已迁移
- [US-015 插件依赖声明与按需装卸](stories/core/US-015-plugin-inject-dependency.md) — 阶段 A 已交付，故事置 `In Review`
  - ✅ 阶段 A 适配器依赖纪元 — `inject: ['adapter:local']` + 纪元调度器
  - ⬜ 阶段 B 插件间依赖图 — 已移出承诺范围：全仓库零 `plugin:*` 声明

> `US-016` / `US-017` 已按 Epic 收口判据改判移出，不再是候选项（理由见 [epic-008 已移出承诺范围](epics/epic-008-lifecycle-scope.md#已移出承诺范围)）。

## 前置阻塞（不体现在 Blocked 计数里）

以下故事的 YAML `status` 都不是 `Blocked`，但开工前有硬前置：

> **已解除**：US-505 AC#6/#7 与 US-208 AC#10 曾同挂在「一次跑绿的 `release-desktop.yml` 三 OS 矩阵」上，
> 已由 2026-09-01 的 [run 33476341615](https://github.com/aiao-io/rxdb/actions/runs/33476341615)
> （8/8 job `success`、零 `skipped`）解除，两条故事均转 `Done`，本表不再列。

| 被挡住的                                                                                         | 硬前置                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| epic-006 整条链（链首 [US-305](stories/collaboration/US-305-commit-graph-head.md)，不是 US-306） | 首个真实 system schema 迁移发布，其 FR-030 要求 `migration-release.json` 指向一个位于发布主线祖先上的有效 bridge tag。该文件当前 `bridge.tag` / `bridge.version` 均为 `null`——**必须先从主线发布一个新的非迁移 bridge 版本**，见 [release-plan.md](release-plan.md)。不随代码进度自动解除，需单独排期                                                                                                                                                                                                                                                                                                                                    |
| [US-015](stories/core/US-015-plugin-inject-dependency.md) 阶段 B                                 | 出现第一个 `plugin:*` 依赖声明。全仓库唯一的 `inject` 是 search 的 `['adapter:local']`。不随代码进度自动解除，`In Review` 是稳态                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| [US-904](stories/future/US-904-devtools-native-storage-contract.md) 阶段 D                       | ✅ **已解除**：阶段 A 判 `decision: supported`，阶段 C 主体已交付，AC#52 已于 2026-09-03 真机跑通（`devtools-restart-persistence.spec.ts`），「环境不具备」的判断已作废。剩余 AC#45/46/47/49/51 的 E2E 侧不再卡环境，从该 spec 的 `attachPanel` / `readPanel` 驱动出发即可。三条实测约束仍生效：Electron 缺整个 `chrome.permissions` 命名空间（需显式能力探测，禁静默 fallback）、扩展面板只在 dock（`mode:'bottom'`）DevTools 中注册、**自定义 `app:` scheme 拿不到扩展 host permission**，故 E2E 必须走应用的 `--serve` http renderer                                                                                                  |
| [US-905](stories/future/US-905-tauri-native-devtools.md) 阶段 2                                  | 阶段 1 + [US-210](stories/adapter/US-210-tauri-sqlite-local-database.md)（已 Done）+ [US-505](stories/plugin/US-505-tauri-local-file-storage.md)（**2026-09-01 已 Done**）。**两条前置故事都已关闭**，阶段 2 不再等任何故事；剩下的卡点全在阶段 1 自身的 6 条 ⚠️ 上。它们卡的**不是构建环境**（本机 cargo 1.97.1 + tauri-cli 2.11.4 齐全，`tauri-package-release` 热跑 20s 就出真 release 二进制，2026-09-01 实测），而是**没有能驱动两个真实 WebView 的 harness**：`desktop-smoke` 按 US-210 AC#9 刻意走进程级驱动、不上 WebDriver，验得了「进程重启后数据还在」，验不了双 WebView 握手、以同 label 重开拒旧身份、退出时的 session 释放 |
