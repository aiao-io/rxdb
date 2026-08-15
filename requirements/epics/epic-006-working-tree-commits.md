---
id: epic-006-working-tree-commits
status: Backlog
startDate: TBD
targetDate: TBD
owner: jimmy
---

# 本地工作树与提交历史

## 愿景

把 RxDB 的本地变更组织成 Git 式工作流：用户刷新页面、重启应用或意外关闭后，工作树、缓存区、当前提交和历史恢复结果仍然存在且语义一致，且不引入 Git 的远程仓库、权限与代码评审。

## 为什么是 Epic 而不是一个 Story

原 [US-305](../stories/collaboration/US-305-commit-graph-head.md) 单个故事持有 4 个用户故事、28 条 FR、7 个关键实体，横跨 `packages/rxdb/src/version/`、`packages/rxdb/src/system/`、`rxdb-plugin-workspace`、三个框架包和三个 demo。它的 INVEST 里 `Small` 打了勾，但没有任何一条 FR 可以在不落地存储布局的前提下单独验收——即"要么全做要么全不做"，这正是 Small 不成立的定义。拆分后每个故事都能独立跑通「写入 → 刷新 → 读回」这条最小闭环。

## 术语（与既有 Workspace 插件的命名冲突处置）

`Workspace` 前缀**已经被占用**：`@aiao/rxdb-plugin-workspace` 的 NEW 草稿缓存在 api-baseline 中导出了 `WorkspaceCacheEntry`、`WorkspaceCacheId`、`WorkspaceCorruptedEntry`、`WorkspaceFlushError`（见 [rxdb-plugin-workspace.json](../api-baseline/rxdb-plugin-workspace.json)）。原 US-305 又把 Git working tree 也叫 workspace，并计划导出 `WorkspaceState` / `WorkspaceConflict`——同一个前缀、两个毫不相干的概念。原 FR-028 只禁止了「与已删除导出同名同签名」，没禁止「同前缀不同义」，而后者才是真正会让读者读错代码的部分。

本 Epic 定死：

| 概念               | 中文     | 导出前缀       | 归属                               |
| ------------------ | -------- | -------------- | ---------------------------------- |
| Git working tree   | 工作树   | `WorkingTree*` | 本 Epic 新契约                     |
| index / staging    | 缓存区   | `Index*`       | 本 Epic 新契约                     |
| commit / commit 图 | 提交     | `Commit*`      | 本 Epic 新契约                     |
| NEW 草稿本地缓存   | 草稿缓存 | `Workspace*`   | 既有 `@aiao/rxdb-plugin-workspace` |

新契约里**不得**出现 `Workspace` 前缀的新导出；文档与 story 正文中"工作区"一词只指草稿缓存。

## 横切约束（保留 FR 编号，按适用性分配到各故事 DoD）

原 US-305 把三框架对称（FR-024）、a11y（FR-025）、异步状态（FR-023）和禁止复活旧导出（FR-028）各写成一条 FR，读起来像"最后统一补"。按仓库铁律，单端实现即未完成，所以这四条是各故事自己的完成条件。

这四条**保留原 FR 编号**并以本节为唯一正文，故事不重述——这样 tasks.md 与 `/speckit-analyze` 的 FR → task 覆盖检查仍能看到它们。但它们**按适用性生效**，不是无条件套给每个故事：

| 编号       | 要求                                                                                                     | 适用范围                                    |
| ---------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **FR-023** | 所有异步操作暴露 loading / success / empty / error；错误说明操作、对象与恢复建议                         | 凡暴露异步公开 API 的故事（全部五个）       |
| **FR-024** | 三框架对称：Angular / React / Vue 的命名、参数、状态转换与错误语义一致；任一端缺失该故事不得标 Done      | **仅**暴露框架绑定的故事（US-306b/307/308） |
| **FR-025** | 可访问性：键盘可达、焦点可见、状态与错误可被屏幕阅读器读出，达到 WCAG 2.1 AA；不得只有图标没有可访问名称 | **仅**交付 UI 的故事（US-306b/307）         |
| **FR-028** | 不复活旧导出：新导出不得与已删除导出同名同签名，也不得使用 `Workspace` 前缀（见上表）                    | 全部故事                                    |

