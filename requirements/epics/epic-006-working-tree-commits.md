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

恢复会话属于工作树状态，公开名使用 `WorkingTreeRestore*`；分支引用和并发冲突属于提交图，公开名使用
`CommitBranch*` / `CommitConflict*`。既有适配器契约已经导出 `SwitchBranchOptions`，本 Epic 不复用该名字；
面向 `VersionManager.switchBranch()` 的新选项固定使用 `WorkingTreeSwitchBranchOptions`。

## v1 状态模型（唯一真相源）

v1 不持久化第二份独立 `HEAD`。当前分支仍由既有 `RxDBBranch.activated` 表示，当前 HEAD 从该分支的
`CommitBranchRef.headCommitId` 派生：

| 状态                         | 主键                | 必须持久化的版本                         | 写入规则                                               |
| ---------------------------- | ------------------- | ---------------------------------------- | ------------------------------------------------------ |
| `CommitBranchRef`            | database + branch   | `headCommitId`、`headRevision`           | commit 在同一事务内以 `headRevision` 做 CAS 后推进      |
| `WorkingTreeState`           | database + branch   | `baseHeadCommitId`、`workingTreeRevision` | 任何工作树物化或丢弃都在同一事务内递增 revision        |
| `IndexState` / `IndexEntry`  | database + branch   | `indexRevision`、staged snapshot         | stage / unstage / commit 以 `indexRevision` 做 CAS      |
| writer lease / upgrade guard | database + writer   | `epoch`                                  | 只判断 writer 是否被 schema 迁移 fence，不充当业务版本 |

正常提交、stage 和恢复不会递增 US-304 的 epoch。跨 realm 正确性由数据库事务内的
`headRevision` / `workingTreeRevision` / `indexRevision` 条件更新保证；writer lease 只提供 writer 身份和迁移期
fencing。revision CAS 是领域数据完整性，不是第二套 lease 或跨 realm 协调协议。

分支切换时保存来源分支自己的工作树/index 状态，并恢复目标分支自己的工作树/index；只有目标分支从未产生过
未提交状态时，才从目标 `CommitBranchRef.headCommitId` 物化。不得把“切到分支”实现成无条件 reset 到 HEAD。

## 启用与存储边界

- commit 能力默认不改变既有应用行为；开发者显式启用后才创建系统表并执行首次基线迁移，具体配置名在 plan 阶段冻结。
- SQL/PGlite 主库是 commit、工作树元数据和 index 的唯一一致性边界。
- Workspace 插件的 NEW 草稿仍留在独立 IndexedDB 中，不参与系统 schema 事务，也不进入 baseline commit。
  草稿调用 `save()` 落入主表后，才作为普通 INSERT 进入工作树。
- v1 支持 PGlite、四个 SQLite 浏览器适配器和 desktop SQLite host；它们必须通过同一套
  `workingTreeCommitConformanceSuite`。实验性的 miniprogram 适配器不承诺崩溃恢复，因此不在 v1 支持矩阵内。

## 横切约束（按故事适用，不单独成故事）

原 US-305 把三框架对称（FR-024）、a11y（FR-025）、异步状态（FR-023）和禁止复活旧导出（FR-028）各写成一条 FR，读起来像"最后统一补"。适用范围固定如下：

1. **三框架对称**：US-306～308 的用户操作面必须在 Angular / React / Vue 提供语义对称的 API；US-305 是无 UI 的存储底座，只要求核心公开类型、TSDoc 和类型契约测试。
2. **异步状态**：命令暴露 loading / success / error，查询在无结果时额外暴露 empty；错误说明操作、对象与恢复建议，不给无 empty 语义的命令伪造 empty 状态。
3. **可访问性**：US-306～308 的 UI 键盘可达、焦点可见、状态与错误可被屏幕阅读器读出，达到 WCAG 2.1 AA；US-305 不适用 UI a11y。
4. **不复活旧导出**：`stagedChange()`、`unstageChange()`、`commit()`、`stagedCount`、`WorkspaceCacheEntry.staged` 已在 `0.0.24` 删除（提交 `4d2495bdd`），新导出不得与它们同名同签名，也不得使用 `Workspace` 前缀（见上表）。

## 依赖顺序

