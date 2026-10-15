---
id: US-313
title: 只读检出位：不切换分支就打开另一条分支或一个可达提交的完整数据
status: Backlog
priority: Medium
epic: epic-006-working-tree-commits
created: 2026-10-16
updated: 2026-10-16
tags: [collaboration, branch, checkout, history, tri-framework]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只依赖阶段 2（US-312）放开起点的增量计算；不依赖可写检出位与隔离写入方
- [ ] Negotiable (可协商): 快照库存储、API 落点、第二实例的实体类、首批后端待 owner 拍板（见「待决问题」）
- [x] Valuable (有价值): 看另一条线的完整数据，今天只能切分支或 restore，两条路都要先清空工作树
- [x] Estimable (可估算): 按交付阶段 A～D 估
- [x] Small (小): 只读、不实时；可写检出位与往非 active 线写不在本故事
- [x] Testable (可测试): 快照与「切过去读到的数据」逐行比对
-->

# 用户故事：只读检出位：不切换分支就打开另一条分支或一个可达提交的完整数据

## 作为/我想要/以便

**作为** 在本地优先应用里用分支隔离改动的用户
**我想要** 不切换当前分支、不动工作树，以只读方式打开另一条分支或当前线上某个可达提交的完整数据，用平常的查询、列表与搜索浏览它
**以便** 看清另一条线的全貌，而不只是差异；在另一个标签页里看着另一条分支，当前标签页的工作照常进行

## 症状

