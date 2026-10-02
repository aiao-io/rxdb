---
id: US-515
title: 变更管理（ECN）驱动的生效期
status: Backlog
priority: Low
epic: epic-009-bom-domain-model
created: 2026-09-22
updated: 2026-10-01
tags: [plugin, bom, change-management]
---

# 用户故事：变更管理（ECN）驱动的生效期

## 作为/我想要/以便

**作为** 变更管理员
**我想要** 一个 ECN 同时改多张 BOM 的多行，且行的生效日由 ECN 派生
**以便** 回答「这次变更影响哪些整机」与「变更前后差异是什么」

## 范围边界

### In Scope

- `ecn` 实体：单号、状态、生效日、变更原因
- **状态机**：`draft → released → effective`，外加 `cancelled`。`released` 指已发布、生效日未到；到生效日即 `effective`
- 行发生项（[US-507](US-507-bom-graph-skeleton.md)）的 `ecn_in_id` / `ecn_out_id` 记录「被哪次变更引入 / 失效」；
  ECN 的单位是**发生项**，改量、换子件都是「旧发生项 `effective_to` 截止 + 新发生项 `effective_from` 起」
- `effective_from` / `effective_to` 从 `ecn.effective_date` **派生**，不手填
- **禁止追溯生效**（同 [US-508](US-508-bom-view-resolution.md)）：ECN 发布时生效日不得早于发布当日
- **取消与改期只在生效前**：`released` 的 ECN 可取消或改期；`effective` 之后不可取消、不可提前，只能另开一张更正 ECN
- **ECN 发布原子校验**：发布时对所有受影响头的聚合（US-507 的发生项不重叠与位号、US-509 环、US-512 替代组）整批校验，
  任一冲突整批回滚，错误点名冲突的头与发生项
- 影响面查询（经 where-used）与变更前后行集差异

### Out of Scope

- 审批流与工作流引擎
- 变更对库存/在制订单的处置（属事务域）

## 验收标准

| #   | 前置条件                                               | 操作                           | 预期结果                                                                         | 状态 |
| --- | ------------------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------------- | ---- |
| 1   | 一个 ECN 改 3 张 BOM 的 5 行                           | 查影响面                       | 列出受影响整机（经 US-510 where-used）                                           | ⬜   |
| 2   | 同上                                                   | 查差异                         | 返回生效前后发生项集对比：新增 / 删除 / 改量 / 改版                              | ⬜   |
| 3   | `released` 未生效的 ECN                                | 改生效日（不早于当日）         | 关联发生项的 `effective_from` / `effective_to` 级联更新                          | ⬜   |
| 4   | `released` 未生效的 ECN                                | 取消                           | 关联发生项整体回退，不留半生效状态                                               | ⬜   |
| 5   | 手填与 ECN 冲突的 `effective_from`                     | 保存                           | 拒绝——生效日的真相源是 ECN                                                       | ⬜   |
| 6   | 两个 ECN 改同一逻辑行                                  | 先后生效                       | 该行发生项按生效日形成不重叠的时间序列（配合 US-508 AC#2）                       | ⬜   |
| 7   | ECN 已 `effective`                                     | 取消或提前生效日               | 拒绝；错误提示改走更正 ECN                                                       | ⬜   |
| 8   | 当日为 2026-10-01                                      | 发布生效日为 2026-09-15 的 ECN | 拒绝（追溯生效）                                                                 | ⬜   |
| 9   | 一个 ECN 改 3 张头，其中一张的新发生项与现有发生项重叠 | 发布                           | 整批回滚，3 张头都不变；错误点名冲突头与发生项                                   | ⬜   |
| 10  | 一个 ECN 的变更使 `consume` 子图成环                   | 发布                           | 整批回滚，错误用 US-509 的环错误码                                               | ⬜   |
| 11  | ECN 已 `effective` 后发现错误                          | 发布更正 ECN（生效日 ≥ 当日）  | 原 ECN 与原发生项不变；更正 ECN 截止错误发生项并引入正确发生项，历史解析结果不变 | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

