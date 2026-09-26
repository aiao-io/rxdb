---
id: epic-009-bom-domain-model
status: Backlog
startDate: TBD
targetDate: TBD
owner: jimmy
---

# BOM 领域模型

## 愿景

让**一套数据结构**表达 EBOM / MBOM / 销售 BOM，覆盖单级与多级、树与 DAG、虚拟件与替代料，
并能对接 ERP/MRP。成本不是第四种 BOM，是在这套结构上的一遍卷算，见
[US-514](../stories/plugin/US-514-bom-cost-rollup.md)。

骨架是「带属性的有向无环图」：节点是物料/对象，边是组成关系，用量、损耗、工序、生效期挂在边上。
但骨架本身只覆盖约 65% —— 真实 BOM 的边**有独立身份**（同一子件在同一父件下按行项号多次出现），
节点**有修订**（EBOM 要能说「用 D 版齿轮」），替代关系的策略**在组上而非行上**，
而 EBOM → MBOM **不是视图过滤而是结构重构**。本 Epic 的目标状态是：这四件事在模型里是一等公民，
不靠约定、不靠应用层补丁。

## 为什么单列一个 Epic

epic-001~006 按**产品能力**分组（核心引擎、同步、UI、未来能力、类型系统、工作树），
[epic-007](epic-007-public-api-gates.md) 按**发布约束**分组，
[epic-008](epic-008-lifecycle-scope.md) 是**横切实现约束**。BOM 领域模型三者都不是：

- 它不是引擎能力——`@aiao/rxdb` 不会因为它多出一个查询原语，挂进 epic-001 会让「核心 MVP」的愿景失真；
- 它是**应用领域模型**：一层建立在现有实体/仓储/活查询之上的行业语义。

**但分界线不落在「只差多重边」这一句上。** 本 Epic 的 AC 有四类要求落在引擎声明面之外：
属性级与实体级 CHECK、条件唯一与区间排他索引、生成列与索引方法、以及写入期的跨行判定。
[`EntityMetadataOptions`](../../packages/rxdb/src/entity/entity-options.interface.ts) 里没有 CHECK 的落点，
[`EntityIndexMetadataOptions`](../../packages/rxdb/src/entity/property-types.interface.ts) 的自有字段只有
`properties` 与 `normalized`（`unique` 来自它继承的 `IEntityObject`）——没有 `where`、没有表达式列、没有索引方法。

前三类与 BOM 无关，已单列为 [US-030 实体元数据层的声明式存储约束](../stories/core/US-030-declarative-storage-constraints.md)
（挂 [epic-004](epic-004-future-features.md)，因为 epic-001 与 epic-005 均已 `Done`）；
第四类是图可达性，要读整张边表，装不进声明式约束，按 FTS 触发器的先例留在
[US-509](../stories/plugin/US-509-bom-dag-cycle-detection.md)。
扣掉这四类之后，本 Epic 对引擎的剩余要求才是那一条：边要能带 20+ 属性且同一对节点间允许多条边。

## 目标

三条都是可核对的状态：

- [ ] 一套表结构承载 EBOM / MBOM / 销售 BOM，三者共享同一份物料主数据——同一类型内的组织、修订与
      生效期差异走视图过滤（[US-508](../stories/plugin/US-508-bom-view-resolution.md)），
      EBOM↔MBOM 走 `bom_map` 重构关联（[US-516](../stories/plugin/US-516-ebom-mbom-mapping.md)
      的关闭条件正是「明确不用视图实现」）；
