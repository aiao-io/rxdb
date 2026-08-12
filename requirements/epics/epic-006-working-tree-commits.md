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

## 横切约束（每个故事的 DoD，不单独成故事）

原 US-305 把三框架对称（FR-024）、a11y（FR-025）、异步状态（FR-023）和禁止复活旧导出（FR-028）各写成一条 FR，读起来像"最后统一补"。按仓库铁律，单端实现即未完成，所以这四条是**每个**故事各自的完成条件：

1. **三框架对称**：Angular / React / Vue 提供语义对称的 API，命名、参数、状态转换和错误语义一致；任一端缺失该故事不得标 Done。
2. **异步状态**：所有异步操作暴露 loading / success / empty / error；错误说明操作、对象与恢复建议。
3. **可访问性**：键盘可达、焦点可见、状态与错误可被屏幕阅读器读出，达到 WCAG 2.1 AA；不得只有图标没有可访问名称。
4. **不复活旧导出**：`stagedChange()`、`unstageChange()`、`commit()`、`stagedCount`、`WorkspaceCacheEntry.staged` 已在 `0.0.24` 删除（提交 `4d2495bdd`），新导出不得与它们同名同签名，也不得使用 `Workspace` 前缀（见上表）。

## 依赖顺序

1. [US-304](../stories/collaboration/US-304-writer-lease-migration-fencing.md) 必须先 Done —— 跨 realm 校验复用其 writer lease / epoch，本 Epic 不允许另起一套协调协议
2. [US-305](../stories/collaboration/US-305-commit-graph-head.md) 建立 commit 图、HEAD、存储布局与基线迁移
3. [US-306](../stories/collaboration/US-306-working-tree-index.md) 在其上实现工作树、缓存区、status/diff/stage/commit
4. [US-307](../stories/collaboration/US-307-restore-session.md) 与 [US-308](../stories/collaboration/US-308-branch-isolation-conflict.md) 依赖 US-306，可并行

## 故事

- ⬜ [US-305 提交图与 HEAD 持久化](../stories/collaboration/US-305-commit-graph-head.md) (High)
- ⬜ [US-306 工作树、缓存区与提交操作](../stories/collaboration/US-306-working-tree-index.md) (High)
- ⬜ [US-307 历史恢复会话](../stories/collaboration/US-307-restore-session.md) (Medium)
- ⬜ [US-308 分支隔离与跨 realm 冲突检测](../stories/collaboration/US-308-branch-isolation-conflict.md) (Medium)

## 性能预算的口径

原 FR-026 写「status/diff/stage 用户可见响应 100 ms 内、恢复最近 commit 1 s 内，覆盖 10,000 条实体 / 100 个 commit」。这三个数字当前**不可验收**：没有指定设备与存储后端（OPFS / IDB / wa-sqlite / PGlite 的差距是数量级）、没有定义"用户可见响应"是 promise resolve 还是首次绘制、没有统计口径（p50 / p95 / max），在 CI 机器上做绝对墙钟断言必然抖动。

仓库里已有可用先例：[benchmarks/](../../benchmarks/) 的两个 bench 用 `WARMUP = 5` + 定量采样 + p50/p95 + JSON 报告，门禁判定用**相对回归**（`MAX_REGRESSION_PCT = 2`）而不是绝对毫秒。本 Epic 沿用同一套：

- 新增 `nx run benchmarks:bench-working-tree`，输出格式与 `benchmarks/reports/` 一致
- 门禁判定用 p95 与**相对基线**的回归百分比；基线随第一次实现落库
- 若保留绝对数字，只在固定基准环境（Node + PGlite memory，与现有两个 bench 相同）下成立，并写明浏览器 OPFS / IDB 不承诺同一数字
- 数据规模（10,000 实体 / 100 commit）保留，作为 bench 的固定 fixture

具体归属：status / diff / stage 的预算在 US-306，restore 的预算在 US-307。

## 发布门禁

1. US-304 Done（前置）
2. US-305 / US-306 / US-307 / US-308 全部 Done，且各自的三框架对称与 a11y 条件满足
3. 崩溃与刷新恢复 fixture 全绿：不出现半个 commit、半个事务或半成品 index
4. `nx run benchmarks:bench-working-tree` 无回归
5. api-baseline 新增导出全部使用 `Commit*` / `WorkingTree*` / `Index*` 前缀，无 `Workspace*` 新导出
6. 公开文档说明工作树与草稿缓存的区别、恢复语义与不改写历史的承诺

## 非目标

- 远程 commit push/pull、认证、签名与多人协作权限
- rebase、cherry-pick、interactive rebase 与任意历史改写
- 字段级或代码行级的部分暂存
- 自动 stash、stash pop 与跨分支携带脏工作树
- 自动合并冲突的最终解决 UI（只要求检测并阻止静默覆盖）
- 基于时间或大小的 commit 自动清理策略
- 改变 `VersionManager.switchBranch()` 的现有默认行为（见 US-308）