epic-006 多检出位[场景二](../../epics/epic-006-working-tree-commits.md#场景二不切换就预览或对比)在
[US-312](US-312-branch-compare-merge-preview.md)（对比与合并预览）之后仍成立的部分，由读源码确认：

1. **看另一条分支只能切过去。** active 分支全库唯一（epic-006 现状 1），切换会带走所有标签页的活查询；
   三端 demo 的切换带 `requireClean`，工作树不空就被拒。
2. **看历史提交只有 `restore()` 一条路。** [`restoreWorkingTree()`](../../../packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts)
   在 dirty 工作树上直接拒绝（`reason: 'dirty_working_tree'`）；恢复出来的内容成为未提交变更，看完只能 `discard()` 整棵工作树。
3. **差异替代不了完整数据。** `compareBranches()` 只给有差异的实体；排序、分页、聚合、全文搜索、树形展开都要整张表。

## 范围边界

### In Scope

- **检出位登记**：本地、不进同步（设计指点 9）。每个检出位有自己的 HEAD（一条分支，或一个提交）、建立时刻的源点、归属
  （标签页会话 / 持久）与最后访问时间（设计指点 1、8）
- **只读快照库**：把业务表复制进一个独立库，叠上从源点走到目标点的增量，用第二个 RxDB 实例只读打开
  （epic-006 [共同前提](../../epics/epic-006-working-tree-commits.md#共同前提不切换也能读到另一条线)的「只读快照库」）
  - 分支视图：增量取 `compute_branch_transition_actions`（当前 active 分支 tip → 目标分支 tip）。目标分支的未提交变更就是它的变更行，一并可见
  - 提交视图：目标所在分支的快照，再按 restore 的可达路径物化目标提交的内容（**推断**，阶段 B 先核实）
- **只读**：只读实例上的 save / remove / reorder、批量与 raw 写一律抛只读错误；快照库与主库都不变
- **不污染主实例**：只读实例不进主实例的实体缓存、不派发 NEW，草稿缓存不收它的实体（设计指点 10）
- **加密与权限照旧**：加密字段按 envelope 原样复制、不解密；系统实体权限不放宽（设计指点 11）
- **生命周期与回收**：显式关闭即删快照库与登记；标签页会话归属的检出位在会话消失后可回收；启动时清理孤儿（设计指点 8，对应 `git worktree prune`）
- **三端绑定**：Angular / React / Vue 同名同 API（设计指点 13）
- **demo**：分支行与历史行菜单「Open read-only」打开只读视图；视图里有只读横幅，storage 的文件标注「不随版本」

### Out of Scope

- 可写检出位（epic-006 分期阶段 5）与往非 active 线写的原语（阶段 4）
- 实时：快照是建立时刻的数据，`refresh()` 即重建
- 跨设备、进同步
- DevTools 连接只读实例：DevTools 只连一个实例（epic-006 现状 9）
- 不可达提交：restore 拒绝的那一类，这里同样拒绝

## 交付阶段

| 阶段 | 交付                                                         | 状态 |
| ---- | ------------------------------------------------------------ | ---- |
| A    | 检出位登记、分支视图快照库、只读第二实例；首批后端的真库比对 | ⬜   |
| B    | 提交视图（先核实 restore 物化能否复用，不能则就地改判）      | ⬜   |
| C    | 生命周期与回收：关闭、标签页会话归属、`prune()`、启动清理    | ⬜   |
| D    | 三端绑定、三端 demo、文档                                    | ⬜   |

## 验收标准

| #   | 阶段 | 前置条件                                       | 操作                                               | 预期结果                                                                                         | 状态 |
| --- | ---- | ---------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---- |
| 1   | A    | 两条分支各有提交与未提交变更                   | 打开另一条分支的只读检出位                         | 每张业务表与「切过去读到的数据」逐行一致；当前 active 分支、工作树、业务表都不变                 | ⬜   |
| 2   | A    | 只读检出位已打开                               | 在它上面 save / remove / reorder / 批量写 / raw 写 | 抛只读错误；快照库与主库都不变                                                                   | ⬜   |
| 3   | A    | 主实例装了 workspace 插件                      | 在只读实例上查询并实例化实体                       | 主实例实体缓存里没有这些实体；草稿缓存不新增条目                                                 | ⬜   |
| 4   | A    | 有加密字段的实体                               | 打开只读检出位                                     | 快照库里的密文与主库逐字节一致                                                                   | ⬜   |
| 5   | A    | 只读检出位已打开，主库随后又写入               | 读只读检出位；再 `refresh()`                       | 先读到的仍是建立时刻的数据；`refresh()` 后与新状态一致                                           | ⬜   |
| 6   | B    | 当前分支上一个可达的历史提交                   | 打开提交视图                                       | 数据与「在干净工作树上 restore 该提交后读到的数据」一致                                          | ⬜   |
| 7   | B    | 不可达的提交                                   | 打开提交视图                                       | 拒绝，原因与 restore 的 `unreachable_target` 同口径                                              | ⬜   |
| 8   | C    | 只读检出位已打开                               | `close()`                                          | 快照库与登记都删除                                                                               | ⬜   |
| 9   | C    | 标签页会话归属的检出位，所在标签页已关闭或崩溃 | 任一标签页启动，或调 `prune()`                     | 该检出位被回收；其它标签页仍在用的不受影响                                                       | ⬜   |
| 10  | C    | 持久归属的检出位                               | 刷新页面                                           | 仍在登记里，可直接打开                                                                           | ⬜   |
| 11  | D    | 三端 demo                                      | 分支行 / 历史行菜单「Open read-only」              | 打开只读视图，能按实体浏览列表与详情；有只读横幅，写入口不可用；storage 文件标注「不随版本」     | ⬜   |
| 12  | D    | 三端绑定                                       | 对照三端 API                                       | 同名同 API（`tri-framework-check`）                                                              | ⬜   |
| 13  | D    | 三端 demo                                      | a11y 走查                                          | 只读视图 axe 零违规、键盘可达                                                                    | ⬜   |
| 14  | —    | 门禁                                           | 收尾                                               | 首批后端的真库比对、三端单测与 e2e、`audit:api-surface`（基线随提交）、`audit:requirements` 全绿 | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 待决问题

开工前由 owner 拍板；括号里是建议的默认值。

1. **快照库放在哪**：与主库同类后端、独立库名，还是内存库。（同类后端、独立库名：大库不吃内存，关闭即删。）
2. **API 落点**：工作树插件里，还是独立插件包。（工作树插件：提交视图要用它的 restore 物化，检出位的登记也是它的系统表。）
3. **第二实例的实体类**：同一个实体类不能注册到两个实例（[`entity-manager.ts`](../../../packages/rxdb/src/entity/entity-manager.ts)：
   `is registered with multiple RxDB instances`）。失败归档导入用 `cloneEntityClasses()` 绕开，它今天只从 `@aiao/rxdb/testing` 导出。
   （把它提为公开 API，不放宽注册限制。）
4. **首批后端**：（PGlite 与 SQLite 系，与捕获、提交两套 conformance 同口径。）

## 技术笔记

- **判据与 US-312 同口径**：快照的正确性以「切过去读到的数据」为基准逐行比对；增量复用 `compute_branch_transition_actions`，
  阶段 2 已把它的起点从 active 分支放开到任意变更点。
- **复制什么**：只复制业务实体的表。变更日志、工作树与提交图这些系统表不复制；只读实例需要哪些系统表才能 `init()`，阶段 A 先查清。
- **只读实例不装写路径的插件**：不装历史、同步、workspace、工作树捕获；写入口在实例层统一拒绝，不靠「没装插件所以写不进去」。
- **storage 文件**：`StorageFileMeta` 是 `log: false` 的业务实体，复制的是建立时刻的元数据，文件内容取共享目录的当前字节，
  与 epic-006「storage 文件不进版本控制」的结论一致，界面据此标注。
- **回收判活**（推断）：标签页会话归属用 Web Locks，每个检出位一把，持有者活着锁就在；锁可拿到即视为孤儿。

## 实现文件

预计（以待决问题 2 的默认值为前提）：

- `packages/rxdb-plugin-working-tree/src/checkout/` — 检出位登记、快照库、只读实例与回收
- `packages/rxdb-plugin-history/src/switch-branch-actions.ts` — 任意两点之间的增量计算（复用）
- `packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts`、`restore-command.ts` — 提交视图的物化（复用）
- `packages/rxdb-plugin-working-tree-{angular,react,vue}` — 三端绑定
- `apps/dev-rxdb-{angular,react,vue}` 与对应 `-e2e` — 只读视图与用例

## References

- [epic-006 场景二：不切换就预览或对比](../../epics/epic-006-working-tree-commits.md#场景二不切换就预览或对比)
- [epic-006 共同前提：不切换也能读到另一条线](../../epics/epic-006-working-tree-commits.md#共同前提不切换也能读到另一条线)
- [epic-006 设计指点](../../epics/epic-006-working-tree-commits.md#设计指点)
- [epic-006 分期与解锁条件](../../epics/epic-006-working-tree-commits.md#分期与解锁条件)
- [US-312 不切换分支就对比两条分支、预览一次合并](US-312-branch-compare-merge-preview.md)