- [ ] 多级展开的**数量**与手算一致——三类损耗（装配 / 组件 / 工序）位置正确、虚拟件穿透、定量与公式用量；
- [ ] 成环在存储层被拒，卷算的拓扑排序永不死锁，且联产品/副产品的反向物料流**不被误判成环**。

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [US-507 BOM 图骨架：物料、修订与多重边 BOM 行](../stories/plugin/US-507-bom-graph-skeleton.md) (Low)
- [US-508 BOM 视图解析：类型/组织/修订/生效期过滤](../stories/plugin/US-508-bom-view-resolution.md) (Low)
- [US-509 DAG 约束与环路检测下沉存储层](../stories/plugin/US-509-bom-dag-cycle-detection.md) (Low)
- [US-510 多级展开与 where-used 反查](../stories/plugin/US-510-bom-multilevel-explosion.md) (Low)
- [US-511 展开数量正确性：用量语义、三类损耗、虚拟件穿透](../stories/plugin/US-511-bom-quantity-semantics.md) (Low)
- [US-512 替代组与替代策略](../stories/plugin/US-512-bom-substitute-group.md) (Low)
- [US-513 联产品与副产品：多输出物料流](../stories/plugin/US-513-bom-coproduct-byproduct.md) (Low)
- [US-514 成本卷算](../stories/plugin/US-514-bom-cost-rollup.md) (Low)
- [US-515 变更管理（ECN）驱动的生效期](../stories/plugin/US-515-bom-change-management.md) (Low)
- [US-516 EBOM ↔ MBOM 映射与差异对比](../stories/plugin/US-516-ebom-mbom-mapping.md) (Low)
- [US-517 可配置销售 BOM：特征、选项与选择条件](../stories/plugin/US-517-configurable-sales-bom.md) (Low)
- [US-518 序列与批次有效性](../stories/plugin/US-518-bom-unit-lot-effectivity.md) (Low)
- [US-519 扩展属性：jsonb 值 + attr_def 元数据 + 热字段提升](../stories/plugin/US-519-bom-extension-attributes.md) (Low)
- [US-520 工艺路线挂接与工序投料分摊](../stories/plugin/US-520-bom-routing-operation.md) (Low)
- [US-521 ERP/MRP 集成契约](../stories/plugin/US-521-bom-erp-mrp-integration.md) (Low)
- [US-522 三框架 BOM 编辑与展开视图](../stories/plugin/US-522-bom-tri-framework-ui.md) (Low)
- [US-523 as-built / as-maintained 实例 BOM](../stories/plugin/US-523-bom-as-built-instance.md) (Low)
- [US-524 工艺路线本体：工序、工作中心、工时与费率](../stories/plugin/US-524-routing-master-model.md) (Low)
- [US-525 BOM 端到端 demo：一份数据集走完全域](../stories/plugin/US-525-bom-end-to-end-demo.md) (Low)

## 价值待证（整个 Epic）

**本 Epic 的 19 条故事全部标价值待证，`priority` 一律 `Low`，不进任何排期批次。**

