# 排期与约束

> 本文回答「接下来做什么、什么必须排在什么前面」。当前状态见 [status-overview.md](status-overview.md)，发布执行见 [release-plan.md](release-plan.md)。
>
> 下表是**排期建议**，不改变各 story frontmatter 中的 `status`；实现时仍以对应 story 的验收标准为准。

## 功能建议

| 优先级 | 建议功能                            | 对应 story                                                                                                                   | 建议理由                                                                                                                            | 主要交付边界                                                                                                                              |
| :----: | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
|   P1   | 桌面本地 SQLite（Electron / Tauri） | [US-207](stories/adapter/US-207-desktop-local-database.md) / [US-210](stories/adapter/US-210-tauri-sqlite-local-database.md) | 补齐 Electron 与 Tauri 的文件持久化和重启恢复；两条路径共用 host 契约，缺一则桌面 Local-first 不完整                                | Electron `node:sqlite` 文件路径 + Tauri 应用作用域 SQLite、共享桌面 host 契约、类型化 IPC / Rust command、真实文件 smoke test             |
|   P1   | LifecycleScope 生命周期作用域原语   | [US-013](stories/core/US-013-lifecycle-scope-primitive.md)                                                                   | 同一件「登记副作用 → 拆卸时撤销」的事在仓库里被手工写了九遍，没有两处写法相同                                                       | `@aiao/utils` 侧的类与语义（逆序、幂等、异步、错误隔离、可嵌套），语义由测试冻结                                                          |
|   P1   | 插件作用域契约                      | [US-014](stories/core/US-014-plugin-scope-contract.md)                                                                       | 三处既有泄漏：graph 的 `destroy()` 是空的且契约里没有位置可写；`rxdb.storage` 断连一次即永久消失；workspace 拆卸后无法重装          | `install(scope)` 契约、`repository(name, config, scope?)`、四个插件包迁移、`destroy()` 转可选的废弃周期、类型契约测试                     |
|   P2   | 提交图与 HEAD 持久化                | [US-305](stories/collaboration/US-305-commit-graph-head.md)                                                                  | 旧暂存导出已在 `0.0.24` 删除，能力缺口现在完全敞开                                                                                  | 独立命名空间的新契约、commit 存储布局、baseline commit 与一次性迁移                                                                       |
|   P2   | 生成器 default 序列化与显式失败     | [US-018](stories/core/US-018-generator-default-serialization.md)                                                             | 今天 bigint `default` 直接抛原生 `TypeError`、`Uint8Array` 塌缩成 `{"0":1,...}`、函数工厂被静默丢弃，生成的客户端行为与源实体不一致 | 拆 JSON 往返改运行时分派、`default` → 源码字面量映射表、`unsupportedDefaultFactory` / `unsupportedDefaultValue`、`BREAKING CHANGE` 迁移表 |
|   P2   | Electron PGlite 数据目录与事务宿主  | [US-208](stories/adapter/US-208-electron-pglite-data-directory.md)                                                           | PGlite callback transaction 不能跨 IPC 序列化，需要 SQLite 路径不需要的事务 host 协议                                               | 主进程 data directory、事务 ID 协议或主进程托管 adapter、跨进程类型保真                                                                   |
|   P2   | PGlite 原生全文搜索                 | [US-703](stories/future/US-703-pglite-full-text-search.md)                                                                   | SQLite FTS5 已完成，PGlite 搜索缺口会造成适配器能力不对称                                                                           | `tsvector/GIN/trigger`、存量回填、`tsquery` 排序/snippet/分页、三框架 parity                                                              |
|   P2   | 子路径入口纳入 API 表面基线         | [US-601](stories/tooling/US-601-subpath-api-surface-baseline.md)                                                             | 版本策略把子路径承诺为公开 API，门禁却只扫主入口——承诺与门禁的差额只能靠人工审查补                                                  | 源入口声明收敛到单一真相源、基线格式扩到多入口、资产入口白名单跳过、三处文档收口                                                          |
|   P3   | 多端小程序宿主（先抽契约）          | [US-211 阶段 A](stories/adapter/US-211-multi-miniprogram-platforms.md)                                                       | Taro 有 `build:alipay/tt/qq/swan`，适配器只认 `wx`；先抽 host + 可行性矩阵，**不**扩大公开支持声明                                  | `MiniProgramHost`、微信路径零回归、`miniprogram-platform-feasibility.md`；B/C 只吃矩阵 `supported`                                        |

> US-306 / US-307 / US-308 不在本表单列——它们是 US-305 的后续交付，排期跟随
> [epic-006](epics/epic-006-working-tree-commits.md) 内部的固定依赖关系。
>
> [US-012](stories/core/US-012-field-semantic-metadata.md) 已 Done（阶段 A / B / C 全绿，2026-08-17），
> 不再作为建议功能列出；其 DTO 的 wire codec 不变量见下方约束 1。
>
> [US-015](stories/core/US-015-plugin-inject-dependency.md) 同理不单列——它排在 US-014 之后，
> 且阶段 B 的用户价值待证，见下方约束 8。

## 排期约束

