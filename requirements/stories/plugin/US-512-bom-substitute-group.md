---
id: US-512
title: 替代组与替代策略
status: Backlog
priority: Low
epic: epic-009-bom-domain-model
created: 2026-09-22
updated: 2026-10-01
tags: [plugin, bom, schema]
---

# 用户故事：替代组与替代策略

## 作为/我想要/以便

**作为** BOM 工程师
**我想要** 替代关系作为「组」存在、策略挂在组上
**以便** MRP 能按概率分摊需求，且单向可替代不被误当成双向

## 范围边界

### In Scope

- `bom_substitute_group` 作为一等实体：`strategy`（priority / proportional / manual）、`allow_mix`；隶属某张 `bom_header`
- 组成员是**同一头**下的行发生项（[US-507](US-507-bom-graph-skeleton.md)），成员侧：`role`（`primary` / `substitute`）、
  `substitute_priority`、`usage_probability`、`equiv_qty`
- **替代方向落在数据结构上**：每组恰好一个 `primary` 成员，它是原始需求对象；替代只从 `primary` 指向各 `substitute`。
  替代件之间、替代件对 `primary` 都不存在替代关系，不需要另建关系表
- **共同需求基准**：`equiv_qty` = 满足 1 单位 `primary` 需求所需的该成员数量（成员自己的单位）；分摊守恒按 `primary` 需求量计，
  不把不同物料的裸数量相加
- 展开时按策略分摊或择一；`manual` 的选择由 `ResolutionContext`（[US-508](US-508-bom-view-resolution.md)）传入
- 聚合约束（恰好一个 primary、priority 不并列、proportional 概率合计为 1、非法策略组合）在头的**发布转移**上校验，
  与 US-507 位号聚合同一机制

### Out of Scope

- 临时代用（带审批与限量的例外流程）——属事务域，不进 BOM 主数据
- 替代件的采购/库存联动
- 任意有向替代图（A 可代 B、B 可代 C 的传递链）——需要时以真实样本另立，本故事只支持以 `primary` 为中心的星形

## 验收标准

| #   | 前置条件                                                          | 操作                                   | 预期结果                                                                                  | 状态 |
| --- | ----------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------- | ---- |
| 1   | 组 strategy=proportional，primary A + 替代 B、C，概率 0.5/0.3/0.2 | 展开 primary 需求 100                  | A/B/C 分别承担 50/30/20 单位 primary 需求，各乘自己的 `equiv_qty` 输出；守恒按 primary 计 | ⬜   |
| 2   | 同组改为 strategy=priority                                        | 展开                                   | 只取当日有效成员中 `substitute_priority` 最高者                                           | ⬜   |
| 3   | primary A，替代 B、C                                              | 查询「B 能否由 A 代」「B 能否由 C 代」 | 都为否：只有 A → B、A → C 两条方向，不推导出 B↔C 或 B→A                                   | ⬜   |
| 4   | `allow_mix = false`，strategy=priority / manual                   | 混用两个成员                           | 拒绝                                                                                      | ⬜   |
| 5   | `draft` 头下 strategy=proportional，逐条录入 0.5 / 0.3 / 0.2      | ① 每条录入后 ② 发布头                  | ① 都允许（草稿可暂不合法）② 合计为 1 通过；若合计 ≠ 1 则拒绝发布并给出实际合计值          | ⬜   |
| 6   | 0.5/0.3/0.2 的 C 在评估日失效（US-508 有效期）                    | 展开                                   | C 退出，A/B 按 0.5:0.3 重分配为 0.625/0.375；存储里的源概率仍是 0.5/0.3/0.2               | ⬜   |
| 7   | strategy=priority，两个成员 `substitute_priority` 相同            | 发布头                                 | 拒绝：优先级并列                                                                          | ⬜   |
| 8   | strategy=manual，`ResolutionContext` 未给本组选择                 | 展开                                   | 结果标 `unresolved` 列出成员；US-514 / US-521 消费即拒绝                                  | ⬜   |
| 9   | 组内全部成员在评估日失效                                          | 展开                                   | 报错点名该组，不输出 0 需求                                                               | ⬜   |
| 10  | strategy=proportional 且 `allow_mix = false`                      | 发布头                                 | 拒绝：按比例分摊本身就是混用                                                              | ⬜   |
| 11  | 组内没有或有两个 `primary`；或成员属于另一张头                    | 发布头                                 | 拒绝，错误点名组与违规成员                                                                | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**替代料不能用「平行边 + 行属性」表达**，三条理由：