判据是 [CONVENTIONS 的病灶数 ≥ 抽象数](../CONVENTIONS.md#价值待证)：这 19 条新增约 15 个抽象
（`item_revision` / `bom_substitute_group` / `ecn` / `bom_map` / `flow_direction` / `config_condition` /
`attr_def` / `bom_closure` / `routing` / `work_center` / `activity_rate` 等），
而本仓当前**零个已知 BOM 缺陷**，也写不出「今天用户踩得到的具体症状」。
抽象数没随故事数涨到 19，是因为 [US-525](../stories/plugin/US-525-bom-end-to-end-demo.md) 不引入新抽象——
它是验收手段，全部行为都归属到其余 18 条。

**解锁条件**：出现一个真实的驱动场景——客户 BOM 数据集，或一个要上线的 BOM 应用。
在那之前 epic 的 `startDate` / `targetDate` 保持 `TBD`：填日期就是本条款禁止的「凭 Epic 惯性排期」。

本 Epic 没有一条带脱离 BOM 场景的独立病灶。[US-509](../stories/plugin/US-509-bom-dag-cycle-detection.md)
的「写入期拒绝成环」不是在补 `@aiao/rxdb-plugin-graph` 的缺口：图插件允许成环与自环是**既定语义**，
`directed-weighted.spec.ts`「查找循环交易」与 `graph-semantics.spec.ts`「自环边」等用例把它钉住，
读侧由路径查询的 `cycle` 判定与 `GRAPH_MAX_PATH_EXPANSIONS` 保证终止。无环是 BOM 的领域约束。

从本 Epic 拆出去的 [US-030](../stories/core/US-030-declarative-storage-constraints.md) 同样待证，
但**解锁条件低一档**：任意一条需要「不变量在存储层成立」的故事即可解锁它，不必等 BOM 驱动场景。

## 首轮可开工切片

驱动场景一旦出现，最小可演示闭环是 **US-507 + US-508 + US-509 + US-510 阶段 A**：
建 BOM → 按视图解析 → 多级展开 → where-used 反查 → 拒绝成环。四条都不预设行业。
US-511 必须紧随——数量对不上，前面四条没有业务意义。
按各故事现在的写法，这个切片关不掉 US-509，US-511 也只有一部分能紧随，见[解锁前须先处理](#解锁前须先处理)。

这个闭环的**验收手段**是 [US-525](../stories/plugin/US-525-bom-end-to-end-demo.md) 阶段 A：
五条故事各自的 AC 都是单点断言，而组合错误（乘序、二次过滤、穿透后继承）只在一份贯穿的数据集上显形。
它不是解锁依据——demo 需要插件存在，拿它当启动理由是循环论证，见该故事的「价值待证」。

## 解锁前须先处理

驱动场景出现后、开第一个 PR 之前，先改掉下面几处 Epic 内部的矛盾。它们今天不挡任何事，
但照现在的写法排期，首轮切片关不掉自己承诺的故事，后续故事也会在没声明的前置上卡住。

1. **首轮切片关不掉 US-509**：AC#2 的 CHECK 落点是 [US-030](../stories/core/US-030-declarative-storage-constraints.md)
   阶段 A，AC#4 的 `flow_direction` 由 [US-513](../stories/plugin/US-513-bom-coproduct-byproduct.md) 引入，
   AC#8 依赖 [US-510](../stories/plugin/US-510-bom-multilevel-explosion.md) 阶段 B。切片能演示「拒绝成环」，
   US-509 却要等这三处都落地才能关闭。二选一：把这三处拉进切片，或让切片只交付 US-509 不依赖它们的
   AC#1 / #3 / #5~#7，其余等前置落地后再关。
2. **US-511 能紧随的只有阶段 A 与 C**：阶段 B 的 AC#1 含工序损耗（七步公式第 5 步），要
   [US-520](../stories/plugin/US-520-bom-routing-operation.md) 的 `operation_seq` 与
   [US-524](../stories/plugin/US-524-routing-master-model.md) 阶段 D 的 `operation_scrap`；
   In Scope 的「只有 `consume` 行进入需求展开」同样依赖 US-513 的 `flow_direction`。
3. **三条「保存即拒绝」的跨行约束没有落点**：[US-507](../stories/plugin/US-507-bom-graph-skeleton.md)
   AC#5（位号子表行数与 `qty` 一致）、[US-512](../stories/plugin/US-512-bom-substitute-group.md) AC#5
   （组内 `usage_probability` 合计为 1）、US-520 AC#4（分摊比例合计为 1）都是跨行或跨表聚合。
   US-507 与 US-512 把落点指向 US-030 的 CHECK，但 CHECK 只看单行，US-030 又把跨表断言与延迟约束列为
   Out of Scope；US-509 的插件触发器只管可达性。三条要么按 US-509 的先例各自发触发器
   （逐行写入时合计必然暂时不满足，只能在事务提交时判定，而 SQLite 在 SQL 层没有提交期触发器），要么明确降为仓储层校验。
   另有 US-524 AC#3（费率区间重叠在存储层被拒）落点是 US-030 阶段 C，但不在 US-030 的消费方清单里。
4. **未声明的前置**：下列故事用到了别的故事引入的表、列或查询，References 里没有标「前置」——
   US-510 → US-507；US-511 → US-513、US-520、US-524；US-513 → US-507；US-514 → US-512、US-513；
   US-515 → US-510；US-516 → US-507；US-520 → US-507；US-523 → US-507。
5. **US-525 AC#10 没有归属 AC**：「展开不读系统时钟、评估日是显式入参」在其余 18 条里没有任何一条 AC 写过
   （US-525 技术笔记自述），与它「全部行为都归属到已有的 18 条故事」相抵。应补成
   [US-508](../stories/plugin/US-508-bom-view-resolution.md) 的一条 AC。

## 非目标

- **工艺路线本体**（工作中心、作业类型、费率）不在首轮切片，但它**在本 Epic 内**——
  独立故事 [US-524](../stories/plugin/US-524-routing-master-model.md)，是
  [US-514](../stories/plugin/US-514-bom-cost-rollup.md) 的前置；
  [US-520](../stories/plugin/US-520-bom-routing-operation.md) 只做 BOM 行到工序的**挂接与分摊**；
- **配置约束求解器**——[US-517](../stories/plugin/US-517-configurable-sales-bom.md) 只定数据模型与契约，求解可外挂；
- **库存 / 批次 / 在制**——属事务域，不进本 Epic；
- **MRP 运算本身**——本 Epic 只负责把正确的结构与数量交给 MRP，见
  [US-521](../stories/plugin/US-521-bom-erp-mrp-integration.md)。
