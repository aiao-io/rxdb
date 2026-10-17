---
id: US-312
title: 不切换分支就对比两条分支、预览一次合并（含覆盖标注）
status: In Review
priority: High
epic: epic-006-working-tree-commits
created: 2026-10-15
updated: 2026-10-17
tags: [collaboration, branch, merge, history, tri-framework]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只读积木已在历史插件里（切分支的增量计算、合并读源分支变更的那一半），不依赖任何检出位
- [x] Negotiable (可协商): API 落点、覆盖标注的四类与 demo 范围由 owner 2026-10-15 确认
- [x] Valuable (有价值): 合并没有预览，结果直接混进当前工作树，单向覆盖还会悄悄盖掉目标分支上的改动
- [x] Estimable (可估算): 两个只读方法 + 三端各一个差异列表与 History 顶部的分支对比
- [x] Small (小): 不写库、不改切换与合并的既有行为
- [x] Testable (可测试): 预览与真实合并的结果逐条比对；三端 e2e 走查
-->

# 用户故事：不切换分支就对比两条分支、预览一次合并（含覆盖标注）

## 作为/我想要/以便

**作为** 在本地优先应用里用分支隔离改动的用户
**我想要** 不切换当前分支就看清另一条分支与当前分支差在哪，合并之前看清这次合并会改什么、会盖掉哪些改动
**以便** 不必为了「看一眼」先清空工作树、切过去再切回来，也不会在合并时悄悄丢掉自己分叉以来的修改

## 症状