1. US-012 已 Done（阶段 A / B / C 全绿，2026-08-17）。其 DTO 不得重新定义 `bigint/binary` 的值 wire codec
   ——该不变量随 DTO 发布而永久成立。
   [US-018](stories/core/US-018-generator-default-serialization.md) 与 US-012 **无依赖**，可独立推进；
   阶段 C 的透传只涉及 `format` / `enum` / `options` 三项 JSON-safe 数据，不碰生成器的序列化管线结构。
   US-018 含 `BREAKING CHANGE`（函数工厂 `default` 生成期抛错），必须与迁移表同 PR 发布。
2. US-207 已锁定 Electron SQLite 的真实连接语义并抽出共享桌面 host 契约
   （`rxdb-adapter-sqlite-core/desktop-host` 子路径，US-208 / US-210 复用）。「无法保证单连接事务时应
   fail-fast、不得降级成伪事务」作为长期铁律保留，对所有复用该契约的后端同样成立。
3. US-208 与 US-210 均排在 US-207 之后，复用其抽出的 host 契约。US-210 的事务方案已冻结：
   采用「Rust command 持有 `rusqlite::Connection`」（一个 session 一条连接，单连接语义由构造保证），
   「配置单连接池」因做不到（`sqlx` 池连续调用可能落在不同物理连接）被否决。US-208 的两种事务 host 方案
   （IPC 事务 ID 协议 / adapter 完整托管在主进程）仍在 Backlog 未选，选定前必须先通过同一套事务与事件测试再冻结。
4. [US-904](stories/future/US-904-devtools-native-storage-contract.md) 内部四阶段：
   共享链与 Electron 可行性门禁并行 **阶段 A ∥ (阶段 B → 阶段 C)**；只有 Electron 集成要求
   **阶段 A(supported) + 阶段 C + US-207 + US-504 → 阶段 D**。Tauri 按 **US-904 阶段 C → US-905** 推进，
   原生链为 **US-210 → US-505**，US-905 阶段 2 额外要求 **US-210 + US-505**，全程不等待 Electron MV3/US-904 阶段 D。
   US-904 阶段 C1（行为中性的面板抽取）不依赖协议冻结，可与阶段 B 并行开工；
   US-905 阶段 1（窗口/transport + fake provider）可与 US-210/US-505 并行。
5. US-305 的提交竞争只使用领域 `headRevision` CAS，不引入 writer lease 或迁移 epoch。US-305 的
   schema migration 前必须从当前发布主线产生新的有效 bridge ancestor；历史 `v0.0.25` 已脱离当前 ancestry。
   epic-006 内部顺序为 **US-305 → US-306 阶段 A → 阶段 B → 阶段 C →（US-307 ∥ US-308）**。
   US-307 / US-308 的核心持久层半边可与 US-306 阶段 C 并行开工，但三框架入口与 benchmark 采样必须复用
   阶段 C 冻结的 `useWorkingTree()` 契约与 `bench-working-tree` target，排在其后。
6. US-703 应复用现有搜索公开 API 和跨框架 parity fixture，不为 PGlite 增加 SQLite 专属 fallback。
7. US-209 已 Done，其**能力上限**转为长期口径：WAL、多页面并发、崩溃恢复保证在微信路径上不得扩大；
   文档一律写「实验性」，不得把微信路径列成与 wa-sqlite 同级的受支持适配器
   （落点见 [compatibility.md](../website/docs/compatibility.md) 的能力边界专节）。
   **平台集合**的扩展由 [US-211](stories/adapter/US-211-multi-miniprogram-platforms.md) 认领：
   阶段 A 先抽宿主契约并写可行性矩阵，仍写「仅微信」；阶段 B/C 只吃矩阵里 `decision: supported` 的平台，
   且新 host 继承同一套能力上限（单连接 / rollback journal / 无崩溃恢复 / ~10MB）。
   未关闭的阶段不得改公开支持声明。
   US-209 AC#8 顺带留下一个新缺口：`exports` 子路径入口的**导出表面**不受 api-surface 门禁保护
   （清单本身已由 `KNOWN_UNCOVERED_SUBPATHS` 核对），见
   [capability-matrix.md](capability-matrix.md) 的「已知的需求覆盖缺口」。
   该缺口由 [US-601](stories/tooling/US-601-subpath-api-surface-baseline.md) 认领；
   在它交付之前，改动这 12 个子路径入口的导出**必须在 PR 描述里人工声明破坏性**。
8. epic-008 内部 **US-013 → US-014** 为硬序。US-014 交付后三处已知泄漏全部关闭，
   因此 US-015 阶段 B 及其之后的每一条都必须写出**今天用户踩得到的具体症状**才允许排期；写不出就留在 Backlog。
   US-015 阶段 A 的症状已证（search 插件的 `adapterConnected$` + phase 机），可在 US-014 后直接排期；
   阶段 B（插件间依赖图）价值待证，未证不开工。`US-016` / `US-017` 同样未落盘。

## 建议补充的验收维度

- **故障恢复**：迁移者、桌面 host 或搜索索引初始化中途崩溃后，重试结果必须可预测且不可产生半状态。
- **能力矩阵**：SQLite family、PGlite、Electron、Tauri、Angular、React、Vue 的支持/不支持组合必须在 story 和公开文档中显式列出。
- **发布门禁**：新增公开 API 同步更新 API baseline、TSDoc、覆盖率门禁和跨框架 parity 测试。
- **可观测性**：连接、迁移、索引回填失败应提供稳定错误码和可诊断上下文，不静默回退到 memory、OPFS 或 IndexedDB。