FR-028 指的已删除导出是 `stagedChange()` / `unstageChange()` / `commit()` / `stagedCount` 与 `WorkspaceCacheEntry.staged`，已在 `0.0.24` 删除，见 [rxdb-plugin-workspace/README.md 的「已移除 API」](../../packages/rxdb-plugin-workspace/README.md#已移除-api)。

**适用性的判定规则**：一条横切 FR 只在故事的**实现文件清单里有对应交付面**时才生效。不允许"要求写在 DoD 里、交付物里没有对应文件"这种空转，反向也不允许"有交付面却不受约束"。逐条裁决：

| 故事    | FR-024（三端对称）           | FR-025（a11y） | 依据                                                          |
| ------- | ---------------------------- | -------------- | ------------------------------------------------------------- |
| US-305  | 不适用                       | 不适用         | 纯存储层，无框架包、无 UI                                     |
| US-306a | 不适用                       | 不适用         | 核心状态机与存储，绑定层已拆出到 US-306b                      |
| US-306b | **适用**（该 FR 的主要落点） | **适用**       | 交付三端绑定 + 三端 demo                                      |
| US-307  | **适用**                     | **适用**       | 交付三端恢复入口 + `apps/dev-rxdb-{angular,react,vue}/` 演示  |
| US-308  | **适用**                     | 不适用         | 只交付绑定层冲突状态，实现文件里**没有** `apps/dev-rxdb-*` UI |

发布门禁 MUST NOT 用不适用的 FR 卡对应故事。若 plan 阶段改变了某故事的交付面（例如把 `log()` / `show()` 的三端只读绑定并入 US-305，或给 US-308 补一个冲突提示 demo），MUST 同时更新本表与该故事的实现文件清单，对应 FR 随之生效。

## 适用的存储后端（正确性口径）

「commit、HEAD 与业务数据在同一提交屏障内可恢复」直接依赖适配器级跨表事务。

**判定依据不是「有没有 `transaction()` 实现」**：[rxdb-adapter.ts:139](../../packages/rxdb/src/rxdb-adapter.ts#L139) 的 `transaction()` 是 `abstract` 方法，**每个**适配器都必须实现，supabase 与 miniprogram 也不例外；miniprogram 更是 `extends RxDBAdapterSqliteBase`，它的事务代码与被列入 MUST 档的 sqlite-wasm / wa-sqlite **是同一份**。真正的判定依据是**事务语义与可验证性**：能否提供本地、同步、跨表的 ACID 屏障，且该屏障能在 CI 里被崩溃恢复 fixture 验证。上一节只限定了**性能**基准环境，正确性口径必须单独声明：

| 适配器                                                                             | v1 要求                                             | 依据                                                                                                                                                                                |
| ---------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pglite                                                                             | MUST 通过全部一致性与崩溃恢复 fixture               | 本地 Postgres 事务；现有两个 bench 的基准环境                                                                                                                                       |
| sqlite-wasm / sqlite（@sqlite.org）/ wa-sqlite / sqliteai / desktop（node-sqlite） | MUST 通过全部一致性与崩溃恢复 fixture               | 五者均 `extends RxDBAdapterSqliteBase`，共用 [sqlite-core](../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts) 的本地事务实现                                     |
| supabase                                                                           | v1 **不承诺**；启用 commit 能力时 MUST 显式报错拒绝 | 写入走远端 RPC，无本地跨表提交屏障                                                                                                                                                  |
| `wa-sqlite-miniprogram`（miniprogram 包）                                          | v1 **不承诺**；启用 commit 能力时 MUST 显式报错拒绝 | **不是**因为缺事务实现（见上）；而是实验性 + 微信逻辑层强制单连接，且本包不在 [coverage-baseline.json](../../scripts/audit/coverage-baseline.json) 内、无法在 CI 跑崩溃恢复 fixture |

判定值是**适配器实例的 `name` 属性**（= 各包导出的 `ADAPTER_NAME`），不是包名、也不是注册键，落地口径见 [US-305 FR-032](../stories/collaboration/US-305-commit-graph-head.md)。注意 miniprogram 包的 `ADAPTER_NAME` 是 [`'wa-sqlite-miniprogram'`](../../packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L100) 而**不是** `'miniprogram'`——名单按前者书写。

三条维护约束：

1. 本表 MUST 穷举 `packages/rxdb-adapter-*` 下**全部具备 `ADAPTER_NAME` 的**适配器（当前 8 个：`pglite` / `sqlite-wasm` / `sqlite` / `wa-sqlite` / `sqliteai` / `desktop` / `supabase` / `wa-sqlite-miniprogram`）。新增适配器时 MUST 同步补一行显式裁决；在补齐之前，未列出的适配器按 FR-032 走拒绝路径。
   > `rxdb-adapter-sqlite-core` 与 `rxdb-adapter-encrypted` 是包目录但**不是适配器**：前者是被 5 个 SQLite 系适配器继承的抽象基类，后者不导出任何 `IRxDBAdapter` 实现（其 [index.ts](../../packages/rxdb-adapter-encrypted/src/index.ts) 只导出 `Keyring`、信封编解码与错误类型，由 sqlite-core / pglite **内部消费**）。两者都不出现在 `name` 判定的值域里，因此**不入本表**——旧版本表里"encrypted 是装饰层、guard 需先解包"的说法建立在一个不存在的包装适配器上，已删除。加密开启与否不改变适配器身份，见 [US-305 AC User Story 2 场景 8](../stories/collaboration/US-305-commit-graph-head.md)。
2. `desktop` 当前**也不在** coverage-baseline 内（[US-207](../stories/adapter/US-207-desktop-local-database.md) 仍 In Progress）。把它留在 MUST 档意味着本 Epic 的适配器矩阵门禁**依赖 US-207 先把该包纳入覆盖率门禁**；若 US-207 未能及时完成，desktop MUST 临时降级到「不承诺」档而不是无门禁地留在 MUST 档。
3. 本表与 [status-overview 的存储适配器表](../status-overview.md) MUST 保持一致。本 Epic 的适配器裁决**以本表为准**，status-overview 是派生视图；两边不一致时先修 status-overview。（旧版 encrypted 行的错误描述正是从 status-overview 传导进来的。）

按仓库「无 fallback」铁律，在不支持的后端上启用 commit 能力 MUST 拒绝并报错，**不得**静默降级为内存态或"尽力而为"的非事务写入。落地条款见 [US-305 FR-032](../stories/collaboration/US-305-commit-graph-head.md)。

## 依赖顺序

1. [US-304](../stories/collaboration/US-304-writer-lease-migration-fencing.md) 必须先 Done —— 跨 realm 校验复用其 writer lease / epoch，本 Epic 不允许另起一套协调协议
2. [US-305](../stories/collaboration/US-305-commit-graph-head.md) 建立 commit 图、HEAD、存储布局、基线迁移，**以及 US-306a/307 共用的 bench harness**（FR-037）与其 CI 接线
3. [US-306a](../stories/collaboration/US-306a-working-tree-index.md) 在其上实现工作树、缓存区、status/diff/stage/commit，并**冻结导出契约**
4. [US-306b](../stories/collaboration/US-306b-working-tree-bindings.md)、[US-307](../stories/collaboration/US-307-restore-session.md) 与 [US-308](../stories/collaboration/US-308-branch-isolation-conflict.md) 依赖 US-306a，三者可并行

**排期风险（必须显式承认）**：本 Epic 的 `startDate` / `targetDate` 仍是 `TBD`，而五个故事全部 Backlog、整条链被 US-304 卡着；US-304 当前 In Progress，且它自己的 INVEST `Independent` 未勾选、依赖 US-303。也就是说本 Epic 的**最早开工时间不由本 Epic 决定**。排期落地前不要把这五个故事当成可独立排入迭代的条目。

## 故事

- ⬜ [US-305 提交图与 HEAD 持久化](../stories/collaboration/US-305-commit-graph-head.md) (High)
- ⬜ [US-306a 工作树、缓存区与提交操作（核心状态机）](../stories/collaboration/US-306a-working-tree-index.md) (High)
- ⬜ [US-306b 工作树的三框架绑定与演示](../stories/collaboration/US-306b-working-tree-bindings.md) (High)
- ⬜ [US-307 历史恢复会话](../stories/collaboration/US-307-restore-session.md) (Medium)
- ⬜ [US-308 分支隔离与跨 realm 冲突检测](../stories/collaboration/US-308-branch-isolation-conflict.md) (Medium)

> `priority` 表示 **Epic 内的交付顺序与风险优先级，不表示「可选」**。US-307 / US-308 标 `Medium`（其 User Story 也标 P2），但它们仍是下方发布门禁第 2 条的组成部分。要把它们排除在 v1 之外，MUST 先修改发布门禁本身，**不得**依据 `priority` 字段自行后置。

### US-306 的拆分记录（2026-08-15 三轮复审）

原 US-306 是整条依赖链上最长的关键路径节点：状态机 + 7 个操作 + 三端对称绑定 + 三端 demo + 跨框架 E2E，适用 FR-023/024/025/026/033/034 六条。本次复审已将它拆为两个故事：

| 故事    | 承担                                                    | 适用横切 FR                 |
| ------- | ------------------------------------------------------- | --------------------------- |
| US-306a | 工作树 / 缓存区状态机、diff、持久化、**导出契约的冻结** | FR-023 / FR-026 / FR-028 等 |
| US-306b | 三端绑定、三端 demo、a11y、跨框架 E2E                   | FR-023 / 024 / 025 / 028    |

**为什么原先"不拆"的理由不成立**：原文写「三端绑定与状态机共享同一套导出名和状态枚举，先拆会制造一次纯粹为拆而拆的契约冻结」，但同一份 INVEST 清单的 `Negotiable` 项本来就写着「导出名、事件名和 diff 结构可在 plan 阶段冻结」——那次冻结无论拆不拆都要发生，拆分并不额外制造它。现在把冻结**显式列为 US-306a 的交付物**（落进 api-baseline），US-306b 以该冻结契约为唯一输入。

另有两点前置卸载：共用 bench 基建已前置到 US-305（FR-037），bench 场景与阈值留在 US-306a（FR-026）。

## 性能预算的口径

原 FR-026 写「status/diff/stage 用户可见响应 100 ms 内、恢复最近 commit 1 s 内，覆盖 10,000 条实体 / 100 个 commit」。这三个数字当前**不可验收**：没有指定设备与存储后端（OPFS / IDB / wa-sqlite / PGlite 的差距是数量级）、没有定义"用户可见响应"是 promise resolve 还是首次绘制、没有统计口径（p50 / p95 / max），在 CI 机器上做绝对墙钟断言必然抖动。

仓库现状（已逐条核对源码，不要照抄二手描述）：

- [non-encrypted-hot-path.bench.ts](../../benchmarks/non-encrypted-hot-path.bench.ts) 是**唯一**带门禁的 bench：`WARMUP = 5` + `SAMPLES = 100`，报告同时输出 p50/p95，但**判定只用 p50**，比较的是**同一次运行内的两个对照组**（plain vs 同进程挂载加密插件），阈值 `MAX_REGRESSION_PCT = 2`。
- [encryption.bench.ts](../../benchmarks/encryption.bench.ts) 只采样并输出 p50/p95/p99 报告，**没有**门禁。
- `benchmarks/reports/` 下只有时间戳文件与 `workflow-ci-latest.json`；仓库里**不存在**"历史基线"这个概念，也没有基线更新流程。

因此本 Epic **不采用**"与落库历史基线比较"的方案——那只是把绝对毫秒换成绝对毫秒的差值，同样吃 CI 机器波动，还要额外发明一套仓库现在没有的基线维护流程。改用与现有门禁**同构**的「同一次运行内 A/B 对照」：

- 新增 `nx run benchmarks:bench-working-tree`，与现有两个 target 一致地 `dependsOn: ["typecheck", "^build"]`（需同时改 [benchmarks/project.json](../../benchmarks/project.json)），报告写入 `benchmarks/reports/`
- 对照组定义：同一 fixture、同一进程内，**A = 未启用 commit 能力的基线路径**，**B = 启用工作树 / commit 后的同一操作**；判定值为 `(B.p50 - A.p50) / A.p50`
- 阈值单独设定：工作树引入的是新增写放大，不能直接套用加密插件的 2%。首次实现必须在 PR 中给出实测分布，**并同时给出独立论证的上限**（例如「每次 stage 相对基线的额外写次数理论上限 = N」），冻结后写成 bench 文件里的常量并注明依据。只把首次实测值直接当阈值是循环论证——那样门禁抓不到引入它的那一版自己的回归
- p95 一并输出用于观察抖动，但**不作为门禁**，与现有 bench 保持一致
- 数据规模（10,000 实体 / 100 commit）保留，作为固定 fixture；基准环境为 Node + PGlite memory（与现有两个 bench 相同），**不承诺**浏览器 OPFS / IDB 下的同一数字

**基建归属**：bench 文件、`bench-working-tree` target 注册与 A/B 采样骨架属 **US-305**（FR-037）。它是 US-306a 与 US-307 共用的基础设施，塞进任一消费方都会让那个故事同时背上"建基建"和"用基建"两件事；而 US-305 本来就要跑崩溃恢复 fixture，A/B 骨架与它同一条交付线。

**场景与阈值归属**：status / diff / stage 的场景与阈值在 US-306a（FR-026），restore 的场景在 US-307（FR-029）。两者都只往 US-305 建好的 harness 里**加场景**，不再重复建 target。

## 发布门禁

1. US-304 Done（**整个 Epic 的前置**，不只是 US-308；US-304 属 [epic-005](./epic-005-type-system-evolution.md)，当前 In Progress）
2. US-305 / US-306a / US-306b / US-307 / US-308 全部 Done，且各自**适用**的横切 FR 满足（逐故事裁决见上文横切约束表：FR-024 / FR-025 不适用于 US-305 与 US-306a，FR-025 不适用于 US-308）
3. 崩溃与刷新恢复 fixture 全绿：不出现半个 commit、半个事务或半成品 index
4. `nx run benchmarks:bench-working-tree` target 已加入 [benchmarks/project.json](../../benchmarks/project.json) 并在 CI 中无回归（A/B 对照口径见上文；harness 与 CI 接线由 US-305 FR-037 建立，场景由 US-306a / US-307 补齐）
5. api-baseline 新增导出全部使用 `Commit*` / `WorkingTree*` / `Index*` 前缀，无 `Workspace*` 新导出；且**未复用适配器层既有的 `SwitchBranchOptions`**（见下）
6. 受支持适配器矩阵全绿，且不受支持的适配器上启用 commit 能力会显式报错（见「适用的存储后端」）
7. 「已提交 / 未提交」的判定基准已按 [US-305 FR-036](../stories/collaboration/US-305-commit-graph-head.md) 选定并写入 plan.md，且 `discardWorkingTree()` 后 `status()` 为 clean 的不变式用例通过
8. 公开文档说明工作树与草稿缓存的区别、恢复语义与不改写历史的承诺

### 命名冲突的第二处：`SwitchBranchOptions`

上文术语表处理的是 `Workspace*`，但仓库里还有第二个同名不同层的类型，必须一并定死：

[rxdb-adapter.ts:55](../../packages/rxdb/src/rxdb-adapter.ts#L55) 的 `SwitchBranchOptions`（`{ branchId, actions: SwitchVersionActions }`）是**适配器层**契约，由 [rxdb-adapter.ts:165](../../packages/rxdb/src/rxdb-adapter.ts#L165) 的 `abstract switchBranch(options)` 及 pglite / sqlite-core 的实现消费。它**不是** [VersionManager.switchBranch()](../../packages/rxdb/src/version/VersionManager.ts#L756) 的参数类型——后者的签名是 `switchBranch(branchId: string)`。

因此 [US-308](../stories/collaboration/US-308-branch-isolation-conflict.md) 的 `requireClean` MUST 落在 **VersionManager 层的新类型**上，MUST NOT 加到适配器层的 `SwitchBranchOptions` 上——那会把 `requireClean` 泄漏进每一个适配器的 `switch_branch` 签名。这与禁止复用 `Workspace*` 是同一条规矩。

## 非目标

- 远程 commit push/pull、认证、签名与多人协作权限
- rebase、cherry-pick、interactive rebase 与任意历史改写
- 字段级或代码行级的部分暂存
- 自动 stash、stash pop 与跨分支携带脏工作树
- 自动合并冲突的最终解决 UI（只要求检测并阻止静默覆盖）
- 基于时间或大小的 commit 自动清理策略
- 改变 `VersionManager.switchBranch()` 的现有默认行为（见 US-308）
