---
id: US-509
title: DAG 约束与环路检测下沉存储层
status: Backlog
priority: Low
epic: epic-009-bom-domain-model
created: 2026-09-22
updated: 2026-10-01
tags: [plugin, bom, graph, integrity]
---

# 用户故事：DAG 约束与环路检测下沉存储层

## 作为/我想要/以便

**作为** 平台开发者
**我想要** 成环的边在存储层就被拒绝
**以便** ERP 集成、批量导入与直连脚本都绕不过去，成本卷算的拓扑排序永不死锁

## 范围边界

### In Scope

- **约束作用域（保守政策）**：同一 `(bom_type, org_id)` 内，**所有已存储的 `consume` 行发生项**按物料级
  （`parent_item_id → child_item_id`）取并集，这张并集图无环。不区分修订、日期、备选与配置，草稿（含挂在 `draft` ECN 上的发生项）也计入，
  见技术笔记「为什么约束并集」。ECN 取消时级联删除其引入的发生项（[US-515](US-515-bom-change-management.md)），它们随之退出并集
- 插入发生项、更新其 `child_item_id` / `flow_direction` 时的可达性检查：子件是否已能到达父件；
  `bom_header.parent_revision_id` 与修订的 `item_id` 创建后不可改，于是这两处不需要再挂检查
- 自反边（`child_item_id = parent_item_id`）由同一个可达性触发器拒绝：它是路径长度 0 的退化环（子件「已能到达」父件），
  不另设 CHECK，也不依赖 [US-030](../core/US-030-declarative-storage-constraints.md)
- 无闭包表时的递归 CTE 兜底，带 `depth` 硬上限防脏数据
- 只有 `flow_direction = 'consume'` 的边参与环检测
- 「存储层」的适配器边界与无本地存储时的降级语义（见技术笔记的适配器矩阵）
- **写入端的提交协议**：首轮 BOM 实体不参与同步，在同步配置校验处显式拒绝；导入走 [US-521](US-521-bom-erp-mrp-integration.md)
  的整批原子提交；导出给远端的 DDL 自带串行化锁。见技术笔记「多写入端」

### Out of Scope

- 闭包表的建立与增量维护（→ US-510 阶段 B；本故事只在闭包存在时用它加速）
- 联产品/副产品语义本身（→ US-513；本故事只负责把非 consume 边排除在检测外；`consume` 子图无环不等于允许任意回流工艺，回流范围由 US-513 界定）
- 「只约束可同时成立的解析视图」的精确政策——需要它的驱动样本出现前不做，见技术笔记
- BOM 实体的离线同步与合并（解锁需另立故事，届时须让 pull / merge / replay 经过同一发布边界）
- 元数据层的声明式约束 DSL（→ [US-030](../core/US-030-declarative-storage-constraints.md)）。可达性要读整张边表，
  装不进声明式约束，其触发器（含 AC#2 的自反边）由本故事自己发 DDL

## 验收标准