「BOM 头版本 + 行生效期」不等于变更管理：版本回答「这张 BOM 长什么样」，
ECN 回答「**这次改动**动了哪些 BOM 的哪些行」。没有 ECN 实体，AC#1 与 AC#2 都无从实现——
影响面与差异都是以「一次变更」为单位的查询，而那个单位在模型里必须有对应物。

AC#3 与 AC#5 合起来确立单一真相源：`ecn.effective_date` 是源，发生项的 `effective_from` / `effective_to` 是派生冗余
（冗余存在的理由是让 US-508 的视图解析不必每次 join ECN）。冗余字段必须由源级联维护，
否则就是第二个真相源。

**为什么取消与改期只在生效前。** US-508 的历史保证是「对过去日期的结构解析不会被之后的发布改写」。
已生效的 ECN 若能取消或提前，被它截止或引入的发生项就会在过去的日期上凭空出现或消失，昨天导出给 MRP 的结构今天就复现不了。
所以生效是单向门：之后的修正只能是**向前**生效的更正 ECN（AC#11），旧的错误在历史上如实保留。
`released` 未生效的改期与取消不碰过去，不受此限（AC#3 / #4）。

**发布是校验点，不是逐行写入。** 一次 ECN 可能同时截止旧发生项、引入新发生项、跨多张头；逐行校验会在中间态看到
「旧的已截止、新的未插入」的空窗或「新的已插入、旧的未截止」的重叠。所以 ECN 走与 US-507 头发布同一机制：
草稿期可暂不合法，`draft → released` 时对所有受影响头的聚合整批校验，一处冲突整批回滚（AC#9 / #10）。
AC#4 的「不留半生效状态」需要同一事务边界：一次 ECN 取消可能涉及跨多张 BOM 的数十个发生项。

**AC#2 的差异不能由 `@aiao/rxdb-plugin-working-tree` 的 `diff()` 承担**，三条理由，
按 [CONVENTIONS 的病灶数 ≥ 抽象数](../../CONVENTIONS.md#价值待证) 这里必须说清，
否则 `ecn` 看起来就是一个已有能力的重复抽象：

1. **轴不对。** `WorkingTreeDiff` 的
   [`WorkingTreeDiffOptions`](../../../packages/rxdb-plugin-working-tree/src/working-tree/diff.ts)
   键集是封闭的，文件头自述「只有一条轴，而且它没有入参」——左端恒为 `baseHeadCommitId`、
   右端恒为当前工作树，`from` / `to` / `ref` 被明确拒绝。AC#2 要的是「这个 ECN 生效前 ↔ 生效后」，
   是任意两点，不是 HEAD ↔ 工作树。
2. **单位不对。** `listCommits()` 的单位是提交，而一次 ECN 可能跨多次提交，
   也可能一次提交都没有（生效日在未来、行已写入但尚未到期）。「一次变更」这个单位在提交图里没有对应物。
3. **维度不对。** 工作树的 diff 是**写入时刻**的差异；ECN 的差异是**生效时刻**的差异。
   同一批行在两个时间轴上的前后关系并不一致——AC#6 的两个 ECN 先后生效，写入顺序可以相反。

可以复用的是别处：AC#4 的整体回退需要的事务边界与 `commit()` 同源，那是引擎能力，不是本故事的抽象。

## 价值待证

同 [epic-009](../../epics/epic-009-bom-domain-model.md#价值待证整个-epic)。

## 实现文件

- `packages/rxdb-plugin-bom/` — 待建；ECN 实体与派生生效期

## References

- [epic-009 BOM 领域模型](../../epics/epic-009-bom-domain-model.md)
- [US-507 BOM 图骨架](US-507-bom-graph-skeleton.md) — 前置；行发生项与发布校验机制
- [US-508 BOM 视图解析](US-508-bom-view-resolution.md) — 前置；禁止追溯生效
- [US-509 DAG 约束与环路检测](US-509-bom-dag-cycle-detection.md) — AC#10 的环错误码
- [US-510 多级展开与 where-used 反查](US-510-bom-multilevel-explosion.md) — 前置；AC#1 影响面
- [`WorkingTreeDiffOptions`](../../../packages/rxdb-plugin-working-tree/src/working-tree/diff.ts) — 单轴 diff 的证据锚点
