---
id: US-509
title: DAG 约束与环路检测下沉存储层
status: Backlog
priority: Low
epic: epic-009-bom-domain-model
created: 2026-09-22
updated: 2026-09-26
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
  AC#2 的自反边 CHECK 只看单行，通过它声明，不自己发 DDL。可达性要读整张边表，装不进声明式约束，
  其触发器由本故事自己发 DDL）

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

**本故事没有脱离 BOM 场景的独立病灶**：无环是 BOM 的领域约束，不是 `@aiao/rxdb-plugin-graph` 的缺陷。
图插件的 `type: 'directed-graph'` 声明的是有向，不是无环；`addEdge` 按 `(sourceId, targetId)` upsert，
成环与自环都能写入，这是**既定语义**——`directed-weighted.spec.ts`「查找循环交易」、
`directed-unweighted.spec.ts` / `undirected-unweighted.spec.ts`「自环边场景（当前实现允许）」与
`graph-semantics.spec.ts`「自环边」等用例把它钉住。读侧由
[`query_graph_sql.ts`](../../../packages/rxdb-plugin-graph/src/sqlite/query_graph_sql.ts) 的 `cycle` 判定与
`GRAPH_MAX_PATH_EXPANSIONS` 保证终止，`findPaths` 只返回非循环路径。BOM 需要的是在这之上**再加**一条写入期约束。

**「存储层」不是一个普适的位置，它到哪一层取决于适配器。** 本仓有 10 个适配器
（`rxdb-adapter-*` 目录共 12 个，其中 `sqlite-core` 是 SQLite 家族的共享层、`encrypted` 是内建加密库，
都没有 `IRxDBAdapter` 实现），按 DDL 归谁掌控分三档：

| 档           | 适配器                                                                                                                  | 环约束落在哪  | AC#5 是否成立           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------- |
| DDL 本仓掌控 | `sqlite` / `sqlite-wasm` / `wa-sqlite` / `sqliteai` / `electron` / `tauri` / `miniprogram`（DDL 由 `sqlite-core` 生成） | SQLite 触发器 | ✅                      |
| DDL 本仓掌控 | `pglite`                                                                                                                | PG 触发器     | ✅                      |
| DDL 在远端   | `supabase` / `http`                                                                                                     | 本仓发不出去  | ❌，按 AC#6 / AC#7 降级 |

触发器生成有现成先例：FTS 按方言各有一份生成器，PGlite 的
[`fts/build-fts-triggers.ts`](../../../packages/rxdb-adapter-pglite/src/fts/build-fts-triggers.ts) 与 SQLite 共享层的
[`fts5/build-fts-triggers.ts`](../../../packages/rxdb-adapter-sqlite-core/src/fts5/build-fts-triggers.ts)。可复用的是机制，不是那份 SQL。

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

**首轮切片内关不掉**：AC#2 等 US-030 阶段 A 的 CHECK，AC#4 等 US-513 引入 `flow_direction`，
AC#8 等 US-510 阶段 B 的闭包表，见 [epic-009 解锁前须先处理](../../epics/epic-009-bom-domain-model.md#解锁前须先处理)。

## 价值待证

同 [epic-009](../../epics/epic-009-bom-domain-model.md#价值待证整个-epic)。图插件允许成环是既定语义（见技术笔记），
本故事的价值完全取决于 BOM 驱动场景，不能脱离 Epic 单独解锁。

## 实现文件

- `packages/rxdb-plugin-bom/` — 待建；可达性校验
- `packages/rxdb-plugin-graph/` — 可选：给图插件加 opt-in 的写入期无环约束，默认行为不变

## References

- [epic-009 BOM 领域模型](../../epics/epic-009-bom-domain-model.md)
- [US-503 图数据插件](US-503-graph-data.md) — 现有图能力与其边界
- [US-507 BOM 图骨架](US-507-bom-graph-skeleton.md) — 前置；`bom_line` 的来源
- [US-513 联产品与副产品](US-513-bom-coproduct-byproduct.md) — AC#4 的前置；`flow_direction` 的来源
- [US-510 多级展开与 where-used 反查](US-510-bom-multilevel-explosion.md) — AC#8 依赖其阶段 B
- [US-030 实体元数据层的声明式存储约束](../core/US-030-declarative-storage-constraints.md) — AC#2 的 CHECK 落点
