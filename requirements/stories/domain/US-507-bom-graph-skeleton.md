---
id: US-507
title: BOM 图骨架：物料、修订与多重边 BOM 行
status: Backlog
priority: Low
epic: epic-009-bom-domain-model
created: 2026-09-22
updated: 2026-10-09
tags: [domain, bom, schema]
---

# 用户故事：BOM 图骨架：物料、修订与多重边 BOM 行

## 作为/我想要/以便

**作为** BOM 工程师
**我想要** 同一子件在同一父件下按行项号多次出现，并可选择锁定或不锁定子件版本
**以便** 一颗螺钉能分别记在三道工序上，EBOM 能表达「用 D 版齿轮」

## 交付阶段

| 阶段 | 内容                                                                                                                                      | 状态 |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| A    | `item` + `item_revision`；`serialized` 在 item、`default_phantom` 在 item_revision                                                        | ⬜   |
| B    | `bom_header`（含 `draft` / `released` 状态）+ `bom_line`（逻辑行）+ `bom_line_occurrence`（行发生项）；`child_revision_id` NULL=imprecise | ⬜   |
| C    | `bom_line_designator` 位号子表（挂行发生项）+ 位号数与 `qty` 的一致性，在发布转移上校验                                                   | ⬜   |

阶段归属：A 关闭 AC#6 / #7 / #14；B 关闭 AC#1 / #8 / #9 / #11 与 AC#10 / #13 的发生项部分；C 关闭 AC#4 / #5 / #12 与 AC#10 / #13 的位号部分。
AC#2 / #3 要 [US-508](US-508-bom-view-resolution.md) 的 imprecise 解析规则，随 epic-009 首轮第 2 步关闭。

## 范围边界

### In Scope

- 节点分裂为 `item`（主数据）与 `item_revision`（修订），修订带 `state` 与 `effective_from`（不得早于发布当日；imprecise 引用按它选修订，规则见 [US-508](US-508-bom-view-resolution.md)）；
  **已发布修订除状态转移外不可改**（`default_phantom`、`effective_from` 等），要改须发布新修订（AC#14）
- `bom_header` 挂在**修订**上：唯一键是 `(parent_revision_id, bom_type, org_id, alternative_no)`
- **两层行身份**（见技术笔记「行身份」）：
  - `bom_line` = 逻辑行，「这条设计行是谁」，身份 `(bom_header_id, line_no)` 唯一，**`(parent, child)` 不唯一**；
    带可空 `ecn_in_id`（ECN 在已发布头下新建逻辑行时填，首轮恒空，见 US-515 表 × 操作矩阵）；
  - `bom_line_occurrence` = 行发生项，「这条行在 `[effective_from, effective_to)` 取哪组值」——`child_item_id`、
    `child_revision_id`、`qty` 等随时间变化的值都在这一层；同一逻辑行的发生项区间**不得重叠**（无论子件是否相同）；
    带可空 `ecn_in_id` / `ecn_out_id`（首轮恒空，US-515 落地后启用，见其表 × 操作矩阵）
- **结构归属列创建后不可改**（见技术笔记「结构归属列」）：`item_revision.item_id`；`bom_header` 的 `parent_revision_id`、`bom_type`、`org_id`；
  `bom_line.bom_header_id`；`bom_line_occurrence.bom_line_id`；以及子表指向所属发生项或组的列（位号、替代组成员、工序分摊）。
  草稿头里也不可改——要「移动」就在草稿里删除后重建，走已有的逐行校验，不开第二条迁移路径
