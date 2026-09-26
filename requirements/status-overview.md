# 状态概览

> **真相源**：每个 story 的 YAML `status` 字段。本文件是派生视图，**不要**作为查询当前状态的唯一依据；如发现与 YAML 不一致，请优先信任 YAML 并修复本文件。
>
> 本文件**只回答「什么状态」**。排期与约束 → [roadmap.md](roadmap.md)；能力与覆盖缺口 → [capability-matrix.md](capability-matrix.md)；发布 → [release-plan.md](release-plan.md)。

## 状态汇总

| 状态           | 数量 |
| :------------- | :--- |
| ✅ Done        | 65   |
| 🚧 In Progress | 0    |
| 👀 In Review   | 1    |
| 📝 Backlog     | 28   |
| 🚫 Blocked     | 0    |
| **合计**       | 94   |

> 数字由 `grep -h "^status:" requirements/stories/*/US-*.md | sort | uniq -c` 推导，**请勿手写维护**；
> 合计等于 `stories/*/US-*.md` 里带 `status:` frontmatter 的文件数；[US-904 阶段 A 可行性记录](stories/future/US-904-phase-a-evidence.md) 是证据留档，不计入故事总数。`🚫 Blocked = 0` 只统计 YAML 显式 `status: Blocked`，不代表没有前置阻塞——见下方[前置阻塞](#前置阻塞不体现在-blocked-计数里)。
>
> **28 条 Backlog 里只有 8 条是可开工的**：另外 20 条（BOM 领域模型 19 条 + [US-030](stories/core/US-030-declarative-storage-constraints.md)）
> 标**价值待证**，按 [CONVENTIONS](CONVENTIONS.md#价值待证) 留在 Backlog 但不进任何排期批次。
> 两者在 YAML 里同为 `Backlog`，差别只在「有没有解锁条件」，读汇总数字时需要区分。

图例：✅ Done · 🚧 In Progress · 👀 In Review · ⬜ Backlog · 🚫 Blocked

## 进行中（0 条）

当前没有进行中的故事。

## 待评审（1 条）

属 [epic-006](epics/epic-006-working-tree-commits.md)，代码 AC 已全部通过，只剩 `bench-working-tree` 的一件收尾；理由见[按 Epic 索引里的该节](#本地工作树与提交历史)。

| Story                                                                           | 待收尾的是什么                                                                                      |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [US-306 工作树与提交操作](stories/collaboration/US-306-working-tree-commits.md) | 阶段 A / B 已关；阶段 C 只剩 M1 基线静默复冻（CI 画像 reference 已签入、读项容差已定，T134 / T135） |

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
- ✅ [US-904 DevTools 原生本地存储调试](stories/future/US-904-devtools-native-storage-contract.md) — 阶段 A～D 全部关闭；AC#19 的真实断连半边、AC#40 的 OPFS conformance 半边与 AC#34/#38/#39/#42 的人工浏览器回归已移出承诺范围（项目早期暂不做，v2 收尾另立故事）
- ✅ [US-905 Tauri DevTools 调试窗口、transport 与原生存储集成](stories/future/US-905-tauri-native-devtools.md) — 阶段 1 八条与阶段 2 九条共十七条 AC 全 ✅；ubuntu/macOS/Windows 三平台的 packaging 与 devtools smoke 证据齐全；idb 档走 dedicated Worker 传输；linux idb 真值为 `failed`（冻结值）
- ✅ [US-906 Electron 桌面端 DevTools 面板的开发者可用路径](stories/future/US-906-electron-devtools-developer-path.md) — dev 变体扩展 + 桌面调试流程文档；AC#2 的人工半边（照 README 手跑一遍）不在承诺范围
- ✅ [US-908 DevTools 传输取消与桌面文件会话的两条已知缺陷](stories/future/US-908-devtools-transfer-session-defects.md) — 两条均已关闭：`cancel()` 与 `complete()` 一样排空在途写入（取消后不留 `.rxdb-tmp`）；Electron 装配处接上 `pagehide → dispose()`，刷新不再泄 host 文件会话

> 🚧 US-401 / US-701 查询构建器系列无故事文件；该范围由 `specs/002-rxdb-model-port`（rxdb-model 实体模型库：框架无关核心 + 三框架 UI 组件集，含可视化查询构建器）引入。三框架代码已随 #62 合入，剩跨框架对拍、三端对称复核、文档与规格状态收尾（T049 / T050 / T051 / T053，`spec.md` 仍为 Draft）。

### [未来功能](epics/epic-004-future-features.md)

- ✅ [US-702 全文搜索](stories/future/US-702-full-text-search.md)
- ✅ [US-209 微信小程序 wa-sqlite 适配器](stories/adapter/US-209-miniprogram-adapter.md) — 实验性，仅微信逻辑层
- ⬜ [US-211 多端小程序宿主](stories/adapter/US-211-multi-miniprogram-platforms.md) — 阶段 A 抽 host + 可行性矩阵；B/C 按门禁放行支付宝 / 抖音 / 百度 / QQ
- ✅ [US-504 Electron 本地文件存储](stories/plugin/US-504-electron-local-file-storage.md)
- ✅ [US-207 Electron 连接本地 SQLite 文件](stories/adapter/US-207-desktop-local-database.md)
- ✅ [US-210 Tauri 连接应用作用域 SQLite 文件](stories/adapter/US-210-tauri-sqlite-local-database.md)
- ✅ [US-505 Tauri 本地文件存储](stories/plugin/US-505-tauri-local-file-storage.md) — US-504 的 Tauri 半边；AC#6/#7 已随三 OS 矩阵跑绿关闭
- ✅ [US-208 Electron PGlite 数据目录与事务宿主](stories/adapter/US-208-electron-pglite-data-directory.md) — 已按冻结的「IPC 事务 ID 协议」实现；AC#10 三平台打包 smoke 已关闭
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
- ⬜ [US-027 实体操作权限模型](stories/core/US-027-entity-permission-model.md) — 实体级 create/update/delete × user/system 权限矩阵，三阶段交付：A 判定原语与 14 张系统表的矩阵声明；B 所有公开写入口强制，越权抛 `PermissionDeniedError`；C 三框架 UI 能力派生（B、C 都只依赖 A）。**价值待证**：今天的症状只在 demo（目录能新建 / 删除 / 改写系统表），[roadmap 零散收尾项](roadmap.md#零散收尾项不成故事随手可带)第 4 条零抽象可修；本故事作为 US-029 阶段 B 的判定原语上游留在 [roadmap 立项池](roadmap.md#立项池待-owner-决策未进任何批次)
- ⬜ [US-028 可排序实体](stories/core/US-028-sortable-entity.md) — sortOrder 从树形实体解耦到普通实体：core 排序语义 + rxdb-model 拖放持久化；三框架实体列表今天有拖拽手柄、重排不落库，排在 [roadmap 批次 3](roadmap.md#批次-3能力补齐与在出货缺陷无硬前置可并行开-pr)
- ⬜ [US-029 多用户 RBAC 权限与租户隔离的关联设计](stories/core/US-029-rbac-tenant-permission-design.md) — `ownerId` / `tenantId` 字段预留与权限谓词扩展：pull 过滤 / push 裁决配合点与三框架行级只读派生；四阶段交付。阶段 A 要给存量库补列（`#ensureEntityTables` 只补表不补列），阶段 B 依赖 US-027，阶段 C 的租户过滤今天只有 Supabase 有通道
- ⬜ [US-030 实体元数据层的声明式存储约束](stories/core/US-030-declarative-storage-constraints.md) — **价值待证**：`EntityMetadataOptions` 无 CHECK 落点、`EntityIndexMetadataOptions` 只有 `properties` / `unique` / `normalized`；四阶段（CHECK → 条件唯一与表达式索引 → 区间排他双后端等价 → 生成列与索引方法）；当前消费方全在 epic-009，但解锁条件不限 BOM
- ⬜ [US-217 本地数据库一致性备份与恢复](stories/adapter/US-217-local-database-backup-restore.md) — 按 PGlite、SQLite 共享层、桌面 host 分阶段交付；仅恢复兼容 adapter 的完整数据库状态
- ⬜ [US-909 会话录制回放与失败现场数据还原](stories/future/US-909-session-replay-debugging.md) — 阶段 A e2e 失败现场录制回放；阶段 B 关联 commit 还原数据状态（前置 US-307 已 Done）；阶段 C 插件与三框架组件价值待证
- ✅ [US-025 核心包子系统按插件边界外移](stories/core/US-025-core-plugin-extraction.md) — QueryCache / 跨 tab 网关 / 历史分支 / 推拉同步 / 树实体分五阶段外移为插件包，A～E 全部交付；破坏性变更逐阶段记在故事里：`QueryCacheRepository`（B）、`VersionManager` 等 12 条（C）、出站 5 条与 `rxdb.versionManager.<syncMethod>` 改挂 `rxdb.syncManager`（D）、四个树 hook 从三框架绑定包迁往 `@aiao/rxdb-plugin-tree-{angular,react,vue}`（E）
- ✅ [US-506 website 插件文档补齐（history / sync / querycache）](stories/plugin/US-506-website-plugin-docs.md) — US-025 拆包三插件的文档站手册页、侧边栏与 typedoc 收录；含 flatten 坏链修复

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

US-305 / US-307 / US-308 已 Done，只剩 US-306 👀 In Review。交付顺序 **US-305 → US-306 阶段 A → B → C →（US-307 ∥ US-308）** 已按序走完，6 后端 5031 条零失败，SC-006 的 12 个调用点齐全，分支评审的架构级 P1 已清零。US-306 不写 Done 的理由只剩 `bench-working-tree` 的一件：

- **M1 基线是带负载的初版**——`frozenAbsolute.commit` 因后 4 轮 `restore` 离群值虚高约 29%（425.85→550.53ms），**发布用的绝对门禁在静默复冻之前不得据此放行**。复冻走契约 §3.1 的「已知带负载的基线复冻」，做完 US-306 关闭。

另两件已收口：CI 托管 runner 的三种画像（AMD EPYC 7763 / EPYC 9V74 / Intel Xeon 6973P-C）reference 已签入，PR 的 `ci / benchmarks` 转绿（T134），US-307 / US-308 随之关闭；分到没冻结过的型号判 `benchmark_environment_mismatch`，重跑该 job 一次，同一型号反复出现再补冻。读项 `status` / `diff` 的容差按 CI 各画像十轮的离散度定为 130%，写项 `restore` / `commit` 保持 110%（T135，[契约 §3.1](../specs/001-working-tree-commits/contracts/benchmark-report.md)）。

US-305 的 AC US2-14 绿半边（真实新 bridge tag 上门禁转绿）由 [release-plan「迁移发布的关闭条件」](release-plan.md#迁移发布的关闭条件)承接；`main` 自 #55 起已是 schema 6，桥接锚点无处可切，见 [release-plan 开项](release-plan.md#开项main-自-55-起已是-schema-6桥接锚点无处可切)。评审顺延的架构项不挡关闭，登记在 [roadmap「epic-006 评审顺延的架构项」](roadmap.md#epic-006-评审顺延的架构项)。

排期上桥接发布是 [roadmap 线 A](roadmap.md#线-a桥接版本发布owner-门控)，执行排在所有批次之后——**代码先落地不等于排期提前**。

- ✅ [US-305 提交图与 HEAD 持久化](stories/collaboration/US-305-commit-graph-head.md) — 阶段 A / B 的代码与 6 后端 conformance 调用点（T022～T045）；AC US2-14 的绿半边移交 release-plan
- 👀 [US-306 工作树与提交操作](stories/collaboration/US-306-working-tree-commits.md)
  - ✅ 阶段 A 工作树写入捕获与持久化 — T046～T068
  - ✅ 阶段 B 提交状态机（status / diff / commit / discard，无暂存区）— T069～T085
  - 👀 阶段 C 三框架工作树交互面与性能门禁 — T086～T097；三端 `useWorkingTree()`、三个 demo 面板与 a11y E2E 已交付，只剩 M1 基线静默复冻
- ✅ [US-307 历史恢复会话](stories/collaboration/US-307-restore-session.md) — T098～T110 全部关闭；`restore` 测点在 CI 画像上过相对门禁
- ✅ [US-308 分支隔离与跨 realm 冲突检测](stories/collaboration/US-308-branch-isolation-conflict.md) — T111～T123 全部关闭；原落在本故事的 3 条 P1（FR-020 的 activation revision 未推进与切换 TOCTOU、FR-044 的物化未接公开入口）已全部落地

### [公开 API 门禁](epics/epic-007-public-api-gates.md)

- ✅ [US-601 子路径入口纳入 API 表面基线](stories/tooling/US-601-subpath-api-surface-baseline.md)
- ⬜ [US-602 发布产物面向 AI 的可理解性](stories/tooling/US-602-ai-comprehensible-artifacts.md) — 包关系真相源 + 漂移门禁（阶段 A）→ 站点 `llms.txt`（B）→ 主包单份 Agent Skill（C）；MCP 另立故事

### [生命周期作用域](epics/epic-008-lifecycle-scope.md)

**Epic 已置 `Done`。** US-013 → US-014 的硬序已随两条交付解除。

- ✅ [US-013 LifecycleScope 生命周期作用域原语](stories/core/US-013-lifecycle-scope-primitive.md) — `@aiao/utils` 侧的原语；只交付原语，不迁移任何调用方
- ✅ [US-014 插件作用域契约](stories/core/US-014-plugin-scope-contract.md) — `install(scope)`，四个插件包已迁移
- ✅ [US-015 插件依赖声明与按需装卸](stories/core/US-015-plugin-inject-dependency.md) — 两个阶段均已交付
  - ✅ 阶段 A 适配器依赖纪元 — `inject: ['adapter:local']` + 纪元调度器
  - ✅ 阶段 B 插件间依赖图 — 名字索引与重名裁决、拓扑装卸、环检测；消费方是 US-025 阶段 C/D

> `US-016` / `US-017` 无故事文件、不在候选项中（理由见 [epic-008 已移出承诺范围](epics/epic-008-lifecycle-scope.md#已移出承诺范围)）。

### [BOM 领域模型](epics/epic-009-bom-domain-model.md)

**整条 Epic 标价值待证，全部 `priority: Low`，不进任何排期批次**——19 条故事约 15 项新增抽象对应零个已知病灶（US-525 不引入抽象），
解锁条件见 [epic-009 价值待证](epics/epic-009-bom-domain-model.md#价值待证整个-epic)。
没有一条带脱离 BOM 场景的独立病灶：graph 插件允许成环是既定语义，「写入期拒绝成环」（US-509）是 BOM 的领域约束。
解锁后先处理 Epic 内的顺序矛盾，见 [epic-009 解锁前须先处理](epics/epic-009-bom-domain-model.md#解锁前须先处理)。
四类引擎声明能力缺口已拆出为 [US-030](stories/core/US-030-declarative-storage-constraints.md)（归 epic-004），解锁条件低一档。

- ⬜ [US-507 BOM 图骨架：物料、修订与多重边 BOM 行](stories/plugin/US-507-bom-graph-skeleton.md) — 三阶段；`bom_header` 挂修订、无独立 `version` 轴；关闭条件是 `(bom_header_id, line_no)` 唯一而 `(parent_revision_id, child_item_id)` 不唯一
- ⬜ [US-508 BOM 视图解析：类型/组织/修订/生效期过滤](stories/plugin/US-508-bom-view-resolution.md) — 日期生效期与替代方案不重叠约束；区间排他落 US-030
- ⬜ [US-509 DAG 约束与环路检测下沉存储层](stories/plugin/US-509-bom-dag-cycle-detection.md) — 写入期拒绝成环是 BOM 的领域约束（graph 插件允许成环是既定语义）；「存储层」按适配器分档，`http` / `supabase` 显式声明能力缺席；AC#4 依赖 US-513、AC#8 依赖 US-510 阶段 B
- ⬜ [US-510 多级展开与 where-used 反查](stories/plugin/US-510-bom-multilevel-explosion.md) — 两阶段；闭包表不存累计用量、不含生效期，删边按 `line_path` 增量维护
- ⬜ [US-511 展开数量正确性：用量语义、三类损耗、虚拟件穿透](stories/plugin/US-511-bom-quantity-semantics.md) — 三阶段；七步有序公式，损耗制式必须记录
- ⬜ [US-512 替代组与替代策略](stories/plugin/US-512-bom-substitute-group.md) — 策略与是否允许混用属组不属行；概率合计 ≠ 1 拒绝而不归一化
- ⬜ [US-513 联产品与副产品：多输出物料流](stories/plugin/US-513-bom-coproduct-byproduct.md) — 仅 `consume` 边进结构闭包与环检测；四个 `flow_direction` 各自有下游消费方
- ⬜ [US-514 成本卷算](stories/plugin/US-514-bom-cost-rollup.md) — 拓扑逆序单遍；前置 US-511 / US-520 / US-524
- ⬜ [US-515 变更管理（ECN）驱动的生效期](stories/plugin/US-515-bom-change-management.md) — `valid_from` 由 ECN 派生，不手填
- ⬜ [US-516 EBOM ↔ MBOM 映射与差异对比](stories/plugin/US-516-ebom-mbom-mapping.md) — 关闭条件是**明确不用视图实现**
- ⬜ [US-517 可配置销售 BOM：特征、选项与选择条件](stories/plugin/US-517-configurable-sales-bom.md) — 只定模型与求解契约，求解器可外挂
- ⬜ [US-518 序列与批次有效性](stories/plugin/US-518-bom-unit-lot-effectivity.md) — 有效性从一维扩到日期 × 序列 × 批次
- ⬜ [US-519 扩展属性：jsonb 值 + attr_def 元数据 + 热字段提升](stories/plugin/US-519-bom-extension-attributes.md) — 关闭条件是**没有 EAV 表**
- ⬜ [US-520 工艺路线挂接与工序投料分摊](stories/plugin/US-520-bom-routing-operation.md) — 只做挂接点，路线本体归 US-524
- ⬜ [US-521 ERP/MRP 集成契约](stories/plugin/US-521-bom-erp-mrp-integration.md) — 导出进 api-baseline；批量导入按行报错
- ⬜ [US-522 三框架 BOM 编辑与展开视图](stories/plugin/US-522-bom-tri-framework-ui.md) — 单端缺失 = 未完成，故不按端拆故事
- ⬜ [US-523 as-built / as-maintained 实例 BOM](stories/plugin/US-523-bom-as-built-instance.md) — 实例闭包与主数据闭包分离
- ⬜ [US-524 工艺路线本体：工序、工作中心、工时与费率](stories/plugin/US-524-routing-master-model.md) — 四阶段；US-520 AC#5 引用完整性与 US-514 加工费的那一端，是 US-514 的硬前置
- ⬜ [US-525 BOM 端到端 demo：一份数据集走完全域](stories/plugin/US-525-bom-end-to-end-demo.md) — 四阶段；**不新增抽象、也不解锁 Epic**，是首轮切片的验收手段；一份滑板车数据集贯穿全域 + 七步算式面板

## 前置阻塞（不体现在 Blocked 计数里）

以下故事的 YAML `status` 都不是 `Blocked`，但有硬前置——epic-006 那条挡的是**发布**而不是开工，代码已全部落地，前置照样没解除。系统迁移的排他性由后端排他锁与单事务提交承担
（[US-303](stories/collaboration/US-303-bigint-binary-change-codec.md) AC13），不存在跨 realm writer lease 或迁移 epoch，故下表没有这一类前置。

| 被挡住的                                                                                                                 | 硬前置                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| epic-006 的首个 system schema 迁移发布（代码由 [US-305](stories/collaboration/US-305-commit-graph-head.md) FR-030 交付） | 其 FR-030 要求 `migration-release.json` 指向一个位于发布主线祖先上的有效 bridge tag。该文件当前 `bridge.tag` / `bridge.version` 均为 `null`——**必须先从主线发布一个新的非迁移 bridge 版本**，见 [release-plan.md](release-plan.md)；而 `main` 自 #55 起已是 schema 6，桥接锚点在 `main` 上无处可切，出路待 owner 定（[release-plan 开项](release-plan.md#开项main-自-55-起已是-schema-6桥接锚点无处可切)）。不随代码进度自动解除 |