epic-006 多检出位的[场景二](../../epics/epic-006-working-tree-commits.md#场景二不切换就预览或对比)，由读源码确认：

1. **没有任何 API 能不切换就读到另一条线。** 最近的积木 `compute_switch_branch_actions` 只算「当前 active 分支 → 目标分支」，
   起点写死为 active 分支，且作为内部符号从 `@aiao/rxdb-plugin-history` 导出。
2. **合并没有预览。** 三端 demo 的合并对话框只有源 / 目标分支名、合并策略与「合并后删除源分支」，确认即落库，结果混进当前工作树。
3. **合并是单向覆盖，覆盖不可见。** `merge_branch` 把源分支分叉以来的变更写进目标分支：UPDATE 只写补丁里的字段、
   INSERT 走 `INSERT OR REPLACE`、DELETE 按主键删。目标分支分叉以来改过的同名字段会被源分支的值盖掉；
   源分支改了而目标分支已删的实体，UPDATE 落空、源分支的改动静默丢失。

## 范围边界

### In Scope

- `VersionManager.compareBranches(fromBranchId, toBranchId)`：两条分支当前状态之间的实体差异，条目沿用 `diff()` 的
  `patch`（终点的值）/ `inversePatch`（起点的值）语义；只读、不切换
- `VersionManager.previewMerge(sourceBranchId, options?)`：合并进当前 active 分支会落的增删改、与 `mergeBranch()` 一致的
  `merged` 计数，以及四类覆盖标注（见技术笔记）；只读、不切换
- 「从任意分支的任意变更点走到另一点」的增量计算从切换路径里抽出来，切换与对比共用一份；合并的压缩逻辑抽出来，
  合并与预览共用一份
- 簿记字段清单（`remoteId` / `createdAt` / `updatedAt`）下沉到核心 `ENTITY_BOOKKEEPING_FIELDS`，工作树插件的
  `UNTRACKED_BOOKKEEPING_FIELDS` 改为引用它；对比与覆盖判定不把簿记字段算作差异
- 三端 demo，入口对齐 GitHub Desktop：分支下拉底部「Choose a branch to merge into 当前分支」打开合并对话框，选好来源即显示
  预览与覆盖警告；History 顶部「Select branch to compare…」选一条分支，侧栏即列出差异，底部可合并进当前分支；
  两处共用每端一个差异列表组件
- 文档：历史插件的分支文档、CHANGELOG、epic-006 目标与分期表

### Out of Scope

- 完整视图（某条分支或某个提交的全部数据）：epic-006 分期阶段 3（只读检出位）
- 三方合并与冲突解决界面：预览只标出覆盖，不改变合并的写法
- 把预览接进三端绑定（`useWorkingTree()`）：合并本身也是由 demo 直接调 `versionManager`

## 验收标准

| #   | 前置条件                                                           | 操作                                                               | 预期结果                                                                                                                                         | 状态 |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | 两条分支各自增、删、改过实体                                       | `compareBranches(a, b)`                                            | 只在 b 有的实体为 INSERT（`patch` 是整行）、只在 a 有的为 DELETE（`inversePatch` 是整行）、两边都有且业务字段不同的为 UPDATE（两侧取值）；不切换 | ✅   |
| 2   | 两边把同一字段改成同一个值，或只有簿记字段不同；两边都删了同一实体 | `compareBranches`                                                  | 不出条目                                                                                                                                         | ✅   |
| 3   | 分支互为父子、兄弟或跨多级                                         | `compareBranches`                                                  | 结果与「切到 b 后的数据 − 切到 a 后的数据」逐条一致                                                                                              | ✅   |
| 4   | 同一条分支；分支不存在                                             | `compareBranches(a, a)`；传不存在的 id                             | 前者返回空条目；后者抛 `RxDBError`，与 `mergeBranch` 同一句报错                                                                                  | ✅   |
| 5   | 源分支分叉以来有改动                                               | `previewMerge(source, { strategy })`                               | `merged` 与随后 `mergeBranch(source, { strategy })` 返回的一致；条目就是合并会落的操作，`patch` 与合并写入的值一致                               | ✅   |
| 6   | 源分支里先建后删的实体（幽灵操作）                                 | `previewMerge`                                                     | 不出条目，与压缩合并的过滤一致                                                                                                                   | ✅   |
| 7   | 两边分叉以来都改了同一实体的同一业务字段且值不同                   | `previewMerge`                                                     | 该条标 `overwrite`，`fields` 列出会被盖掉的字段；值相同或只撞上簿记字段时不标                                                                    | ✅   |
| 8   | 源分支删了实体，目标分支分叉以来改过它                             | `previewMerge`                                                     | 标 `delete_edited`，`fields` 列出目标改过的业务字段                                                                                              | ✅   |
| 9   | 源分支改了实体，目标分支分叉以来删了它                             | `previewMerge`                                                     | 标 `update_deleted`（合并时这次更新落空）                                                                                                        | ✅   |
| 10  | 源分支删后重建了实体，目标分支分叉以来删了它                       | `previewMerge`                                                     | 标 `revive_deleted`（合并会把它重新建出来）                                                                                                      | ✅   |
| 11  | 任意预览、对比                                                     | 调用前后                                                           | 不写任何表：`rxdb_change`、业务表、active 分支都不变                                                                                             | ✅   |
| 12  | 三端 demo                                                          | 分支下拉底部「Choose a branch to merge into 当前分支」，选一条来源 | 显示将落的增删改与覆盖警告，换合并策略时计数跟着变；预览失败显示错误，不挡合并                                                                   | ✅   |
| 13  | 三端 demo                                                          | History 顶部「Select branch to compare…」选一条分支                | 侧栏列出差异，底部可合并进当前分支；没有差异时显示空态；清除即回到历史                                                                           | ✅   |
| 14  | 三端 demo                                                          | a11y 走查                                                          | 合并对话框（带预览）与 History 的分支对比 axe 零违规、键盘可达，对话框 Escape 关闭                                                               | ✅   |
| 15  | 门禁                                                               | 收尾                                                               | 历史插件与 PGlite 单测、三端单测与 e2e、`audit:api-surface`（基线随提交）、`audit:requirements`、`nx format:check` 全绿                          | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- **对比 = 两次增量计算。** 「a → b」的增量里 `patch` 是 b 的值；而折叠结果里的 `inversePatch` 不能当 a 的值用——
  同一字段改过两次时它会被后一条的反向补丁覆盖。所以再算一次「b → a」，取它的 `patch` 当 a 的值。两次计算触及的实体与字段
  相同，存在性各由自己那一次的终点判定（在 `inserts ∪ updates` 里即存在）。
- **预览的基准点是源 tip 与目标 tip 的最近公共祖先点（merge base）。** 源分支的改动取法与 `merge_branch` 相同
  （自有变更、`id > fromChangeId`、未回滚），按同一份压缩逻辑折叠；基准是两条父链上的第一条公共分支，停在两边在它上面看到的
  位置里较早的那个（两边不在同一棵树上时与切换「经根」同口径，基准是空库）；目标分支「分叉以来的改动」是从基准走到目标分支 tip
  的增量；基准上的值取「源分支 tip → 基准」的增量，这一段没碰过的实体取源 tip 上的值。三者都是同一个增量计算。
  不用源分支自己的分叉点，是因为目标是源的后代（父分支合回子分支、根分支合进子分支）、比源分叉得更早、或源是孙分支合进祖分支时，
  「源的分叉点 → 目标 tip」里混着源自己的历史或两边分开之后上游的改动，会把目标从没碰过的字段误报成覆盖；最常见的子分支合回
  父分支里两者是同一点，结果不变。
- **覆盖四类**（只看业务字段，簿记字段不算）：
  - `overwrite`：源要写的字段里，有目标分叉以来改过、且两边取值不同的（UPDATE；或 INSERT 以整行替换目标已改过的行）
  - `delete_edited`：源删了，目标分叉以来改过它
  - `update_deleted`：源改了，目标里却没有这一行（目标分叉以来删了它，或它是两边分开之后由源的上游分支建的、合并带不过去）——
    `UPDATE` 找不到行，这次更新落空
  - `revive_deleted`：源删后重建，目标分叉以来删了它——`INSERT OR REPLACE` 会把它重新建出来
  - 目标删后重建是整行替换：目标现在的值就是新行，基准有、新行没有的字段算目标的净改动
- **补丁不解码**：取值原样来自变更日志，与 `diff()` 同口径；加密字段保持密文信封。
- **`merged` 跟策略走**：压缩为净操作数，逐条为源分支变更条数；条目恒为净效果，两种策略落库后的终态相同。
- **demo 对话框外壳**：合并对话框与带改动切分支的 Switch branch 对话框三端各共用一个外壳。原合并对话框的背板（`role="button"`）包着面板，一扫就是 axe
  `nested-interactive`（此前没有用例在对话框打开时扫描）；改为背板与面板并列，打开时焦点进面板，面板里任意处按 Escape 关闭。
- **demo 的读取不留旧结果**：预览随选来源与换策略各读一次，对比随选分支读一次；每次读取带一个递增代号，
  对话框关掉、对比被清除或参数变了之后才回来的结果直接丢弃。

## 实现文件

- `packages/rxdb-plugin-history/src/branch-compare.ts` — `compare_branches` / `preview_merge` 与公开类型
- `packages/rxdb-plugin-history/src/switch-branch-actions.ts` — 任意两点之间的增量计算（切换与对比共用）
- `packages/rxdb-plugin-history/src/merge-branch.ts` — 压缩逻辑抽出（合并与预览共用）
- `packages/rxdb-plugin-history/src/VersionManager.ts` — `compareBranches()` / `previewMerge()`
- `packages/rxdb/src/entity/entity-bookkeeping.ts` — `ENTITY_BOOKKEEPING_FIELDS`
- `packages/rxdb-adapter-pglite/src/__tests__/version/branch_compare.spec.ts` — 真后端上预览与合并逐条比对
- `apps/dev-rxdb-{angular,react,vue}` 与对应 `-e2e` — 合并预览、History 顶部的分支对比与用例

## References

- [epic-006 多检出位：共同前提](../../epics/epic-006-working-tree-commits.md#共同前提不切换也能读到另一条线)
- [epic-006 分期与解锁条件](../../epics/epic-006-working-tree-commits.md#分期与解锁条件)
