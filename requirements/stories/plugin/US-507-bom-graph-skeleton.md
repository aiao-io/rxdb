---
id: US-507
title: BOM 图骨架：物料、修订与多重边 BOM 行
status: Backlog
priority: Low
epic: epic-009-bom-domain-model
created: 2026-09-22
updated: 2026-09-26
tags: [plugin, bom, schema]
---

# 用户故事：BOM 图骨架：物料、修订与多重边 BOM 行

## 作为/我想要/以便

**作为** BOM 工程师
**我想要** 同一子件在同一父件下按行项号多次出现，并可选择锁定或不锁定子件版本
**以便** 一颗螺钉能分别记在三道工序上，EBOM 能表达「用 D 版齿轮」

## 交付阶段

| 阶段 | 内容                                                                                 | 状态 |
| ---- | ------------------------------------------------------------------------------------ | ---- |
| A    | `item` + `item_revision`；`serialized` 在 item、`default_phantom` 在 item_revision   | ⬜   |
| B    | `bom_header` + `bom_line`；边以 `line_no` 为身份；`child_revision_id` NULL=imprecise | ⬜   |
| C    | `bom_line_designator` 位号子表（边的多值属性）+ 位号数与 `qty` 的一致性约束          | ⬜   |

## 范围边界

### In Scope

- 节点分裂为 `item`（主数据）与 `item_revision`（修订），修订带 `state` 与发布时间
- `bom_header` 挂在**修订**上：唯一键是 `(parent_revision_id, bom_type, org_id, alternative_no)`
- `bom_line` 的身份是 `(bom_header_id, line_no)`，**`(parent, child)` 不唯一**
- 子件引用二态：`child_revision_id IS NULL` = imprecise（跟随最新发布版）／非 NULL = precise（锁版）
- 位号（reference designator）作为行的 1:N 子表；位号数与 `qty` 一致，`qty` 是需求量的唯一真相源
- 随修订走的属性挂 `item_revision`（`default_phantom`），随物料走的挂 `item`（`serialized`）

### Out of Scope

- 有效期解析与视图过滤（→ US-508）
- 成环校验（→ US-509）
- 用量语义与损耗（→ US-511）
- 替代组（→ US-512）

## 验收标准

| #   | 前置条件                       | 操作                          | 预期结果                                              | 状态 |
| --- | ------------------------------ | ----------------------------- | ----------------------------------------------------- | ---- |
| 1   | 父件 A、子件 B                 | 插入 3 行 B，line_no 10/20/30 | 3 行独立存在，不被唯一约束拒绝                        | ⬜   |
| 2   | 行 `child_revision_id = NULL`  | 子件发布新修订                | 解析结果跟随最新发布版（imprecise）                   | ⬜   |
| 3   | 行锁定 D 版                    | 子件发布 E 版                 | 解析结果仍为 D 版（precise）                          | ⬜   |
| 4   | 一行挂 100 个位号、`qty = 100` | 查询该行                      | 位号清单完整返回；需求量取自 `qty`，不由位号数推导    | ⬜   |
| 5   | 一行挂 99 个位号、`qty = 100`  | 保存                          | 拒绝，错误同时给出位号数与 `qty`                      | ⬜   |
| 6   | D 版 phantom、E 版不是         | 分别解析两版                  | `default_phantom` 随修订取值，不随物料                | ⬜   |
| 7   | `item.serialized = true`       | 保存                          | 标记可持久化（为 US-523 实例 BOM 预留，本故事不消费） | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**现有两个插件都不可复用，这是本故事必须新建 schema 的原因。**

`@aiao/rxdb-plugin-graph` 的边表工厂（`graph_edge_entity.ts` 的默认导出）硬编码了一条组合唯一索引
[`sourceId_targetId`](../../../packages/rxdb-plugin-graph/src/graph_edge_entity.ts)：

```ts
{ name: 'sourceId_targetId', unique: true, properties: ['sourceId', 'targetId'] },
```

注释自述其意图是「防止节点间创建重复边」——即**同一对节点间禁止多条边**，与 AC#1 直接冲突。
BOM 是多重图（multigraph），不是简单图。

`@aiao/rxdb-plugin-tree` 的 `TreeAdjacencyListEntityBase` 是**单父**邻接表（`parentId`），
BOM 是多父 DAG，同样不可复用。

可选路径两条，归实现期决策：新建 `packages/rxdb-plugin-bom`，或扩 graph 插件使其支持
multigraph + 富边属性（后者是破坏性变更，需过 api-baseline）。

**BOM 头挂修订而不是挂物料，因此没有独立的 `version` 轴。** 「这张 BOM 长什么样」这个问题的答案
已经由 `parent_revision_id` 回答——修订本身就是版本。再给 `bom_header` 一个 `version` 列会产生
第二条版本轴，于是「D 版物料的 v3 BOM」与「E 版物料的 v1 BOM」之间的先后关系无人能裁决。
`alternative_no` 是**并行**的备选方案（同时有效，见 [US-508](US-508-bom-view-resolution.md) AC#3），
不是版本；时间维度由生效期承担，一次变更的单位由 [US-515](US-515-bom-change-management.md) 的 ECN 承担。

**AC#5 防的是第二个数量真相源。** 位号清单在电子行业是强需求，而「挂了 100 个位号」看起来
天然就是「需要 100 个」——一旦允许由位号数推导需求量，`qty` 与 `count(designator)` 就是两个
可以不一致的真相源，[US-511](US-511-bom-quantity-semantics.md) 的七步公式只认 `qty`，
两者漂移时展开结果与装配图对不上，且没有任何一方会报错。

**关闭条件**：`(bom_header_id, line_no)` 唯一而 `(parent_revision_id, child_item_id)` 不唯一，
两条同时在存储层成立。

## 价值待证

本故事与 [epic-009](../../epics/epic-009-bom-domain-model.md#价值待证整个-epic) 其余 18 条同标
**价值待证**：新增 `item_revision` 等抽象，对应零个已知病灶。解锁条件见 epic。

## 实现文件

- `packages/rxdb-plugin-bom/` — 待建；BOM 实体、装饰器与仓储

## References

- [epic-009 BOM 领域模型](../../epics/epic-009-bom-domain-model.md)
- [`sourceId_targetId`](../../../packages/rxdb-plugin-graph/src/graph_edge_entity.ts) — 边表唯一索引，不可复用的证据锚点
- [US-030 实体元数据层的声明式存储约束](../core/US-030-declarative-storage-constraints.md) — AC#5 的 CHECK 落点