- 发生项的 `qty` 按 [US-511 十进制值合同](US-511-bom-quantity-semantics.md#技术笔记)以规范十进制串存储，不经 `number`
- 子件引用二态：`child_revision_id IS NULL` = imprecise（跟随评估日已发布的最新修订，规则见 [US-508](US-508-bom-view-resolution.md)）／
  非 NULL = precise（锁版）；`child_revision_id` 必须属于本发生项的 `child_item_id`
- 位号（reference designator）作为**行发生项**的 1:N 子表，只对声明 `designator_managed = true` 的离散计数行要求位号数等于名义 `qty`
  （名义用量，不是损耗后毛需求）；`qty` 是需求量的唯一真相源
- 随修订走的属性挂 `item_revision`（`default_phantom`），随物料走的挂 `item`（`serialized`）
- **发布边界**：`draft` 头下的行与子表可自由编辑，只有**跨行聚合**（位号计数、替代组、工序分摊、阶梯重叠）允许暂时不合法；
  单行 CHECK、同一逻辑行的发生项区间排他（AC#9）与判环（[US-509](US-509-bom-dag-cycle-detection.md)）在草稿里同样逐行即时生效。
  `draft → released` 的状态转移是**原子的存储层校验点**，
  已发布头的成员只接受 [US-515 写入协议](US-515-bom-change-management.md#已发布头的写入协议)「表 × 操作」矩阵内的形态（挂在 `draft` ECN 上的新逻辑行、新发生项及其子表、截止标记，以及 ECN 状态转移的级联），其余改写一律拒绝；
  首轮没有 `ecn` 实体，已发布头的成员写入全部拒绝，US-515 落地时只**追加**放行形态，不改这条拒绝

### Out of Scope

- 有效期解析与视图过滤（→ US-508）
- 成环校验（→ US-509）
- 用量语义与损耗（→ US-511）；行发生项上的 `phantom_override` 由 US-511 阶段 C 新增，本故事只建 `item_revision.default_phantom`
- 替代组（→ US-512）
- 每次变更都新建父修订——本故事选择「同一头内用发生项保存行历史」，见技术笔记

## 验收标准

| #   | 前置条件                                                              | 操作                                                                                                                                                 | 预期结果                                                                                                                                            | 状态 |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 父件 A、子件 B                                                        | 插入 3 条逻辑行，line_no 10/20/30，子件都是 B                                                                                                        | 3 行独立存在，不被唯一约束拒绝                                                                                                                      | ⬜   |
| 2   | 行发生项 `child_revision_id = NULL`                                   | 子件发布新修订                                                                                                                                       | 解析结果跟随最新发布版（imprecise）                                                                                                                 | ⬜   |
| 3   | 行发生项锁定 D 版                                                     | 子件发布 E 版                                                                                                                                        | 解析结果仍为 D 版（precise）                                                                                                                        | ⬜   |
| 4   | `designator_managed` 行发生项挂 100 个位号、`qty = 100`               | 查询该发生项                                                                                                                                         | 位号清单完整返回；需求量取自 `qty`，不由位号数推导                                                                                                  | ⬜   |
| 5   | `draft` 头下一条 `designator_managed` 发生项挂 99 个位号、`qty = 100` | ① 逐条录入位号 ② 把头置 `released`（含直连 SQL）                                                                                                     | ① 允许（草稿可暂不合法）② 拒绝、整次转移回滚，错误同时给出位号数与 `qty`                                                                            | ⬜   |
| 6   | D 版 phantom、E 版不是                                                | 分别解析两版                                                                                                                                         | `default_phantom` 随修订取值，不随物料                                                                                                              | ⬜   |
| 7   | `item.serialized = true`                                              | 保存                                                                                                                                                 | 标记可持久化（为 US-523 实例 BOM 预留，本故事不消费）                                                                                               | ⬜   |
| 8   | `draft` 头下逻辑行 H/10 有发生项 `[2026-01-01, 2026-10-01)` 子件 B    | 再写同一逻辑行发生项 `[2026-10-01, +∞)` 子件 B′                                                                                                      | 接受；旧发生项原值不变                                                                                                                              | ⬜   |
| 9   | 同 #8 的第一条发生项                                                  | 再写 `[2026-09-01, +∞)`（无论子件是否相同）                                                                                                          | 拒绝：同一逻辑行发生项区间重叠                                                                                                                      | ⬜   |
| 10  | 已发布头                                                              | 直连 SQL 改其发生项 `qty`、删位号、增不挂 `draft` ECN 的发生项                                                                                       | 全部拒绝；只放行 US-515 写入协议内的形态（首轮无 ECN，全部拒绝）                                                                                    | ⬜   |
| 11  | 发生项 `child_item_id = B`                                            | `child_revision_id` 指向 C 的修订                                                                                                                    | 拒绝：修订不属于子件                                                                                                                                | ⬜   |
| 12  | 质量单位（kg）行，未声明 `designator_managed`                         | 不挂位号并发布                                                                                                                                       | 接受；位号计数规则不适用于非位号管理行                                                                                                              | ⬜   |
| 13  | 组织 X 的 `draft` 头有 A→B，组织 Y 的 `draft` 头有 B→A                | 直连 SQL 逐一更新：Y 头的 `org_id` 改为 X、头的 `bom_type`、`parent_revision_id`、`bom_line.bom_header_id`、发生项的 `bom_line_id`、修订的 `item_id` | 全部拒绝（`BomWriteProtocolError`，点名列）；X 内不出现环。阶段 C 追加：位号改指另一发生项同样拒绝；US-510 阶段 B 落地后追加 `bom_reach` 零写入断言 | ⬜   |
| 14  | 修订 D 已发布                                                         | 直连 SQL 改 D 的 `default_phantom`、`effective_from`                                                                                                 | 拒绝（`BomWriteProtocolError`）；改虚拟件标记须发布新修订 E                                                                                         | ⬜   |

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

**落点：新建 `packages/rxdb-plugin-bom`**（owner 2026-10-02 决定）。另一条路——扩 graph 插件支持
multigraph + 富边属性——是破坏性变更、要过 api-baseline，不取。graph 插件允许成环的既有语义保持不变。

**BOM 头挂修订而不是挂物料，因此没有独立的 `version` 轴。** 「这张 BOM 长什么样」这个问题的答案
已经由 `parent_revision_id` 回答——修订本身就是版本。再给 `bom_header` 一个 `version` 列会产生
第二条版本轴，于是「D 版物料的 v3 BOM」与「E 版物料的 v1 BOM」之间的先后关系无人能裁决。
`alternative_no` 是**并行**的备选方案（同时有效，见 [US-508](US-508-bom-view-resolution.md) AC#3），
不是版本；时间维度由行发生项的生效期承担，一次变更的单位由 [US-515](US-515-bom-change-management.md) 的 ECN 承担。

**行身份为什么分两层。** 「这条设计行是谁」与「这条行在哪段时间取哪个值」是两种身份。
只有一层 `(bom_header_id, line_no)` 时，同一行的相邻有效期记录（`[01-01, 10-01)` 与 `[10-01, +∞)`）
会先撞唯一键，区间排他根本轮不到执行（SQLite 探针：`UNIQUE constraint failed`）；若改为原地覆盖，
ECN 差异、历史展开与实例来源都会丢失。于是：

- 唯一键 `(bom_header_id, line_no)` 只管逻辑行；
- 区间排他只管同一 `bom_line_id` 下的发生项，**按逻辑行而不是按子件**判重叠——同一逻辑行任一时点至多一个发生项，
  「同一位置同时用两种子件」必须开两条逻辑行；
- 位号、替代组成员、实例来源一律引用**发生项** ID：它们描述的是「那一段时间的那组值」；`bom_map` 锚定逻辑行，发生项 ID 连同解析所得的子件修订只作跟进基线（见 [US-516](US-516-ebom-mbom-mapping.md)）。

**结构归属列。** 判环（[US-509](US-509-bom-dag-cycle-detection.md)）与可达性维护（[US-510](US-510-bom-multilevel-explosion.md)）的入口是发生项写入；
但图的作用域与父端点并不只由发生项决定。组织 X 有 A→B、组织 Y 有 B→A，把 Y 的头改到 X，不碰任何发生项就在 X 内成环；
改头的 `bom_type`、把逻辑行挂到另一张头、把发生项挂到另一条逻辑行、改修订所属物料，同样会悄悄改变所属图或父端点（AC#13）。
两条路：给每一列都配「旧作用域删除 + 新作用域插入」的原子重检，或者让这些列创建后不可改。取后者——前者要为每一列穷举迁移协议，
后者只需在 UPDATE 触发器里拒绝，而「移动」本来就可以表达为草稿里的删除加重建，走已有校验。

另一条路——每次变更都新建父修订——同样自洽，但会把 [US-515](US-515-bom-change-management.md) AC#6 的
「同一行时间序列」改成跨头比对；选同头发生项是因为它让 ECN 的差异单位与存储单位一致。

**AC#5 防的是第二个数量真相源，也防「每写一行都要合法」的构造死锁。** 位号清单在电子行业是强需求，而「挂了 100 个位号」看起来
天然就是「需要 100 个」——一旦允许由位号数推导需求量，`qty` 与 `count(designator)` 就是两个
可以不一致的真相源，[US-511](US-511-bom-quantity-semantics.md) 的七步公式只认 `qty`，
两者漂移时展开结果与装配图对不上，且没有任何一方会报错。

但「位号数 = `qty`」是跨行聚合：每插一个位号就校验，第一个位号就必然失败，合法聚合永远建不出来；
CHECK 只看单行且 SQLite 禁止 CHECK 子查询（探针：`subqueries prohibited in CHECK constraints`），
SQLite 也没有事务提交期触发器。所以落点是**状态转移**：

- `bom_header` 上 `draft → released` 的 UPDATE 由插件触发器（同 [US-509](US-509-bom-dag-cycle-detection.md) 的先例）
  在同一语句里对整张头做聚合校验，失败即 `RAISE` 回滚整次转移；触发器体内可以读子表，不受 CHECK 的子查询限制。
  错误类为 `BomPublishValidationError`（AC#5），成员表的协议外写入为 `BomWriteProtocolError`（AC#10），归一方式见
  [US-030 违约错误的判别](../core/US-030-declarative-storage-constraints.md#技术笔记)；
  错误里带出位号数与 `qty` 两个数，要求 `RAISE()` 接受表达式——SQLite 3.47.0 起才有，宿主版本门槛见
  [US-030](../core/US-030-declarative-storage-constraints.md) AC#7；
- 成员表（发生项、位号）的 INSERT / UPDATE / DELETE 触发器在所属头已发布时只放行
  [US-515 写入协议](US-515-bom-change-management.md#已发布头的写入协议)的形态。那些形态写进来的发生项挂在 `draft` ECN 上，
  ECN 发布前不可见（[US-508](US-508-bom-view-resolution.md) AC#12）、发布时整批校验——直连 SQL 走同一条路，
  产出的也只是待校验的草稿，绕不过发布校验点；
- 同一机制服务 [US-512](US-512-bom-substitute-group.md) AC#5 与 [US-520](US-520-bom-routing-operation.md) AC#4 的另两条聚合，
  不扩展 [US-030](../core/US-030-declarative-storage-constraints.md) 为跨表规则引擎。

**关闭条件**：逻辑行 `(bom_header_id, line_no)` 唯一、`(parent_revision_id, child_item_id)` 不唯一、
同一逻辑行发生项区间不重叠，三条同时在存储层成立；结构归属列创建后不可改；位号聚合从空草稿可构造、非法不可发布、发布后不可直连改写。

## 价值待证

本故事与 [epic-009](../../epics/epic-009-bom-domain-model.md#价值待证整个-epic) 其余 18 条同标
**价值待证**：新增 `item_revision` 等抽象，对应零个已知病灶。解锁条件见 epic。

## 实现文件

- `packages/rxdb-plugin-bom/` — 待建；BOM 实体、装饰器与仓储

## References

- [epic-009 BOM 领域模型](../../epics/epic-009-bom-domain-model.md)
- [`sourceId_targetId`](../../../packages/rxdb-plugin-graph/src/graph_edge_entity.ts) — 边表唯一索引，不可复用的证据锚点
- [US-030 实体元数据层的声明式存储约束](../core/US-030-declarative-storage-constraints.md) — 前置：阶段 A 的 SQLite 版本门槛（US-030 AC#7，本故事 AC#5 / #10 的触发器动态消息）与阶段 C（本故事 AC#9 的发生项区间排他）；跨行聚合不在其范围
- [US-509 DAG 约束与环路检测下沉存储层](US-509-bom-dag-cycle-detection.md) — 插件触发器先例；SQLite 宿主版本门槛
- [US-515 变更管理](US-515-bom-change-management.md) — 已发布头的写入协议（AC#10 的放行形态）
- [US-511 展开数量正确性](US-511-bom-quantity-semantics.md) — `qty` 的十进制值合同