| #   | 前置条件                                 | 操作                                            | 预期结果                                                                                     | 状态 |
| --- | ---------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------- | ---- |
| 1   | A→B→C 已存在                             | 插入 C→A                                        | 存储层拒绝，错误里给出环路径                                                                 | ⬜   |
| 2   | 任意 BOM                                 | 插入 `child = parent`                           | 可达性触发器拒绝，与 AC#1 同一环错误码，环路径为单个物料                                     | ⬜   |
| 3   | 无闭包表的 org                           | 插入成环边                                      | 递归 CTE 检出，`depth` 触上限时报错不静默通过                                                | ⬜   |
| 4   | `flow_direction <> 'consume'` 的边       | 构成反向物料流                                  | **不**参与环检测，保存成功                                                                   | ⬜   |
| 5   | DDL 由本仓掌控的适配器                   | 绕过 adapter 直连库写入成环边                   | 触发器拒绝                                                                                   | ⬜   |
| 6   | `http` / `supabase`                      | `init()`                                        | 显式声明本适配器无写入期环约束并 fail-fast，不静默降级为仓储层校验                           | ⬜   |
| 7   | 同上                                     | 取环约束 DDL                                    | 返回可供远端自行部署的 DDL 片段，部署与否由使用方负责                                        | ⬜   |
| 8   | 可达性表已建（依赖 US-510 阶段 B）       | 插入成环边                                      | 检测走 O(1) 可达性命中，不退化为递归遍历；与递归 CTE 判定一致                                | ⬜   |
| 9   | A→B 仅在 `[2026-01-01, 2026-10-01)` 生效 | 经插件 API 插入 B→A，仅 `[2026-10-01, +∞)` 生效 | 按保守政策拒绝，与 AC#1 同一环错误码与路径；插件附加 `union_only` 标记，同时段真环不带此标记 | ⬜   |
| 10  | A→B 在 EBOM                              | 在同 org 的 MBOM 插入 B→A                       | 接受：作用域是 `(bom_type, org_id)`                                                          | ⬜   |
| 11  | B 的行发生项 imprecise 引用 C            | C 发布新修订                                    | 无需重检：物料级并集图未变，不可能激活未校验的环                                             | ⬜   |
| 12  | 任一 BOM 实体                            | 为其声明同步配置                                | 配置校验即拒绝，错误点名「BOM 实体首轮不参与同步」                                           | ⬜   |
| 13  | 导出的 PG DDL 部署到真实 PostgreSQL      | 两个连接并发分别写 A→B、B→A                     | 至多一条提交，另一条被拒或在锁后重检失败                                                     | ⬜   |

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

可达性表命中是环检测最便宜的形式，也是 US-510 阶段 B 除查询加速之外的第二个理由。它是物料级、不带生效期的
`bom_reach`，不是展示用的 `line_path` 闭包——判环只需要「能不能到」，不需要「有几条路」：

```sql
SELECT 1 FROM bom_reach
 WHERE bom_type = $t AND org_id = $o
   AND ancestor_item_id = $child AND descendant_item_id = $parent;
```

**为什么约束并集。** 「全部存储边无环」与「某个可运行解析视图无环」不是同一个不变量。反例：A→B 只在
`[01-01, 10-01)` 生效、B→A 只在 `[10-01, +∞)` 生效，任一时点都无环，并集有环。约束解析视图更精确，
但代价是检查要带完整的 `ResolutionContext`（[US-508](US-508-bom-view-resolution.md)），且 imprecise 子件发布新修订、
ECN 改期、备选切换都会在**没有任何行写入**的情况下改变解析图，每一处都要变成约束入口。

本故事取保守政策：并集无环。它误拒的是「同一组物料在不同时段/修订/备选里互为父子」——真实 BOM 里几乎不存在，
被拒时插件把它与真环区分（AC#9），产品可以据此判断是否需要放宽。换来的是：

- 检查入口只有行发生项写入一处，发布、改期、imprecise 切换都不改变物料级并集图（AC#11）；
- 可达性表不必按生效期过滤，命中即成环，AC#8 与递归 CTE 的判定天然一致；
- 卷算的拓扑排序在任何解析上下文里都不会遇到环。

