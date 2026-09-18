# 状态概览

> **真相源**：每个 story 的 YAML `status` 字段。本文件是派生视图，**不要**作为查询当前状态的唯一依据；如发现与 YAML 不一致，请优先信任 YAML 并修复本文件。
>
> 本文件**只回答「什么状态」**。排期与约束 → [roadmap.md](roadmap.md)；能力与覆盖缺口 → [capability-matrix.md](capability-matrix.md)；发布 → [release-plan.md](release-plan.md)。

## 状态汇总

| 状态           | 数量 |
| :------------- | :--- |
| ✅ Done        | 60   |
| 🚧 In Progress | 1    |
| 👀 In Review   | 4    |
| 📝 Backlog     | 3    |
| 🚫 Blocked     | 0    |
| **合计**       | 68   |

> 数字由 `grep -h "^status:" requirements/stories/*/US-*.md | sort | uniq -c` 推导，**请勿手写维护**；
> 合计等于 `stories/*/US-*.md` 里带 `status:` frontmatter 的文件数；[US-904 阶段 A 可行性记录](stories/future/US-904-phase-a-evidence.md) 是证据留档，不计入故事总数。`🚫 Blocked = 0` 只统计 YAML 显式 `status: Blocked`，不代表没有前置阻塞——见下方[前置阻塞](#前置阻塞不体现在-blocked-计数里)。

图例：✅ Done · 🚧 In Progress · 👀 In Review · ⬜ Backlog · 🚫 Blocked

## 进行中（1 条）

| Story                                                                              | 当前进度                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [US-025 核心包子系统按插件边界外移](stories/core/US-025-core-plugin-extraction.md) | 阶段 A（门面轴注册表类型化 + 网关原地作用域化）、阶段 B（QueryCache 读路径外移为 `@aiao/rxdb-plugin-querycache`）、阶段 C（历史 / 撤销重做 / 分支外移为 `@aiao/rxdb-plugin-history`）与阶段 D（推拉同步 / 冲突 + QueryCache 写回出站外移为 `@aiao/rxdb-plugin-sync`）已交付，A1～A4 / B1～B5 / C1～C6 / D1～D6 全 ✅；C 实到 `version/` 整棵迁出（含推拉半区），核心留下 `system/system-repositories.ts` 与 `sync-contract/` 两批原语，公开面 452 → 460（+20 / −12，破坏性）；D 从历史插件里切出新包并把出站的 5 条导出收回包内，核心公开面 460 → 457（−5 / +2，破坏性），历史插件 15 → 9、新包 20 条，可达性与 `SyncStateHub` 按「搬走的是消费者，不是原语」留核心，`reachability` 改 `watch()` 引用计数满足 D2；C 十二处 / D 十二处计划偏差分别记在故事的阶段 C / D 两节；剩阶段 E（树实体），其前置 `RxDBBranch` 去树化不在本故事任一阶段内 |

## 待评审（4 条）

四条同属 [epic-006](epics/epic-006-working-tree-commits.md)，代码已完成、收尾门禁未跑完；逐条理由见[按 Epic 索引里的该节](#本地工作树与提交历史)。

| Story                                                                                           | 待收尾的是什么                                                                                                         |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [US-305 提交图与 HEAD 持久化](stories/collaboration/US-305-commit-graph-head.md)                | AC US2-14 的绿半边要一个真实的新 bridge tag（线 A），今天造不出也不许造                                                |
| [US-306 工作树与提交操作](stories/collaboration/US-306-working-tree-commits.md)                 | 任务侧 133 条已全关（T130 / T131 / T109 / T132 均已闭合）；`status` 相对门禁的方差问题仍归评审，但已不阻塞门禁（见上） |
| [US-307 历史恢复会话](stories/collaboration/US-307-restore-session.md)                          | T109 已关闭：reference 已重新冻结，`restore` 进入基线；该基线是带负载的初版，待复冻（见上）                            |
| [US-308 分支隔离与跨 realm 冲突检测](stories/collaboration/US-308-branch-isolation-conflict.md) | 任务侧已全关；T132 于 2026-09-18 复跑 `✓ PASS`，收口完成                                                               |

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
- ✅ [US-904 DevTools 原生本地存储调试](stories/future/US-904-devtools-native-storage-contract.md) — 阶段 A～D 全部关闭；AC#34/#38/#39/#42 的人工浏览器回归已移出承诺范围（项目早期暂不做，未来 v2 收尾另立故事）
- ✅ [US-905 Tauri DevTools 调试窗口](stories/future/US-905-tauri-native-devtools.md) — 阶段 1 八条与阶段 2 九条共十七条 AC 全 ✅；AC#17 三平台证据由 PR #58 最终 HEAD 的 Release Desktop run 34858162498 回填（ubuntu/macOS/Windows 的 packaging 与 devtools smoke 全绿）；win32 首跑里 idb 档的 SharedWorker 挂起修于 dedicated Worker 传输，linux idb 真值按首跑回填 `failed`
- ✅ [US-906 Electron 桌面端 DevTools 面板的开发者可用路径](stories/future/US-906-electron-devtools-developer-path.md) — dev 变体扩展 + 桌面调试流程文档；AC#2 的人工半边（照 README 手跑一遍）已移出承诺范围
- ✅ [US-908 DevTools 传输取消与桌面文件会话的两条已知缺陷](stories/future/US-908-devtools-transfer-session-defects.md) — 两条均已关闭：`cancel()` 与 `complete()` 一样排空在途写入（取消后不留 `.rxdb-tmp`）；Electron 装配处接上 `pagehide → dispose()`，刷新不再泄 host 文件会话

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
- ✅ [US-024 PGlite 侧 QueryCache 远端行的列契约](stories/core/US-024-pglite-querycache-row-contract.md) — US-022 的 PGlite 半边；共享的是契约语义与消息骨架，必填列判据按各后端 DDL 各自实现（uuid 主键与 `SET NULL` 外键列两处**故意不同**）
- ✅ [US-216 参考后端以 RxDB 引擎实现](stories/adapter/US-216-server-side-rxdb.md) — 后端初始化 RxDB（pglite），协议端点改由 Repository/EntityManager 实现，前后端共享 schema 模块；单类收敛由 US-026 承接
- ⬜ [US-026 实例级实体同步配置覆盖](stories/core/US-026-instance-sync-override.md) — 初始化时按实体整体覆盖同步配置；实例隔离、三框架一致与 HTTP demo 单类收敛
- ⬜ [US-217 本地数据库一致性备份与恢复](stories/adapter/US-217-local-database-backup-restore.md) — 按 PGlite、SQLite 共享层、桌面 host 分阶段交付；仅恢复兼容 adapter 的完整数据库状态
- 🚧 [US-025 核心包子系统按插件边界外移](stories/core/US-025-core-plugin-extraction.md) — QueryCache / 跨 tab 网关 / 历史分支 / 推拉同步 / 树实体分五阶段外移为插件包；阶段 A（门面轴注册表类型化 + 网关原地作用域化）、阶段 B（QueryCache 读路径外移，破坏性：`QueryCacheRepository` 退出公开面）、阶段 C（历史 / 分支外移，破坏性：`VersionManager` 等 12 条退出核心公开面）与阶段 D（推拉同步 + QueryCache 写回出站外移，破坏性：出站 5 条退出核心公开面，`rxdb.versionManager.<syncMethod>` 改挂 `rxdb.syncManager`）已交付；只剩阶段 E（树实体），其前置 `RxDBBranch` 去树化是本故事之外的独立工作

### [类型系统演进](epics/epic-005-type-system-evolution.md)

八条故事全部 Done，[epic-005](epics/epic-005-type-system-evolution.md) 也已 `Done`：发布门禁 6 条各自的留证记在该 epic 的「六条门禁的留证」表里（CI run、文档落点逐条可查）。**故事清单全绿本身不构成门禁成立**，两者要分开读——这一节只答故事状态。

- ✅ [US-011 定义 bigint 与 binary 类型及公共 API 契约](stories/core/US-011-property-type-bigint-binary.md)
- ✅ [US-206 本地适配器持久化与查询 bigint/binary](stories/adapter/US-206-bigint-binary-adapter.md)
- ✅ [US-303 bigint/binary change codec 与系统迁移](stories/collaboration/US-303-bigint-binary-change-codec.md)
- ✅ [US-804 加密字段支持 bigint/binary](stories/future/US-804-bigint-binary-encryption.md)
- ✅ [US-903 DevTools 展示 bigint/binary](stories/future/US-903-bigint-binary-devtools.md)
- ✅ [US-012 扩展字段语义与前端通信契约](stories/core/US-012-field-semantic-metadata.md)
- ✅ [US-019 拒绝重复声明的 URL scheme](stories/core/US-019-url-scheme-duplicate-rejection.md)
- ✅ [US-018 生成器元数据序列化管线与 default 语义](stories/core/US-018-generator-default-serialization.md) — `BREAKING CHANGE`，发布侧约束见 [roadmap 约束 12](roadmap.md#排期约束)

### [本地工作树与提交历史](epics/epic-006-working-tree-commits.md)

四条全部 👀 In Review。`specs/001-working-tree-commits/tasks.md` 已存在，**133 条已全部关闭**，交付顺序 **US-305 → US-306 阶段 A → B → C →（US-307 ∥ US-308）** 已按序走完，US-306 的阶段 A / B / C 全部关闭。收尾三道（T130 全矩阵回归 / T131 quickstart 十场景 / T132 性能门禁）已在 2026-09-18 全部跑过并关闭——T130 那 6 条同形红判定为**套件断言与 FR-017 相反**（`createBranch(branchId)` 按规格就该共享当前 HEAD），按规格收紧断言后 6 后端 5031 条零失败，SC-006 的 12 个调用点齐全；T132 在同日重新冻结 reference 之后复跑 `✓ PASS`（四项 ratio 全部在 110% 以内）。**仍不写 Done，两个理由都不是文书问题**：① 性能基线只是**初版**——重新冻结走的是契约 §3.1 点名允许的「测点集合变化（T109 加入 `restore`）后重新冻结」，不是「失败后重算」（重算前 status / diff / commit 三项本就 PASS），但它是在 1 分钟负载冲到 44 的机器上冻的，后 4 轮 `restore` 出现 3–4 倍离群值，`frozenAbsolute.commit` 因此从 425.85ms 虚高到 550.53ms（+29%），**发布用的绝对门禁在机器静默复冻之前不得据此放行**；同一次冻结还顺带把 `status` 的上限从 2.157 抬到 2.400，而新基线自身十轮极差 1.78–2.59（±19%），在旧上限下 6/10 会超限——这说明 `status` 的问题不在基线取值，在「4ms 量级读操作 ÷ 2.5ms 量级对照」这个比值对噪声没有抵抗力，**容差口径仍归评审**（可选解：给小量级测点单独容差，或改判绝对 p95 ≤ 100ms，实测 5.54ms、余量 18 倍）；② US-305 的 AC US2-14 只有红半边能在真实仓库上执行（见下）。排期上整链（含桥接发布）仍位于 [roadmap 批次 4](roadmap.md#批次-4epic-006-链整体压后)、排在所有其他批次之后——**代码先落地不等于排期提前**。

- 👀 [US-305 提交图与 HEAD 持久化](stories/collaboration/US-305-commit-graph-head.md) — 交付阶段 A / B 的代码与 6 后端 conformance 调用点已就位（T022～T045）；**FR-030 的发布前置未解除**：`migration-release.json` 的 `bridge.tag`/`bridge.version` 仍是 `null`，而 AC US2-14 的绿半边要求 `bridge.version` 严格新于 `0.0.25`，仓库里不存在这样的 tag，造一个等于伪造发布锚点。红半边（`null` / `v0.0.25` / 版本常量不吻合时门禁必红）已在真实仓库上跑过并留证
- 👀 [US-306 工作树与提交操作](stories/collaboration/US-306-working-tree-commits.md)
  - 👀 阶段 A 工作树写入捕获与持久化 — T046～T068
  - 👀 阶段 B 提交状态机（status / diff / commit / discard，无暂存区）— T069～T085
  - 👀 阶段 C 三框架工作树交互面与性能门禁 — T086～T097；三端 `useWorkingTree()`、三个 demo 面板与 a11y E2E 已交付，性能门禁四项 ratio 均在容差内（2026-09-18 实测），遗留项见上面的理由 ①
- 👀 [US-307 历史恢复会话](stories/collaboration/US-307-restore-session.md) — T098～T110 **已全部关闭**；T109 于 2026-09-18 随 reference 重新冻结闭合，遗留的基线复冻见理由 ①
- 👀 [US-308 分支隔离与跨 realm 冲突检测](stories/collaboration/US-308-branch-isolation-conflict.md) — T111～T123，全部关闭

### [公开 API 门禁](epics/epic-007-public-api-gates.md)

- ✅ [US-601 子路径入口纳入 API 表面基线](stories/tooling/US-601-subpath-api-surface-baseline.md)

### [生命周期作用域](epics/epic-008-lifecycle-scope.md)

**Epic 已置 `Done`。** US-013 → US-014 的硬序已随两条交付解除。

- ✅ [US-013 LifecycleScope 生命周期作用域原语](stories/core/US-013-lifecycle-scope-primitive.md) — `@aiao/utils` 侧的原语；只交付原语，不迁移任何调用方
- ✅ [US-014 插件作用域契约](stories/core/US-014-plugin-scope-contract.md) — `install(scope)`，四个插件包已迁移
- ✅ [US-015 插件依赖声明与按需装卸](stories/core/US-015-plugin-inject-dependency.md) — 两个阶段均已交付
  - ✅ 阶段 A 适配器依赖纪元 — `inject: ['adapter:local']` + 纪元调度器
  - ✅ 阶段 B 插件间依赖图 — 名字索引与重名裁决、拓扑装卸、环检测；消费方是 US-025 阶段 C/D

> `US-016` / `US-017` 已按 Epic 收口判据改判移出，不再是候选项（理由见 [epic-008 已移出承诺范围](epics/epic-008-lifecycle-scope.md#已移出承诺范围)）。

## 前置阻塞（不体现在 Blocked 计数里）

以下故事的 YAML `status` 都不是 `Blocked`，但有硬前置——epic-006 那条挡的是**发布**而不是开工，代码已在 `next-0912` 上落地，前置照样没解除。系统迁移的排他性由后端排他锁与单事务提交承担
（[US-303](stories/collaboration/US-303-bigint-binary-change-codec.md) AC13），不存在跨 realm writer lease 或迁移 epoch，故下表没有这一类前置。

| 被挡住的                                                                                         | 硬前置                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| epic-006 整条链（链首 [US-305](stories/collaboration/US-305-commit-graph-head.md)，不是 US-306） | 首个真实 system schema 迁移发布，其 FR-030 要求 `migration-release.json` 指向一个位于发布主线祖先上的有效 bridge tag。该文件当前 `bridge.tag` / `bridge.version` 均为 `null`——**必须先从主线发布一个新的非迁移 bridge 版本**，见 [release-plan.md](release-plan.md)。不随代码进度自动解除，需单独排期。截至 2026-09-18 这一条仍然成立：四条故事的代码已完成并转 👀 In Review，`bridge.tag` 依旧是 `null` |
