# 状态概览

> **真相源**：每个 story 的 YAML `status` 字段。本文件是派生视图，**不要**作为查询当前状态的唯一依据；如发现与 YAML 不一致，请优先信任 YAML 并修复本文件。
>
> 本文件**只回答「什么状态」**。排期与约束 → [roadmap.md](roadmap.md)；能力与覆盖缺口 → [capability-matrix.md](capability-matrix.md)；发布 → [release-plan.md](release-plan.md)。

## 状态汇总

| 状态           | 数量 |
| :------------- | :--- |
| ✅ Done        | 44   |
| 🚧 In Progress | 2    |
| 👀 In Review   | 1    |
| 📝 Backlog     | 9    |
| 🚫 Blocked     | 0    |
| **合计**       | 56   |

三条口径，读表前必知：

1. 数字由 `grep -h "^status:" requirements/stories/*/US-*.md | sort | uniq -c` 推导，**请勿手写维护**；合计等于 `stories/*/US-*.md` 的文件数，epic 文件不计入。
2. 其中 **9 条是多阶段故事**（[US-012](stories/core/US-012-field-semantic-metadata.md)、[US-015](stories/core/US-015-plugin-inject-dependency.md)、[US-020](stories/core/US-020-querycache-repository.md)、[US-207](stories/adapter/US-207-desktop-local-database.md)、[US-210](stories/adapter/US-210-tauri-sqlite-local-database.md)、[US-211](stories/adapter/US-211-multi-miniprogram-platforms.md)、[US-212](stories/adapter/US-212-http-adapter.md)、[US-306](stories/collaboration/US-306-working-tree-commits.md)、[US-904](stories/future/US-904-devtools-native-storage-contract.md)）：一个编号一个文件一条状态，正文用「交付阶段」表分批交付，**全部阶段关闭后才置 `Done`**。阶段不单独计数，见 [README](README.md#大故事用交付阶段不用子故事文件)。
3. `🚫 Blocked = 0` 统计的是**故事 YAML 里显式写成 `status: Blocked`** 的数量，**不代表没有前置阻塞**——见下方[前置阻塞](#前置阻塞不体现在-blocked-计数里)。两者不要互相推断。

图例：✅ Done · 🚧 In Progress · 👀 In Review · ⬜ Backlog · 🅰️ 多阶段故事 · 🚫 Blocked

## 进行中（2 条）

| Story                                                                                         | 卡在哪                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [US-505 Tauri 本地文件存储](stories/plugin/US-505-tauri-local-file-storage.md)                | AC#6 / #7 的两个前置（`apps/dev-rxdb-tauri-e2e` project、三平台打包矩阵）已由 US-210 建好，缺的只剩 US-505 自己的 specs；AC#1/#3/#5/#8 仍 ⚠️。随包化搬迁的 S1～S5 已于 2026-08-18 全部关闭，但搬迁**不解**上述任何一条缺口 |
| [US-904 DevTools 原生本地存储调试](stories/future/US-904-devtools-native-storage-contract.md) | 阶段 B 已交付（5 条 fake 关不掉的 AC 保留）；阶段 A / C / D 未开始                                                                                                                                                         |

## 待评审（1 条）

| Story                                                                            | 收尾条件                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [US-015 插件依赖声明与按需装卸](stories/core/US-015-plugin-inject-dependency.md) | 阶段 A 已交付（AC#1～12、18、20；AC#12 的 `ready` 语义有意改口径）。阶段 B（AC#13～17）与 AC#19 已移出承诺范围，**解锁条件 = 出现第一个 `plugin:*` 依赖声明**；未解锁前本故事停在 `In Review`，不置 `Done` |

> US-207 / US-210 / US-505 的三条尾巴曾是**同一个下游缺口**：真实打包应用的重启与三平台矩阵。
> 该缺口已于 2026-08-17 补上（`release-desktop.yml` + 两个 e2e project），US-505 只剩自己的 specs。
>
> **桌面包边界重整（已全部收口；横跨 US-207 / US-210 / US-505 / US-504）**：
> `@aiao/rxdb-adapter-desktop` 拆成 `@aiao/rxdb-adapter-electron` 与 `@aiao/rxdb-adapter-tauri`，
> 共享协议与 renderer client 下沉 `rxdb-adapter-sqlite-core/desktop-host` 子路径，`desktop` 这个包名消失。
> **JS 侧于 2026-08-18 全部关闭**（US-207 E1～E11 与 US-210 T3、US-505 S3+S4）：拆包本体、
> `ADAPTER_NAME` 分裂、api-baseline 拆分、`pnpm pack` 产物上的三条发布性质、迁移文档、
> 两个 demo 同构的 `selectLocalBackend()` 与页面展示、以及 E11 那道**产物**门禁
> （`scripts/audit/desktop-lazy-backend.mjs`，实测 electron 首屏 9 / 惰性 39，tauri 首屏 4 / 惰性 41）。
> **Rust 侧同日关闭**（US-210 T1/T2/T4～T7 与 US-505 S1+S2）：Tauri 的 Rust 宿主搬到
> `packages/rxdb-adapter-tauri/rust/`（普通 crate，`publish = false`，本轮不发 crates.io），
> 一致性套件搬到该包 `conformance/`，`apps/dev-rxdb-tauri/src-tauri/` 只剩
> `main.rs` / `lib.rs` / `selfcheck.rs` 并**反过来 path 依赖这个 crate**——demo 依赖包，
> 正是包化的验收方式本身。实测 `test-conformance` 10 文件 605 条 0 skipped、
> `cargo test` 147 条（迁包前后一条不差）、`tauri-build` 六道 cargo 门禁全绿。
> US-504 只需事后同步路径。
>
> **~~后续项（无人认领，从 US-207 溢出）~~ 已关（2026-08-20）**：`rxdb-adapter-sqlite-core` /
> `rxdb-plugin-storage` / `utils` 三个包的 `package.json` 已补上 `"sideEffects": false`。
> E11 用「主 chunk 里只抄字面量、一个符号都不从 barrel 取」把桌面 demo 这条路堵在**调用方**，
> 补声明是在**包这一侧**收紧。「误标 `false` 摇掉真有副作用的模块」的风险已逐包排除：
> 无裸 `import 'x'`、无顶层执行语句、无模块级全局写入，`@Entity` 只把 metadata 挂到类自身、
> 实体靠 `entities` 数组显式注册。三包 `lint` / `test` / `build` 复跑全绿。背景见
> [US-207「barrel 会把实现一起带进主 chunk」](stories/adapter/US-207-desktop-local-database.md#barrel-会把实现一起带进主-chunk)。
>
> `ADAPTER_NAME` 的分裂已于 2026-08-17 落定：`desktop` → `sqlite-electron` / `sqlite-tauri` / `pglite-electron`
> （PGlite 单列，归 US-208），依据与 7 项连带改动见
> [US-207「已落定的决策」](stories/adapter/US-207-desktop-local-database.md#已落定的决策adapter_name-分裂2026-08-17)。
> **Rust 宿主形态**已于 2026-08-18 落定：做成**普通 crate**，宿主应用自己 `generate_handler!` 注册命令——
> 应用命令不过 capability 闸门（只有 `core:` / `plugin:` 前缀才过），因此 US-210 AC#1 与
> US-505「`capabilities/` 零改动」的论证原样成立，不需要重写。
> `@aiao/rxdb-adapter-desktop@0.0.25` 保留在 registry 上、未来仍可更新，**不打 `deprecated` 标记**
> （2026-08-18 判定，见 US-207 E6）；迁移路径由 `website/docs/migration/desktop-split.md` 指路。
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
- ✅ [US-203 Supabase 适配器](stories/adapter/US-203-supabase-adapter.md) — AC#6 QueryCache ducks 已 ✅；**生产路径接线**是 [US-020](stories/core/US-020-querycache-repository.md)，不重开本故事
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
- 🅰️ ✅ [US-207 Electron 连接本地 SQLite 文件](stories/adapter/US-207-desktop-local-database.md) — 四阶段单文件故事，2026-08-18 四阶段全关；桌面包边界重整的 JS 侧收在这里
- 🅰️ ✅ [US-210 Tauri 连接应用作用域 SQLite 文件](stories/adapter/US-210-tauri-sqlite-local-database.md) — 四阶段单文件故事，2026-08-18 四阶段全关；从 US-207 二次拆出，自写 Rust command 持有 `rusqlite::Connection`；桌面包边界重整的 Rust 侧收在这里
- 🚧 [US-505 Tauri 本地文件存储](stories/plugin/US-505-tauri-local-file-storage.md) — US-504 的 Tauri 半边
- ⬜ [US-208 Electron PGlite 数据目录与事务宿主](stories/adapter/US-208-electron-pglite-data-directory.md) — PGlite callback transaction 不能跨 IPC 序列化
- ⬜ [US-703 PGlite 全文搜索](stories/future/US-703-pglite-full-text-search.md)
- 🅰️ ✅ [US-020 将 QueryCache 接入统一 Repository](stories/core/US-020-querycache-repository.md) — 两阶段，2026-08-22 全关；`SyncType.QueryCache` 从空操作变成生产真，**US-212 的两档发布门禁同时解锁**。不 inherit US-203 AC#6
  - ✅ 阶段 A 生产接线 — `getRepository` / EntityManager 走 `QueryCacheRepository`；Full/Filter 不变
  - ✅ 阶段 B 缓存质量 — orphan 删除、指纹含模式、SWR SQL、错误分类；AC#21 由接真实 sqlite-wasm 的 identity 集成用例关闭（顺带揪出 `updatedAt` 解码成 `Date` 后新鲜度恒判 fresh、与 `upsertMany` 裸 SQL 写不维护 identity cache 两个静默缺陷），AC#23 由 D13 的 `syncStaleTime` 同步记忆窗口关闭
- 🅰️ ✅ [US-212 HTTP 远程适配器](stories/adapter/US-212-http-adapter.md) — 两阶段，2026-08-24 全关，**零前置**。远端权威 HTTP + 独立注册 sqlite 行缓存，不内嵌 sqlite。**排期已提到 [roadmap 批次 1 线 F](roadmap.md#批次-1零前置七条线可同时开工)**；两条历史锁均已解除：epic-006 的「不得在 US-306 阶段 A 前发布」于 2026-08-22 解除，US-020 的两档发布门禁随 US-020 两阶段全关于同日解除。现存的唯一硬约束是 [roadmap 约束 11](roadmap.md#排期约束) 的**结构隔离**不变量（本包 MUST NOT 实现或调用 `upsertMany` / `deleteByIds` / `getMetadataByIds`，MUST NOT 持有本地存储），落在 [US-212 AC#19](stories/adapter/US-212-http-adapter.md)。**阶段 A 已于 2026-08-23 关闭**（`@aiao/rxdb-adapter-http` 185 条用例绿、覆盖率 99%、API baseline 无变化），具名适配器计数随之 9 → 10。**阶段 B 的 AC#27（REST resource URL 模板 `createRestHandlers()`）同日交付**，包内 216 条用例绿；**阶段 B 的 owner 判定已于 2026-08-24 完成**：AC#28（ETag / If-None-Match）判给**本包**——304 的语义本身担保缓存有效性，响应缓存与 single-flight 都在 transport 层内，不需要 core 新 API、不越 AC#19；AC#29（SSE / invalidation）与 AC#30（eviction）**拿不到 owner，已移出本故事**，按 US-016 / US-017 先例登记进 [roadmap「明确不排期」](roadmap.md#明确不排期)并写明解锁条件、不建故事文件。**AC#28 同日实现并关闭**（`conditional-cache.ts` 的有界 LRU + single-flight，`conditionalRequests` **缺省关闭**、关闭时与阶段 A 逐字相同；包内 245 条用例绿、覆盖率 99%、API baseline 无变化）。34 条 AC 全绿，故事置 `Done`
  - ✅ 阶段 A handlers 注入 + QueryCache ducks + 分页/分块 + QueryCache-only 写路径契约测试
  - ✅ 阶段 B — REST resource URL 模板（AC#27，`createRestHandlers()`）+ ETag / If-None-Match（AC#28，`conditional-cache.ts`，缺省关闭）；SSE 与 eviction（AC#29 / AC#30）在 2026-08-24 的 owner 判定里拿不到 owner，**已移出本故事**，见上一行与 [roadmap「明确不排期」](roadmap.md#明确不排期)
- ⬜ [US-213 HTTP 适配器 wire 级集成测试](stories/adapter/US-213-http-wire-integration-test.md) — US-212 的验收补票，**不重开该故事**：本包 9 个 spec 里 6 个在 `vi.stubGlobal('fetch')` 层拦截（另三个是零桩纯单元测试），transport 从未被真实 socket 打过，`http-protocol.md` 已随 `stable` 对外却无可执行验收。零依赖 `node:http` 参考后端 + 真实 fetch，17 条 AC，纯测试资产不改 `src/`；协议缺陷另开故事（[roadmap 约束 13](roadmap.md#排期约束)）。排期在 [批次 3](roadmap.md#批次-3能力与验证补齐无硬前置按价值排在后面)

### [类型系统演进](epics/epic-005-type-system-evolution.md)

**八条故事已全部 Done（US-018 于 2026-08-24 收尾），但 epic 仍是 `In Progress`——这是有意的，不是漏改。**
[epic-005 的发布门禁](epics/epic-005-type-system-evolution.md#发布门禁)有 6 条，条件 1（五条 bigint/binary 故事全 Done）
已成立，条件 2～6 是**发布动作与回归 gate**（共享 adapter gate、旧库升级/回滚 fixture、public type compatibility、
encrypted 与 DevTools 回归、公开文档六项说明），需要一次独立审计逐条留证后才能置 `Done`。
故事清单全绿 ≠ 门禁成立，不要据前者推后者。

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
- ✅ [US-018 生成器元数据序列化管线与 default 语义](stories/core/US-018-generator-default-serialization.md) — `BREAKING CHANGE`：函数工厂 `default` 由静默丢弃改为生成期 `unsupportedDefaultFactory`；迁移表见 [website/docs/migration/generator-default.md](../website/docs/migration/generator-default.md)

### [本地工作树与提交历史](epics/epic-006-working-tree-commits.md)

全部 ⬜ Backlog。**不得因分支名 `001-working-tree-commits` 或 spec 已齐而把任一条标成 In Progress。**
[specs/001-working-tree-commits/](../specs/001-working-tree-commits/) 已有 spec / plan / data-model / research / quickstart / contracts，**没有 `tasks.md`，运行时未开工**
（`packages/rxdb/src/` 无 `commit/`，无 `CommitManager` / `WorkingTreeManager` / `IndexManager` / `useWorkingTree`）。
交付顺序 **新 bridge 发布（FR-030）→ US-305 → US-306 阶段 A → B → C →（US-307 ∥ US-308）**，
口径以 [epic-006 依赖顺序](epics/epic-006-working-tree-commits.md) 为准。

- ⬜ [US-305 提交图与 HEAD 持久化](stories/collaboration/US-305-commit-graph-head.md) — 基础层：commit 图 / branch ref / baseline；仍被 FR-030 挡住（`migration-release.json` 的 `bridge.tag`/`bridge.version` 为 `null`，`v0.0.25` 不是 HEAD 祖先）
- 🅰️ ⬜ [US-306 工作树与提交操作](stories/collaboration/US-306-working-tree-commits.md) — 三阶段单文件故事；其 FR/AC 承接表是发布门禁 2 的审计依据
  - ⬜ 阶段 A 工作树写入捕获与持久化
  - ⬜ 阶段 B 提交状态机（status / diff / commit / discard，无暂存区）
  - ⬜ 阶段 C 三框架工作树交互面与性能门禁 — `useWorkingTree()` 三端契约与 `bench-working-tree` target
- ⬜ [US-307 历史恢复会话](stories/collaboration/US-307-restore-session.md) — 依赖 US-306 阶段 B；核心持久层可与阶段 C 并行，三端入口与 restore benchmark 追加排在阶段 C 之后
- ⬜ [US-308 分支隔离与跨 realm 冲突检测](stories/collaboration/US-308-branch-isolation-conflict.md) — 依赖 US-306 阶段 B；核心持久层可与阶段 C 并行，三端入口排在阶段 C 之后。跨 realm 竞争走 activation / head / working-tree 三类 revision CAS（FR-020），不是只走 `headRevision`

### [公开 API 门禁](epics/epic-007-public-api-gates.md)

- ✅ [US-601 子路径入口纳入 API 表面基线](stories/tooling/US-601-subpath-api-surface-baseline.md) — 2026-08-24 关闭，[capability-matrix](capability-matrix.md#已知的需求覆盖缺口) 第 2 条缺口随之关闭。基线扩为 `{ entries: {...} }`，30 包 44 入口（净增 14 个子路径入口 / 203 个新纳入守护的符号），主入口表面逐字节不变；源入口收敛到 `package.json` › `exports` › `@aiao/source` 一处真相源。仅剩 2 个资产入口显式跳过（由 wa-sqlite-integrity 的 SHA-256 守护，不是缺口）

[specs/002-lifecycle-effect-scope/spec.md](../specs/002-lifecycle-effect-scope/spec.md) 仍是 Draft，但范围已与 Epic 承诺范围对齐（US-013 / US-014 / US-015 阶段 A；阶段 B 与 US-016 / US-017 标为已移出，后两者不创建故事文件）。原语已落在 [`packages/utils/src/lifecycle/`](../packages/utils/src/lifecycle/)，四个插件包已全部迁移到 `install(scope)`。

### [生命周期作用域](epics/epic-008-lifecycle-scope.md)

**Epic 已置 `Done`。** US-013 → US-014 的硬序已随两条交付解除。改造前的九处手工账本已关闭 8 条、改判 1 条（`#event_initialized` 不是泄漏），[结算表](epics/epic-008-lifecycle-scope.md#结算九处手工账本)零未关闭行。

- ✅ [US-013 LifecycleScope 生命周期作用域原语](stories/core/US-013-lifecycle-scope-primitive.md) — `@aiao/utils` 侧的原语，19 条 AC 由 26 个用例冻结；只交付原语，不迁移任何调用方
- ✅ [US-014 插件作用域契约](stories/core/US-014-plugin-scope-contract.md) — `install(scope)`，四个插件包已迁移；三处已知泄漏（graph 注册、storage 属性、workspace 订阅）关闭。三处有意的可观察行为变化见 [插件作用域契约迁移](../website/docs/migration/plugin-scope.md)
- 🅰️ [US-015 插件依赖声明与按需装卸](stories/core/US-015-plugin-inject-dependency.md) — 阶段 A 已交付，故事置 `In Review`
  - ✅ 阶段 A 适配器依赖纪元（2026-08-21）— `inject: ['adapter:local']` + 纪元调度器 + `localAdapterSync`；search 插件的 `adapterConnected$` 自等与 `SearchPluginPhase` 删除，安装记账从 `#plugin_install_promises` 迁进调度器。AC#12 的 `ready` 语义**有意改口径**（未安装期由 reject 改为 pending），见[插件作用域契约迁移](../website/docs/migration/plugin-scope.md)
  - ⬜ 阶段 B 插件间依赖图 — **已移出承诺范围**：全仓库零 `plugin:*` 声明。解锁条件 = 出现第一个消费方
- ✅ `init()` 失败回滚补齐与 `#shutdown()` 对称的资源三步（`versionManager` / `#gateway` / `entityManager` 的 `destroy()`）— Epic 的最后一行未关闭项，按 bugfix 修，**未单开故事**。漏掉网关时 `multiInstance` 默认下每失败一次泄漏一条 BroadcastChannel 加一套 LeaderElection

> `US-016` / `US-017` 曾被引用为后续故事，现已按 Epic 收口判据改判移出，不再是候选项——
> 理由与解锁条件见 [epic-008 已移出承诺范围](epics/epic-008-lifecycle-scope.md#已移出承诺范围)。
>
> 进入本 Epic 的两条判据要同时满足：是「资源获取与释放拆成两处」的问题，且能写出今天用户踩得到的
> 具体症状。**状态变量复位不算病灶**——原语按定义碰不到它。这是过度设计判据，不是建议
> （见 [roadmap 约束 9](roadmap.md#排期约束)）。
>
> 本 Epic 已制造一次 `IRxDBPlugin` 成员签名变更（`destroy()` 由必选转可选、新增可选 `lifecycle`、
> `install()` 收形参），而 [api-surface.mjs](../scripts/audit/api-surface.mjs) 只记录 `{name, kind}`，
> **成员怎么改都不产生 diff**。该盲区已由 US-014 的类型契约测试
> [plugin-scope-contract.spec.ts](../packages/rxdb/src/__tests__/contracts/plugin-scope-contract.spec.ts)
> 就地补上，未扩大 [epic-007](epics/epic-007-public-api-gates.md) 的范围。

## 前置阻塞（不体现在 Blocked 计数里）

以下故事的 YAML `status` 都不是 `Blocked`，但开工前有硬前置：

| 被挡住的                                                                                         | 硬前置                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| epic-006 整条链（链首 [US-305](stories/collaboration/US-305-commit-graph-head.md)，不是 US-306） | 首个真实 system schema 迁移发布，其 FR-030 要求 `migration-release.json` 指向一个位于发布主线祖先上的有效 bridge tag。该文件当前 `bridge.tag` / `bridge.version` 均为 `null`，历史 `v0.0.25` 又已被 squash 移出主线——**必须先从主线发布一个新的非迁移 bridge 版本**，见 [release-plan.md](release-plan.md)。这一条不随代码进度自动解除，需单独排期       |
| [US-015](stories/core/US-015-plugin-inject-dependency.md) 阶段 B                                 | 出现第一个 `plugin:*` 依赖声明。全仓库唯一的 `inject` 是 search 的 `['adapter:local']`，拓扑序与环检测目前没有消费方。US-013 / US-014 均已交付，硬序解除，阶段 A 已落地；这一条不随代码进度自动解除。**其余 11 条未关闭故事没有任何一条会产生 `plugin:*` 消费方，所以 US-015 的 `In Review` 是稳态而非过渡态**，上方汇总里的「👀 1」在可预见排期内是常量 |
| [US-904](stories/future/US-904-devtools-native-storage-contract.md) 阶段 D                       | 同一文件的阶段 A 必须先给出 `decision: supported`。判 `unsupported` 时**只有阶段 D** 转 `Blocked`，阶段 B / C 与 US-905 继续推进                                                                                                                                                                                                                         |

> **US-212 发布门禁已于 2026-08-22 解除**，从本表移除。原两档门禁（[US-020](stories/core/US-020-querycache-repository.md)
> 阶段 A 关闭才可标 `experimental`、阶段 B 关闭才可标 `stable`）成立的前提是「QueryCache 配了等于空操作」，
> 而 US-020 两阶段当天全关，`SyncType.QueryCache` 已是生产真，前提消失。**US-212 现在零前置，关闭阶段 A 即可直接发 `stable`**，
> README / npm 不再需要写 `experimental`。留档见 [roadmap 约束 10](roadmap.md#排期约束)。
> 注意这不等于该包没有约束：[约束 11](roadmap.md#排期约束) 的结构隔离不变量仍在，只是它是**编码约束**不是排期前置。
>
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
> ~~**三平台的首轮结果尚未产生**~~ **已产生（2026-08-17 首跑，2026-08-19 复跑，两次全绿）**：
> `release-desktop.yml` 不只在 release 上触发，它对**改动自身**的 PR 也触发，落地当天那条 PR 就是首跑。
> `electron-smoke` × 3 + `tauri-smoke` × 3 + `adapter-consumer` + `gate` 全 success
> （[run 32075648469](https://github.com/aiao-io/rxdb/actions/runs/32075648469) /
> [run 32311812029](https://github.com/aiao-io/rxdb/actions/runs/32311812029)），Windows / Linux 不再是零实测。
> **但它不覆盖 US-505**：那条故事的 AC#6 / #7 缺的是 `dev-rxdb-tauri-e2e` 里尚未写出的 specs，
> 写完后仍需一次 `workflow_dispatch` 才跑得到，见 [roadmap 零散收尾项第 4 条](roadmap.md#零散收尾项不成故事随手可带)。
