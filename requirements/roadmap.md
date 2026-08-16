# 排期与约束

> 本文回答「接下来做什么、什么必须排在什么前面」。当前状态见 [status-overview.md](status-overview.md)，发布执行见 [release-plan.md](release-plan.md)。
>
> 下表是**排期建议**，不改变各 story frontmatter 中的 `status`；实现时仍以对应 story 的验收标准为准。

## 功能建议

| 优先级 | 建议功能                             | 对应 story                                                               | 建议理由                                                                                                                   | 主要交付边界                                                                                                          |
| :----: | ------------------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
|   P1   | 字段 format 声明与注册期校验         | [US-012 阶段 A](stories/core/US-012-field-semantic-metadata.md)          | US-012 的地基：`FieldFormat` 判别联合不冻结，DTO 和值校验都无从落地                                                        | 16 个 format 接口、`PropertyType × format` 相容表、注册期聚合校验                                                     |
|   P1   | 实体字段描述 DTO                     | [US-012 阶段 B](stories/core/US-012-field-semantic-metadata.md)          | 让生成器、三框架和 DevTools 使用同一份字段语义，避免按字段名猜测展示规则                                                   | 派生 `cardinality/source`、`ENTITY_FIELDS_DTO_VERSION`、`describeEntityFields()` / `parseEntityFieldsDescriptor()`    |
|   P1   | Electron 桌面本地 SQLite             | [US-207](stories/adapter/US-207-desktop-local-database.md)               | 补齐桌面端文件持久化和重启恢复，扩大 Local-first 的实际使用场景                                                            | Electron **SQLite 文件**路径、共享桌面 host 契约、类型化 IPC、真实文件 smoke test                                     |
|   P1   | LifecycleScope 生命周期作用域原语    | [US-013](stories/core/US-013-lifecycle-scope-primitive.md)               | 同一件「登记副作用 → 拆卸时撤销」的事在仓库里被手工写了九遍，没有两处写法相同                                              | `@aiao/utils` 侧的类与语义（逆序、幂等、异步、错误隔离、可嵌套），语义由测试冻结                                      |
|   P1   | 插件作用域契约                       | [US-014](stories/core/US-014-plugin-scope-contract.md)                   | 三处既有泄漏：graph 的 `destroy()` 是空的且契约里没有位置可写；`rxdb.storage` 断连一次即永久消失；workspace 拆卸后无法重装 | `install(scope)` 契约、`repository(name, config, scope?)`、四个插件包迁移、`destroy()` 转可选的废弃周期、类型契约测试 |
|   P2   | 提交图与 HEAD 持久化                 | [US-305](stories/collaboration/US-305-commit-graph-head.md)              | 旧暂存导出已在 `0.0.24` 删除，能力缺口现在完全敞开                                                                        | 独立命名空间的新契约、commit 存储布局、baseline commit 与一次性迁移                                                   |
|   P2   | 字段值校验与生成器透传               | [US-012 阶段 C](stories/core/US-012-field-semantic-metadata.md)          | 有了 DTO 才谈得上运行时校验；单独成阶段以免和 DTO 一起变成不可验收的大块                                                   | `validateFieldValue()`、D12 归一化、生成器透传、三框架 fixture 复用                                                   |
|   P2   | Electron PGlite 数据目录与事务宿主   | [US-208](stories/adapter/US-208-electron-pglite-data-directory.md)       | PGlite callback transaction 不能跨 IPC 序列化，需要 SQLite 路径不需要的事务 host 协议                                      | 主进程 data directory、事务 ID 协议或主进程托管 adapter、跨进程类型保真                                               |
|   P2   | PGlite 原生全文搜索                  | [US-703](stories/future/US-703-pglite-full-text-search.md)               | SQLite FTS5 已完成，PGlite 搜索缺口会造成适配器能力不对称                                                                  | `tsvector/GIN/trigger`、存量回填、`tsquery` 排序/snippet/分页、三框架 parity                                          |
|   P2   | 子路径入口纳入 API 表面基线          | [US-601](stories/tooling/US-601-subpath-api-surface-baseline.md)         | 版本策略把子路径承诺为公开 API，门禁却只扫主入口——承诺与门禁的差额只能靠人工审查补                                         | 源入口声明收敛到单一真相源、基线格式扩到多入口、资产入口白名单跳过、三处文档收口                                      |

> US-306 / US-307 / US-308 不在本表单列——它们是 US-305 的后续交付，排期跟随
> [epic-006](epics/epic-006-working-tree-commits.md) 内部的固定依赖关系。
>
> [US-015](stories/core/US-015-plugin-inject-dependency.md) 同理不单列——它排在 US-014 之后，
> 且阶段 B 的用户价值待证，见下方约束 9。

## 排期约束

1. US-012 的 DTO 不得重新定义 `bigint/binary` 的值 wire codec。
   内部必须按 **阶段 A → 阶段 B → 阶段 C** 顺序交付，三个阶段同在
   [US-012](stories/core/US-012-field-semantic-metadata.md) 一个文件里。
2. US-207 必须先锁定 Electron SQLite 的真实连接语义并抽出共享桌面 host 契约；无法保证单连接事务时应 fail-fast，不得降级成伪事务。
3. US-208 与 US-210 均排在 US-207 之后，复用其抽出的 host 契约。US-208 的两种事务 host 方案（IPC 事务 ID 协议 /
   adapter 完整托管在主进程）、US-210 的两种事务方案（配置单连接池 / Rust command 持有事务）都必须先通过同一套事务与事件测试再冻结选择。
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
7. US-209 已 Done，其约束转为**长期口径**：小程序适配器的能力承诺不得扩大，
   WAL、多页面并发、崩溃恢复保证和微信以外的小程序平台都不在范围内；文档一律写「实验性」，
   不得把它列成与 wa-sqlite 同级的受支持适配器（落点见 [compatibility.md](../website/docs/compatibility.md) 的能力边界专节）。
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