1. `strategy` 与 `allow_mix` 是**组的属性**，不是行的属性——放在行上就会出现同组各行策略不一致的非法态；
2. 单向可替代需要方向，边上放不下；
3. `usage_probability` 的合计约束（AC#5）需要一个能承载「组」这个整体的实体。

**方向为什么用 `primary` 而不是数值优先级。** 数值优先级能表达全序择优，表达不了任意有向关系与不可比项：
「A 可用 B 代、A 可用 C 代、B/C 互不可代」用单一优先级会额外推导出 B↔C。真实替代组的方向几乎总是
「设计指定的那颗」→「允许的替代」，所以把方向做成结构：组里恰好一个 `primary`，替代只从它出发（AC#3）。
`substitute_priority` 只在 priority 策略下决定择优顺序，不承担方向语义。

**策略组合的结果全部写死，不留给实现猜：**

| strategy     | `allow_mix = true`   | `allow_mix = false`         |
| ------------ | -------------------- | --------------------------- |
| priority     | 最高者不足时按序补足 | 只取当日有效的最高者        |
| proportional | 按概率分摊           | 非法组合，发布拒绝（AC#10） |
| manual       | 按调用方给的分配     | 按调用方给的唯一选择        |

priority 下「不足」指调用方在 `ResolutionContext` 里给了可用量上限；不给则不存在不足，只取最高者。

**AC#5 拒绝而不归一化**，与 [US-520](US-520-bom-routing-operation.md) AC#4 的分摊比例同一裁决。
归一化看起来更友好，代价是它会把两种录入错误变成同一个静默结果：漏录一行（0.5/0.3 → 归一成 0.625/0.375）
与录错小数点（0.5/0.03 → 0.943/0.057）都会得到一个合法的比例，而分摊结果与录入者的意图相差甚远。
拒绝并回报实际合计值，则录入者一眼能看出漏了多少。

**AC#5 与 AC#6 不矛盾。** 发布时校验的是**原始录入集合**；运行时某成员按有效期退出后，剩余有效子集按源概率的比例重分配，
只是一次计算，**不反写**源概率。两者作用于不同对象。

**AC#5 的落点是发布转移，不是 CHECK。** 合计为 1 是跨行聚合，CHECK 只看单行，
[US-030](../core/US-030-declarative-storage-constraints.md) 也把跨表断言列为 Out of Scope；
若每插一个成员就校验，第一条 0.5 就必然失败，合法组永远建不出来。所以与 [US-507](US-507-bom-graph-skeleton.md) AC#5 一样，
在 `bom_header` 的 `draft → released` 转移上由插件触发器整组校验，发布后的成员不可直连改写。

`bom_substitute_group` 的唯一键是 `(bom_header_id, code)`——替代组隶属于某张 BOM，不跨 BOM 复用；
成员必须是同一头的发生项（AC#11），可复用已有组合外键能力，不自造规则 DSL。
跨 BOM 复用的互换关系属于物料主数据的互换组，是另一个概念，不在本故事。

## 价值待证

同 [epic-009](../../epics/epic-009-bom-domain-model.md#价值待证整个-epic)。

## 实现文件

- `packages/rxdb-plugin-bom/` — 待建；替代组实体与分摊计算

## References

- [epic-009 BOM 领域模型](../../epics/epic-009-bom-domain-model.md)
- [US-511 展开数量正确性](US-511-bom-quantity-semantics.md) — 前置
- [US-507 BOM 图骨架](US-507-bom-graph-skeleton.md) — 前置；行发生项与发布边界
- [US-508 BOM 视图解析](US-508-bom-view-resolution.md) — `ResolutionContext` 与 `unresolved`