1. [US-304](../stories/collaboration/US-304-writer-lease-migration-fencing.md) 必须先 Done —— 本 Epic 复用 writer 身份与迁移期 epoch fencing，不复用 epoch 充当提交版本
2. [US-305](../stories/collaboration/US-305-commit-graph-head.md) 建立 commit 图、branch ref、`headRevision` CAS、存储布局与每分支基线迁移
3. [US-306](../stories/collaboration/US-306-working-tree-index.md) 在其上实现分支级工作树/index、revision CAS、status/diff/stage/commit
4. [US-307](../stories/collaboration/US-307-restore-session.md) 与 [US-308](../stories/collaboration/US-308-branch-isolation-conflict.md) 依赖 US-306，可并行；二者复用 US-305/306 已完成的安全原语

## 故事

- ⬜ [US-305 提交图与 HEAD 持久化](../stories/collaboration/US-305-commit-graph-head.md) (High)
- ⬜ [US-306 工作树、缓存区与提交操作](../stories/collaboration/US-306-working-tree-index.md) (High)
- ⬜ [US-307 历史恢复会话](../stories/collaboration/US-307-restore-session.md) (Medium)
- ⬜ [US-308 分支隔离与跨 realm 冲突检测](../stories/collaboration/US-308-branch-isolation-conflict.md) (Medium)

## 性能预算的口径

原 FR-026 写「status/diff/stage 用户可见响应 100 ms 内、恢复最近 commit 1 s 内，覆盖 10,000 条实体 / 100 个 commit」。这三个数字当前**不可验收**：没有指定设备与存储后端（OPFS / IDB / wa-sqlite / PGlite 的差距是数量级）、没有定义"用户可见响应"是 promise resolve 还是首次绘制、没有统计口径（p50 / p95 / max），在 CI 机器上做绝对墙钟断言必然抖动。

仓库已有 `WARMUP = 5`、定量采样、p50/p95 和 JSON 报告的组织方式，可以复用报告结构；但
`non-encrypted-hot-path.bench.ts` 的 2% 是同一进程内 plain / encryption 对照，`encryption.bench.ts` 只归档报告，
都不能直接证明跨提交的 working-tree 性能可接受。本 Epic 采用双门禁：

- 新增 `nx run benchmarks:bench-working-tree`，输出格式与 `benchmarks/reports/` 一致
- 固定基准环境为 Node + PGlite memory；API promise resolve 定义为操作完成，不把 React/Angular/Vue 首次绘制混入核心 benchmark
- 绝对门禁保留原产品预算并明确为 p95：status / diff / stage 不高于 100 ms，restore 不高于 1 s
- 相对门禁比较“被测操作 p95 / 同次运行 control CRUD p95”的归一化比值；阈值须由首次实现连续采样校准后冻结，不照搬 2%
- 数据规模（10,000 实体 / 100 commit）保留，作为 bench 的固定 fixture
- 浏览器 OPFS / IDB 不承诺相同绝对数字，但三端 E2E 必须记录首次可见状态耗时，防止核心 promise 很快而 UI 长时间无反馈

具体归属：status / diff / stage 的预算在 US-306，restore 的预算在 US-307。

## 发布门禁

1. US-304 Done（前置）
2. US-305 / US-306 / US-307 / US-308 全部 Done；US-306～308 的三框架对称与 a11y 条件满足
3. 崩溃与刷新恢复 fixture 全绿：不出现半个 commit、半个事务或半成品 index
4. PGlite、四个 SQLite 浏览器适配器与 desktop SQLite host 的 `workingTreeCommitConformanceSuite` 全绿
5. `nx run benchmarks:bench-working-tree` 同时通过绝对 p95 与归一化相对回归门禁
6. api-baseline 新增导出全部使用 `Commit*` / `WorkingTree*` / `Index*` 前缀，无 `Workspace*` 新导出，也不复用既有 `SwitchBranchOptions`
7. 公开文档说明显式启用、工作树与草稿缓存的区别、恢复语义、历史保留敏感旧值的风险与不改写历史的承诺

## 非目标

- 远程 commit push/pull、认证、签名与多人协作权限
- rebase、cherry-pick、interactive rebase 与任意历史改写
- 字段级或代码行级的部分暂存
- 自动 stash、stash pop 与跨分支携带脏工作树
- 自动合并冲突的最终解决 UI（只要求检测并阻止静默覆盖）
- 基于时间或大小的 commit 自动清理策略
- 改变 `VersionManager.switchBranch()` 的现有默认行为（见 US-308）