**「环错误码」指 `BomCycleError`**（携带 `path`；触发器消息前缀 `rxdb:bom_cycle:`），命名与两后端归一见
[US-030 违约错误的判别](../core/US-030-declarative-storage-constraints.md#技术笔记)。AC#1 / #2 / #9 与 US-515 AC#10 断言的都是这个类。

**AC#9 的区分是插件对错误的补充，不是第二道校验。** 触发器只回答「并集里能不能到」，报同一个环错误码与路径；
插件在 API 层接住这个错误后，读出路径上各条边的发生项，若**路径上**不存在所有边同时生效的时点，就附 `union_only`。
它只解释被报告的那条路径——并集里可能还有别的环，判它们是否「真环」要枚举路径，不在本故事。
直连 SQL 被拒时只拿到错误码与路径，没有这个标记，这是有意的：标记不改变拒绝与否，只服务于产品判断。

**错误里的路径是动态文本**，SQLite 触发器要用 `RAISE(ABORT, <表达式>)` 拼出来，3.47.0 起才支持；
宿主版本门槛与 Tauri 的升级前置见 [US-030](../core/US-030-declarative-storage-constraints.md) AC#7。

作用域按 `(bom_type, org_id)` 切：一次解析只在一种类型、一个组织内递归（US-508），跨类型的「环」走不到。

**多写入端：本地串行，远端靠 DDL 自带锁，同步首轮不开。**

- 本地适配器（SQLite 家族、PGlite）是单写者，触发器内的可达性检查与写入在同一事务内串行，不存在两个快照互相看不见的问题。
- 远端 PostgreSQL 的多个事务各自在快照内检查、各自写入反向边，都看不到对方未提交的写入——「有触发器」不等于并发安全。
  所以 AC#7 导出的 DDL 在触发器开头取 `(bom_type, org_id)` 级的 `pg_advisory_xact_lock`，同一作用域的写入串行化；
  AC#13 在真实 PostgreSQL 上验证，不能拿 PGlite 的单连接执行模型代替。导出 DDL **不改变**本插件在 `http` / `supabase`
  上的支持态：`init()` 仍 fail-fast（AC#6），DDL 只保护使用方自己的远端写入端。
- 两个离线客户端分别新增 A→B 与 B→A，本地都合法、合并后成环，而且是两条不同记录，普通行冲突检测抓不到。
  首轮不解决它，而是不让它发生：BOM 实体声明同步配置即拒绝（AC#12）。

**关闭条件**：在 DDL 归本仓掌控的适配器上，绕过 adapter 直接写库仍被拒（AC#5）；
在其余适配器上，能力缺席被显式声明（AC#6）。多写入端是本故事存在的全部理由——
只在仓储层校验等于没校验，而声称在每个后端都校验到了，比没校验更坏。

**首轮切片只验收 AC#1～#3 / #5～#7 / #9～#12**：AC#4 等 US-513 引入 `flow_direction`，
AC#8 等 US-510 阶段 B 的可达性表，AC#13 等真实 PostgreSQL 环境；整条故事在这些前置落地前不置 Done，见
[epic-009 首轮可开工切片](../../epics/epic-009-bom-domain-model.md#首轮可开工切片)。

## 价值待证

同 [epic-009](../../epics/epic-009-bom-domain-model.md#价值待证整个-epic)。图插件允许成环是既定语义（见技术笔记），
本故事的价值完全取决于 BOM 驱动场景，不能脱离 Epic 单独解锁。

## 实现文件

- `packages/rxdb-plugin-bom/` — 待建；可达性校验
- `packages/rxdb-plugin-graph/` — 可选：给图插件加 opt-in 的写入期无环约束，默认行为不变

## References

- [epic-009 BOM 领域模型](../../epics/epic-009-bom-domain-model.md)
- [US-503 图数据插件](US-503-graph-data.md) — 现有图能力与其边界
- [US-507 BOM 图骨架](US-507-bom-graph-skeleton.md) — 前置；行发生项的来源
- [US-508 BOM 视图解析](US-508-bom-view-resolution.md) — 解析上下文；本故事刻意不按它约束
- [US-513 联产品与副产品](US-513-bom-coproduct-byproduct.md) — AC#4 的前置；`flow_direction` 的来源
- [US-510 多级展开与 where-used 反查](US-510-bom-multilevel-explosion.md) — AC#8 依赖其阶段 B
- [US-030 实体元数据层的声明式存储约束](../core/US-030-declarative-storage-constraints.md) — AC#7 的 SQLite 宿主版本门槛
- [US-515 变更管理](US-515-bom-change-management.md) — ECN 取消对并集的影响
