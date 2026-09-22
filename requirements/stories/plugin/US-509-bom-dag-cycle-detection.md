---
id: US-509
title: DAG 约束与环路检测下沉存储层
status: Backlog
priority: Low
epic: epic-009-bom-domain-model
created: 2026-09-22
updated: 2026-09-22
tags: [plugin, bom, graph, integrity]
---

# 用户故事：DAG 约束与环路检测下沉存储层

## 作为/我想要/以便

**作为** 平台开发者
**我想要** 成环的边在存储层就被拒绝
**以便** ERP 集成、批量导入与直连脚本都绕不过去，成本卷算的拓扑排序永不死锁

## 范围边界

### In Scope

- 插入/更新 `bom_line` 时的可达性检查：子件是否已能到达父件
- 自反边（`child_item_id = parent_item_id`）的 CHECK 拒绝
- 无闭包表时的递归 CTE 兜底，带 `depth` 硬上限防脏数据
- 只有 `flow_direction = 'consume'` 的边参与环检测
- 「存储层」的适配器边界与无本地存储时的降级语义（见技术笔记的适配器矩阵）

### Out of Scope

- 闭包表的建立与增量维护（→ US-510 阶段 B；本故事只在闭包存在时用它加速）
- 联产品/副产品语义本身（→ US-513；本故事只负责把非 consume 边排除在检测外）
- 元数据层的声明式约束 DSL（→ [US-030](../core/US-030-declarative-storage-constraints.md)；
  可达性要读整张边表，装不进声明式约束，本故事自己发 DDL）

## 验收标准

| #   | 前置条件                           | 操作                          | 预期结果                                                           | 状态 |
| --- | ---------------------------------- | ----------------------------- | ------------------------------------------------------------------ | ---- |
| 1   | A→B→C 已存在                       | 插入 C→A                      | 存储层拒绝，错误里给出环路径                                       | ⬜   |
| 2   | 任意 BOM                           | 插入 `child = parent`         | CHECK 拒绝                                                         | ⬜   |
| 3   | 无闭包表的 org                     | 插入成环边                    | 递归 CTE 检出，`depth` 触上限时报错不静默通过                      | ⬜   |
| 4   | `flow_direction <> 'consume'` 的边 | 构成反向物料流                | **不**参与环检测，保存成功                                         | ⬜   |
| 5   | DDL 由本仓掌控的适配器             | 绕过 adapter 直连库写入成环边 | 触发器拒绝                                                         | ⬜   |
| 6   | `http` / `supabase`                | `init()`                      | 显式声明本适配器无写入期环约束并 fail-fast，不静默降级为仓储层校验 | ⬜   |
| 7   | 同上                               | 取环约束 DDL                  | 返回可供远端自行部署的 DDL 片段，部署与否由使用方负责              | ⬜   |
| 8   | 闭包表已建（依赖 US-510 阶段 B）   | 插入成环边                    | 检测走 O(1) 闭包命中，不退化为递归遍历                             | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**本故事是 epic-009 里唯一带独立病灶的一条**，可脱离 BOM 场景单独评审。

`@aiao/rxdb-plugin-graph` 的现状：`findPaths` 只保证**返回**非循环路径
（[README](../../../packages/rxdb-plugin-graph/README.md) 自述「路径查询返回非循环路径及对应边信息」），
但 `addEdge` 不阻止成环边**写入**。图插件的 `type: 'directed-graph'` 声明的是有向，不是无环——
调用方若假设 DAG，这个假设没有任何机制保证。

**「存储层」不是一个普适的位置，它到哪一层取决于适配器。** 本仓有 13 个适配器包，按 DDL 归谁掌控分三档：

| 档           | 适配器                                                                                                               | 环约束落在哪  | AC#5 是否成立           |
| ------------ | -------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------- |
| DDL 本仓掌控 | `sqlite` / `sqlite-wasm` / `wa-sqlite` / `sqliteai` / `electron` / `tauri` / `desktop` / `miniprogram` / `encrypted` | SQLite 触发器 | ✅                      |
| DDL 本仓掌控 | `pglite`                                                                                                             | PG 触发器     | ✅                      |
| DDL 在远端   | `supabase` / `http`                                                                                                  | 本仓发不出去  | ❌，按 AC#6 / AC#7 降级 |

触发器生成有现成先例：[`build-fts-triggers.ts`](../../../packages/rxdb-adapter-pglite/src/fts/build-fts-triggers.ts)
按方言各生成一份 DDL。可复用的是机制，不是那份 SQL。

**降级必须是显式的，这是本仓已经付过一次学费的地方。**
[`@aiao/rxdb-plugin-working-tree` 的 README](../../../packages/rxdb-plugin-working-tree/README.md)
在「能力边界」一节里写的是：

> 不假装拦得住比拦不住更重要：一道号称拦得住却拦不住的门禁，会让人把「没报错」当成「没被绕过」。

AC#6 就是这句话的执行形式——`http` / `supabase` 下不能让调用方以为环约束生效了。
AC#7 则是不放弃可达的那部分：DDL 片段可以导出，由使用方在自己的迁移里部署。

闭包表命中是环检测最便宜的形式，也是 US-510 阶段 B 除查询加速之外的第二个理由：

```sql
SELECT 1 FROM bom_closure
 WHERE bom_type = $t AND org_id = $o
   AND ancestor_id = $child AND descendant_id = $parent;
```

**关闭条件**：在 DDL 归本仓掌控的适配器上，绕过 adapter 直接写库仍被拒（AC#5）；
在其余适配器上，能力缺席被显式声明（AC#6）。多写入端是本故事存在的全部理由——
只在仓储层校验等于没校验，而声称在每个后端都校验到了，比没校验更坏。

## 价值待证

本故事的独立病灶见技术笔记；BOM 语境部分同
[epic-009](../../epics/epic-009-bom-domain-model.md#价值待证整个-epic)。

## 实现文件

- `packages/rxdb-plugin-bom/` — 待建；可达性校验
- `packages/rxdb-plugin-graph/` — 可选：给有向图补写入期无环约束

## References

- [epic-009 BOM 领域模型](../../epics/epic-009-bom-domain-model.md)
- [US-503 图数据插件](US-503-graph-data.md) — 现有图能力与其边界
- [US-510 多级展开与 where-used 反查](US-510-bom-multilevel-explosion.md) — AC#8 依赖其阶段 B
- [US-030 实体元数据层的声明式存储约束](../core/US-030-declarative-storage-constraints.md) — AC#2 的 CHECK 落点
