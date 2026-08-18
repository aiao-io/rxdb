# 状态概览

> **真相源**：每个 story 的 YAML `status` 字段。本文件是派生视图，**不要**作为查询当前状态的唯一依据；如发现与 YAML 不一致，请优先信任 YAML 并修复本文件。
>
> 本文件**只回答「什么状态」**。排期与约束 → [roadmap.md](roadmap.md)；能力与覆盖缺口 → [capability-matrix.md](capability-matrix.md)；发布 → [release-plan.md](release-plan.md)。

## 状态汇总

| 状态           | 数量 |
| :------------- | :--- |
| ✅ Done        | 36   |
| 🚧 In Progress | 4    |
| 👀 In Review   | 0    |
| 📝 Backlog     | 13   |
| 🚫 Blocked     | 0    |
| **合计**       | 53   |

三条口径，读表前必知：

1. 数字由 `grep -h "^status:" requirements/stories/*/US-*.md | sort | uniq -c` 推导，**请勿手写维护**；合计等于 `stories/*/US-*.md` 的文件数，epic 文件不计入。
2. 其中 **7 条是多阶段故事**（[US-012](stories/core/US-012-field-semantic-metadata.md)、[US-015](stories/core/US-015-plugin-inject-dependency.md)、[US-207](stories/adapter/US-207-desktop-local-database.md)、[US-210](stories/adapter/US-210-tauri-sqlite-local-database.md)、[US-211](stories/adapter/US-211-multi-miniprogram-platforms.md)、[US-306](stories/collaboration/US-306-working-tree-index.md)、[US-904](stories/future/US-904-devtools-native-storage-contract.md)）：一个编号一个文件一条状态，正文用「交付阶段」表分批交付，**全部阶段关闭后才置 `Done`**。阶段不单独计数，见 [README](README.md#大故事用交付阶段不用子故事文件)。
3. `🚫 Blocked = 0` 统计的是**故事 YAML 里显式写成 `status: Blocked`** 的数量，**不代表没有前置阻塞**——见下方[前置阻塞](#前置阻塞不体现在-blocked-计数里)。两者不要互相推断。

图例：✅ Done · 🚧 In Progress · 👀 In Review · ⬜ Backlog · 🅰️ 多阶段故事 · 🚫 Blocked

## 进行中（4 条）

| Story                                                                                            | 卡在哪                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [US-207 Electron 连接本地 SQLite 文件](stories/adapter/US-207-desktop-local-database.md)         | 阶段 1～2 已交付（**9 条 AC 全绿**，2026-08-17 关闭 AC#8 + 三条发布性质）；**阶段 3**（包边界重整）E1～E5、E7 已交付，E6 已交付可逆的那半（迁移文档 `website/docs/migration/desktop-split.md`），只剩 `npm deprecate` 旧包（对外不可逆，需人工确认）；**阶段 4**（Web 回落）E8 的选择器与 E9 的同名断言已落进 `dev-rxdb-tauri` 的应用代码（`src/app/local-backend.ts`；「是否做成公开 API」已判定为**否**），欠 `dev-rxdb-electron` 半边（要求把 demo 的两张卡合并，需先确认）、E9 的页面展示、E10、E11。见该文件[交付阶段](stories/adapter/US-207-desktop-local-database.md#交付阶段) |
| [US-210 Tauri 连接应用作用域 SQLite 文件](stories/adapter/US-210-tauri-sqlite-local-database.md) | 阶段 1～3 已交付（2026-08-17 关闭 AC#1/#6/#9/#10；AC#10 的「不建库」半条靠新增的无副作用 `handshake` 请求兑现，两端各加一个请求类型）；**停在阶段 4** = Tauri 包化，T3（JS 传输层迁入新包）已随 US-207 E2/E3 交付，剩 T1/T2/T4～T7（Rust 宿主与一致性套件搬家）。见该文件[交付阶段](stories/adapter/US-210-tauri-sqlite-local-database.md#交付阶段)                                                                                                                                                                                                                                    |
| [US-505 Tauri 本地文件存储](stories/plugin/US-505-tauri-local-file-storage.md)                   | AC#6 / #7 的两个前置（`apps/dev-rxdb-tauri-e2e` project、三平台打包矩阵）已由 US-210 建好，缺的只剩 US-505 自己的 specs；AC#1/#3/#5/#8 仍 ⚠️                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [US-904 DevTools 原生本地存储调试](stories/future/US-904-devtools-native-storage-contract.md)    | 阶段 B 已交付（5 条 fake 关不掉的 AC 保留）；阶段 A / C / D 未开始                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

> US-207 / US-210 / US-505 的三条尾巴曾是**同一个下游缺口**：真实打包应用的重启与三平台矩阵。
> 该缺口已于 2026-08-17 补上（`release-desktop.yml` + 两个 e2e project），US-505 只剩自己的 specs。
>
> **桌面包边界重整（JS 侧已落地，Rust 侧未动；横跨 US-207 / US-210 / US-505 / US-504）**：
> `@aiao/rxdb-adapter-desktop` 拆成 `@aiao/rxdb-adapter-electron` 与 `@aiao/rxdb-adapter-tauri`，
> 共享协议与 renderer client 下沉 `rxdb-adapter-sqlite-core/desktop-host` 子路径，`desktop` 这个包名消失。
> **已完成**：E1～E5（下沉 / 改包名 / `ADAPTER_NAME` 分裂 / api-baseline 拆分 / 引用点更新）、
> E7（`desktop-adapter-consumer.mjs` 参数化到两个包，2026-08-17 对真 `pnpm pack` 产物跑通三条发布性质）、
> E6 的迁移文档（2026-08-18，`website/docs/migration/desktop-split.md`）、
> E8 的选择器本体 + E9 的同名断言（2026-08-18，`apps/dev-rxdb-tauri/src/app/local-backend.ts`；
> 同日判定**不做成公开 API**，从 `@aiao/rxdb` 撤回到应用里，理由见故事内「为什么不做成公开 API」）、
> US-210 T3（JS 传输层迁入）与 US-505 S3+S4、
> 三端 provider 统一异步契约（2026-08-18，见下）。
> **未完成**：E6 的 `npm deprecate` 旧包（**对外不可逆，需人工确认后执行**）、
> E8 的 `dev-rxdb-electron` 半边（它要求把 demo 的两张卡合并成一张，是 demo 形态变更，需先确认）、
> E9 的页面展示 / E10 / E11（E11 的前置已解除，见下）、
> US-210 T1/T2/T4～T7——Tauri 的 Rust 宿主与一致性用例（写本条时 SQL 侧 585 条）仍在 `apps/dev-rxdb-tauri/`，
> 搬进新包后 demo 才反向依赖。US-504 只需事后同步路径。
>
> `ADAPTER_NAME` 的分裂已于 2026-08-17 落定：`desktop` → `sqlite-electron` / `sqlite-tauri` / `pglite-electron`
> （PGlite 单列，归 US-208），依据与 7 项连带改动见
> [US-207「已落定的决策」](stories/adapter/US-207-desktop-local-database.md#已落定的决策adapter_name-分裂2026-08-17)。
> 仍未落定的只剩一条：**Rust 宿主做成 Tauri 插件还是普通 crate**——它会决定 US-210 AC#1 与
> US-505「`capabilities/` 零改动」的论证是否需要重写。
> 拖延成本随时间上涨：`@aiao/rxdb-adapter-desktop@0.0.25` 仍挂在 registry 上，指向一个仓库里已经不存在的包——
> 这条要等 E6 的 `npm deprecate` 才算收口。
>
> **三端 provider 统一异步契约（2026-08-18）**：Angular / React / Vue 的 provider 现在收同一个
> `RxDBSource = RxDB | Promise<RxDB> | (() => RxDB | Promise<RxDB>)`，读取统一为
> `useRxDB()`（未就绪抛错、创建失败原样抛出创建异常）+ `useRxDBOptional()`（返回 `undefined`），
> 三端共用一条所有权规则：**provider 只销毁自己造的东西**。对称性由三个同名同结构的
> `tri-framework-provider.spec.ts` 在编译期锁住（`@ts-expect-error` + `nx typecheck`）。
> 连带解除两处：E11 的「`provideRxDB` 只收同步工厂」前置没了（动态 `import()` 可直接交给 provider）；
> ELEC-11 在 `dev-rxdb-electron` 里手写的「bootstrap 强制实例化」补丁删除 ——
> Angular 的 `provideRxDB` 自带 app initializer，且该 initializer 永不 reject（reject 会中止
> bootstrap，窗口全白，诊断界面反被失败本身挡在门外）。
> 详见 [US-101](stories/framework/US-101-angular-integration.md) /
> [US-102](stories/framework/US-102-react-integration.md) /
> [US-103](stories/framework/US-103-vue-integration.md)。

## 已取消

**跨 realm writer lease 与迁移 fencing（原 US-304）已于 2026-08-16 取消**，故事与实现代码一并删除。
迁移路径至今未投入使用：0.0.x 线的 `RXDB_SYSTEM_SCHEMA_VERSION` / `RXDB_CHANGE_CODEC_VERSION` 均未抬升，
没有可迁移内容，一套持久化 lease/guard 表 + 桥接发布流程 + 多进程回归套件的成本与收益不成比例。
系统迁移的排他性由后端排他锁（`BEGIN EXCLUSIVE` / 表锁）与单事务提交承担，见
[US-303](stories/collaboration/US-303-bigint-binary-change-codec.md) 的 AC13 说明；跨 realm 的旧客户端
拦截由发布门禁（[release-plan.md](release-plan.md)）承担，不再有运行时协议。

> ⚠️ 这不解除 US-305 的前置：它仍需一次真实迁移发布，见下方[前置阻塞](#前置阻塞不体现在-blocked-计数里)。

## 按 Epic 索引

### [核心 MVP](epics/epic-001-core-mvp.md)

#### 核心引擎

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

#### 框架集成

- ✅ [US-101 Angular 集成](stories/framework/US-101-angular-integration.md)
- ✅ [US-102 React 集成](stories/framework/US-102-react-integration.md)
- ✅ [US-103 Vue 集成](stories/framework/US-103-vue-integration.md)

#### 存储适配器

- ✅ [US-201 SQLite 适配器](stories/adapter/US-201-sqlite-adapter.md)
- ✅ [US-202 PGlite 适配器](stories/adapter/US-202-pglite-adapter.md)
- ✅ [US-204 SQLite WASM 适配器](stories/adapter/US-204-sqlite-wasm-adapter.md)
- ✅ [US-205 SQLiteAI 适配器](stories/adapter/US-205-sqliteai-adapter.md)

#### Plugin 包

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
- 🅰️ 🚧 [US-904 DevTools 原生本地存储调试](stories/future/US-904-devtools-native-storage-contract.md) — 四阶段单文件故事
  - ⬜ 阶段 A Electron 43 MV3 可行性门禁 — 无前置；只门禁阶段 D
  - ✅ 阶段 B v2 协议（控制面 + provider 数据面）— v2 全部数值、状态机与错误联合的唯一真相源
  - ⬜ 阶段 C 共享面板 library 与 Chrome v2 迁移 — C1 面板抽取（可与阶段 B 并行）；C2 四段 relay 与 v2 切换
  - ⬜ 阶段 D Electron 原生存储集成 — 依赖 阶段 A(supported) + 阶段 C + US-207 + US-504
- ⬜ [US-905 Tauri DevTools 调试窗口](stories/future/US-905-tauri-native-devtools.md) — 阶段 1 依赖 US-904 阶段 C；阶段 2 依赖 US-210 + US-505，不等 US-904 阶段 D

> US-401 / US-701 查询构建器系列不在本仓库范围内。

### [未来功能](epics/epic-004-future-features.md)

- ✅ [US-702 全文搜索](stories/future/US-702-full-text-search.md)
- ✅ [US-209 微信小程序 wa-sqlite 适配器](stories/adapter/US-209-miniprogram-adapter.md) — 实验性，仅微信逻辑层
- 🅰️ ⬜ [US-211 多端小程序宿主](stories/adapter/US-211-multi-miniprogram-platforms.md) — 三阶段单文件故事；阶段 A 抽 host + 可行性矩阵，B/C 按门禁放行支付宝 / 抖音 / 百度 / QQ
  - ⬜ 阶段 A 宿主契约与可行性矩阵 — 微信路径零行为变化；不扩大支持声明
  - ⬜ 阶段 B 第一个非微信 host — 默认候选支付宝，以阶段 A 矩阵为准
  - ⬜ 阶段 C 抖音 / 百度 / QQ — 每平台独立 `supported` 才实现
- ✅ [US-504 Electron 本地文件存储](stories/plugin/US-504-electron-local-file-storage.md) — 文件落 `userData/rxdb-files`，与 US-207 的 SQLite 同一备份域
- 🅰️ 🚧 [US-207 Electron 连接本地 SQLite 文件](stories/adapter/US-207-desktop-local-database.md) — 四阶段单文件故事；见上方[进行中](#进行中4-条)
- 🅰️ 🚧 [US-210 Tauri 连接应用作用域 SQLite 文件](stories/adapter/US-210-tauri-sqlite-local-database.md) — 四阶段单文件故事；从 US-207 二次拆出，自写 Rust command 持有 `rusqlite::Connection`
- 🚧 [US-505 Tauri 本地文件存储](stories/plugin/US-505-tauri-local-file-storage.md) — US-504 的 Tauri 半边
- ⬜ [US-208 Electron PGlite 数据目录与事务宿主](stories/adapter/US-208-electron-pglite-data-directory.md) — PGlite callback transaction 不能跨 IPC 序列化
- ⬜ [US-703 PGlite 全文搜索](stories/future/US-703-pglite-full-text-search.md)

### [类型系统演进](epics/epic-005-type-system-evolution.md)

- ✅ [US-011 定义 bigint 与 binary 类型及公共 API 契约](stories/core/US-011-property-type-bigint-binary.md)
- ✅ [US-206 本地适配器持久化与查询 bigint/binary](stories/adapter/US-206-bigint-binary-adapter.md)
- ✅ [US-303 bigint/binary change codec 与系统迁移](stories/collaboration/US-303-bigint-binary-change-codec.md) — 迁移部分（AC10–AC14）已实现但未被真实发布行使
- ✅ [US-804 加密字段支持 bigint/binary](stories/future/US-804-bigint-binary-encryption.md)
- ✅ [US-903 DevTools 展示 bigint/binary](stories/future/US-903-bigint-binary-devtools.md)
- 🅰️ ✅ [US-012 扩展字段语义与前端通信契约](stories/core/US-012-field-semantic-metadata.md) — 三阶段单文件故事
  - ✅ 阶段 A 字段 format 声明与注册期校验
  - ✅ 阶段 B 实体字段描述 DTO
  - ✅ 阶段 C 字段值校验、format/enum/options 透传与三框架契约
- ✅ [US-019 拒绝重复声明的 URL scheme](stories/core/US-019-url-scheme-duplicate-rejection.md) — US-012 阶段 A 的收尾：`['HTTP','http']` 报 `invalidFormatConfig`，不做归一化
- ⬜ [US-018 生成器元数据序列化管线与 default 语义](stories/core/US-018-generator-default-serialization.md) — 从 US-012 拆出，与其无依赖，可并行

### [本地工作树与提交历史](epics/epic-006-working-tree-commits.md)

全部 ⬜ Backlog。**不得因分支名 `001-working-tree-commits` 或 spec 已齐而把任一条标成 In Progress。**
[specs/001-working-tree-commits/](../specs/001-working-tree-commits/) 已有 spec / plan / data-model / research / quickstart / contracts，**没有 `tasks.md`，运行时未开工**
（`packages/rxdb/src/` 无 `commit/`，无 `CommitManager` / `WorkingTreeManager` / `IndexManager` / `useWorkingTree`）。
交付顺序 **新 bridge 发布（FR-030）→ US-305 → US-306 阶段 A → B → C →（US-307 ∥ US-308）**，
口径以 [epic-006 依赖顺序](epics/epic-006-working-tree-commits.md) 为准。

- ⬜ [US-305 提交图与 HEAD 持久化](stories/collaboration/US-305-commit-graph-head.md) — 基础层：commit 图 / branch ref / baseline；仍被 FR-030 挡住（`migration-release.json` 的 `bridge.tag`/`bridge.version` 为 `null`，`v0.0.25` 不是 HEAD 祖先）
- 🅰️ ⬜ [US-306 工作树、缓存区与提交操作](stories/collaboration/US-306-working-tree-index.md) — 三阶段单文件故事；其 FR/AC 承接表是发布门禁 2 的审计依据
  - ⬜ 阶段 A 工作树写入捕获与持久化
  - ⬜ 阶段 B 缓存区与提交状态机
  - ⬜ 阶段 C 三框架工作树交互面与性能门禁 — `useWorkingTree()` 三端契约与 `bench-working-tree` target
- ⬜ [US-307 历史恢复会话](stories/collaboration/US-307-restore-session.md) — 依赖 US-306 阶段 A/B/C
- ⬜ [US-308 分支隔离与跨 realm 冲突检测](stories/collaboration/US-308-branch-isolation-conflict.md) — 依赖 US-306 的提交状态机；跨 realm 竞争只走 `headRevision` CAS

### [公开 API 门禁](epics/epic-007-public-api-gates.md)

- ⬜ [US-601 子路径入口纳入 API 表面基线](stories/tooling/US-601-subpath-api-surface-baseline.md) — 认领 [capability-matrix](capability-matrix.md#已知的需求覆盖缺口) 第 2 条缺口

[specs/002-lifecycle-effect-scope/spec.md](../specs/002-lifecycle-effect-scope/spec.md) 仍是 Draft；`packages/` 无 `LifecycleScope` 实现，YAML 保持 Backlog。

### [生命周期作用域](epics/epic-008-lifecycle-scope.md)

**US-013 → US-014 为硬序，不可交换。** US-014 完成时本 Epic 的三处已知泄漏全部关闭。

- ⬜ [US-013 LifecycleScope 生命周期作用域原语](stories/core/US-013-lifecycle-scope-primitive.md) — `@aiao/utils` 侧的原语，语义由测试冻结
- ⬜ [US-014 插件作用域契约](stories/core/US-014-plugin-scope-contract.md) — `install(scope)`，四个插件包迁移；独立关闭三处已知泄漏（graph 注册、storage 属性、workspace 订阅）
- 🅰️ ⬜ [US-015 插件依赖声明与按需装卸](stories/core/US-015-plugin-inject-dependency.md) — 两阶段单文件故事
  - ⬜ 阶段 A 适配器依赖纪元 — `inject: ['adapter:local']`，关闭 search 插件的 phase 机
  - ⬜ 阶段 B 插件间依赖图 — 拓扑序与环检测；**价值待证**，未证不开工
- ❔ `US-016` 连接纪元与停机收敛 — **文件未创建**；价值已证，待切片
- ❔ `US-017` 三框架宿主作用域 — **文件未创建**；价值待证

> ❔ = 已在其它文档中被引用、但 `stories/` 下没有对应文件，**因此不计入任何统计**。
>
> US-015 阶段 B 之后的每一条都要写出「今天用户踩得到的具体症状」，写不出就留在 Backlog——
> 这是过度设计判据，不是建议（见 [roadmap 约束 9](roadmap.md#排期约束)）。
>
> 本 Epic 会制造一次 `IRxDBPlugin` 成员签名变更（含 `destroy()` 由必选转可选），
> 而 [api-surface.mjs](../scripts/audit/api-surface.mjs) 只记录 `{name, kind}`，**成员怎么改都不产生 diff**。
> 该盲区由 US-014 用类型契约测试就地补上，不扩大 [epic-007](epics/epic-007-public-api-gates.md) 的范围。

## 前置阻塞（不体现在 Blocked 计数里）

以下故事的 YAML `status` 都不是 `Blocked`，但开工前有硬前置：

| 被挡住的                                                                                         | 硬前置                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| epic-006 整条链（链首 [US-305](stories/collaboration/US-305-commit-graph-head.md)，不是 US-306） | 首个真实 system schema 迁移发布，其 FR-030 要求 `migration-release.json` 指向一个位于发布主线祖先上的有效 bridge tag。该文件当前 `bridge.tag` / `bridge.version` 均为 `null`，历史 `v0.0.25` 又已被 squash 移出主线——**必须先从主线发布一个新的非迁移 bridge 版本**，见 [release-plan.md](release-plan.md)。这一条不随代码进度自动解除，需单独排期 |
| epic-008 中 US-014 之后的一切                                                                    | [US-013](stories/core/US-013-lifecycle-scope-primitive.md) → [US-014](stories/core/US-014-plugin-scope-contract.md) 是硬序；[US-015](stories/core/US-015-plugin-inject-dependency.md) 阶段 A 消费 US-014 的 `install(scope)` 签名，阶段 B 另需先证明用户价值                                                                                       |
| [US-904](stories/future/US-904-devtools-native-storage-contract.md) 阶段 D                       | 同一文件的阶段 A 必须先给出 `decision: supported`                                                                                                                                                                                                                                                                                                  |

> **US-210 AC#9 已于 2026-08-17 解除阻塞**，从本表移除。原判定「macOS 没有官方 WKWebView WebDriver，
> 该 AC 按字面无法满足」只对**用 WebDriver 驱 UI**这一种实现方式成立。改成
> 「环境变量触发自检模式 → 启动两次 → 断言计数器 1→2」后，三平台统一不使用 WebDriver，
> macOS 例外自然消失，比原方案更整齐。理由与代价见
> [US-210 AC#9 一节](stories/adapter/US-210-tauri-sqlite-local-database.md)。
>
> 真正的缺口从来不是技术性的：**仓库至今没有任何 macOS runner**。这不是阻塞，是没排期——
> 仓库是 public，标准 runner 免费，`ci-windows.yml` 里那句「2 倍计费」的成本理由不成立。
> **2026-08-17 已排上**：`.github/workflows/release-desktop.yml` 一条 release 触发的 workflow，
> 同时服务 US-207 AC#8、US-210 AC#9 与三条发布性质；决策与代价见
> [US-207「三平台打包 CI（阶段 2）」](stories/adapter/US-207-desktop-local-database.md#三平台打包-ci阶段-2)。
> **三平台的首轮结果尚未产生**——本机只跑得动 macOS，另两个平台要等 workflow 真被触发一次。
