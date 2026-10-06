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
但骨架本身远不够——真实 BOM 的边**有独立身份**（同一子件在同一父件下按行项号多次出现），
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
- [ ] 成环在存储层被拒——按 `(bom_type, org_id)` 对全部已存 `consume` 边的**并集**判环，不随生效期或修订变化，
      卷算的拓扑排序永不死锁，且联产品/副产品的反向物料流**不被误判成环**
      （[US-509](../stories/plugin/US-509-bom-dag-cycle-detection.md)）。

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
`attr_def` / `bom_reach` / `routing` / `work_center` / `activity_rate` 等），
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

驱动场景一旦出现，按下表顺序推进。每一步只关闭表中列出的 AC 子集，**不因部分阶段验收而把整条故事置 Done**；
顺序本身也不是解锁授权——第 0 步不成立，后面都不开工。

| 顺序 | 交付                                                              | 可以验收 / 关闭什么                                                        | 明确不承诺                                                           |
| ---- | ----------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 0    | 真实 BOM 样本 + 手工数量 golden + 确认[默认决策](#解锁前须先处理) | 驱动者、实际症状、所需模型与输入规模明确                                   | demo 不当业务需求证据；不估完整 19 条故事的交期                      |
| 1    | US-030 所需阶段（A / B / C）+ US-507 阶段 A / B                   | CHECK 与区间排他；物料、修订、头（`draft` / `released`）、逻辑行与行发生项 | 不拉入完整联产能力；不改变 graph 插件的默认语义                      |
| 2    | US-508 + US-509 不依赖可达性表的 AC + US-510 阶段 A               | 单一上下文可解析、`as_of_date` 显式；下钻 / 反查与预算截断；直连真环拒绝   | US-509 AC#2 / #4 / #8 / #13 等各自前置，整条 US-509 不提前 Done      |
| 3    | US-511 阶段 A / C + B1                                            | 四态用量、量纲与单位换算、phantom 穿透、装配与组件损耗                     | 没有路线不接受工序损耗；B2 等 US-520 与 US-524 阶段 D                |
| 4    | US-507 阶段 C + US-525 阶段 A                                     | 位号计数的编辑 / 发布协议；贯穿种子与手写 golden；无路线版算式面板         | 不演示第 5 步工序损耗，面板标「未交付」而非按 0 计                   |
| 5    | 真实需求驱动的后续阶段                                            | 替代、联产、路线、成本、ECN 各按自身 References 的前置接入                 | US-510 阶段 B 只由实测热路径触发；实例、配置器、三框架全量不捆绑首轮 |

第 1～4 步合起来就是最小可演示闭环：建 BOM → 按视图解析 → 多级展开 → where-used 反查 → 拒绝成环 → 数量与手算一致。
这个闭环的**验收手段**是 [US-525](../stories/plugin/US-525-bom-end-to-end-demo.md) 阶段 A：
各故事的 AC 都是单点断言，而组合错误（乘序、二次过滤、穿透后继承）只在一份贯穿的数据集上显形。
它不是解锁依据——demo 需要插件存在，拿它当启动理由是循环论证，见该故事的「价值待证」。

## 解锁前须先处理

早先列在这里的五处 Epic 内部矛盾已写回各故事，不再挡排期：

| 原矛盾                      | 现在的落点                                                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 首轮切片关不掉 US-509       | US-509 技术笔记写明首轮只验收的 AC 子集，其余 AC 各自点名前置；切片表第 2 步同此                                                                                       |
| US-511 只有一部分能紧随     | US-511 阶段 B 拆为 B1（装配 / 组件损耗）与 B2（工序损耗，前置 US-520 与 US-524 阶段 D）                                                                                |
| 跨行聚合约束没有落点        | 位号计数、替代组概率合计、工序分摊合计、ECN 整批校验统一落在 `bom_header` 的 `draft → released` 发布转移上（US-507 / US-512 / US-515 / US-520）；US-030 不承接跨行聚合 |
| 未声明的前置                | 各故事 References 已逐条标「前置」，并按阶段 / AC 写明依赖                                                                                                             |
| US-525 的评估日 AC 没有归属 | 已成为 [US-508](../stories/plugin/US-508-bom-view-resolution.md) AC#7 / #8（`as_of_date` 必填、不读系统时钟）                                                          |

以下产品决策已按**最小方案**写进各故事。它们是默认值，不是驱动样本验证过的结论——第 0 步须由 owner 拿真实样本逐条复核，
推翻任一条都要先改对应故事再开工：

1. **逻辑行历史留在同一张头内**：`bom_line`（稳定业务身份）与 `bom_line_occurrence`（按生效期的时间记录）分层，
   改一行不强制新父修订（[US-507](../stories/plugin/US-507-bom-graph-skeleton.md)）。
2. **并集无环**：按 `(bom_type, org_id)` 禁止全部已存 `consume` 边的并集成环，接受对跨时段 / 互斥配置的保守误拒
   （[US-509](../stories/plugin/US-509-bom-dag-cycle-detection.md)、[US-517](../stories/plugin/US-517-configurable-sales-bom.md)）。
3. **聚合在发布时校验**：草稿可暂不合法，发布转移原子整组校验，发布后内容不可直连改写。
4. **按当前知识查询过去**，不承诺精确重放当年计算；任何发布不得追溯生效，已生效的 ECN 不可取消或提前
   （[US-508](../stories/plugin/US-508-bom-view-resolution.md)、[US-515](../stories/plugin/US-515-bom-change-management.md)）。
5. **定量与固定工时按批计**：数量按路径 / 批次求，标准成本按头上的 `cost_lot_qty` 折单件，一次卷算单一币种
   （[US-511](../stories/plugin/US-511-bom-quantity-semantics.md)、[US-514](../stories/plugin/US-514-bom-cost-rollup.md)）。
6. **首轮不支持 BOM 同步**：同步配置即拒绝；导入整批原子进草稿；导出的 PG DDL 自带并发锁
   （[US-509](../stories/plugin/US-509-bom-dag-cycle-detection.md)、[US-521](../stories/plugin/US-521-bom-erp-mrp-integration.md)）。
7. **`unresolved` / `truncated` 只给浏览**：UI 可展示候选集与截断结果，数量、成本与 MRP 导出遇到即拒绝。
8. **真实样本仍是解锁条件**：由谁提供样本、手工结果与验收场景，本期支持哪些行业语义，是第 0 步要回答的问题。

### 数据结构与不变量

不指定表名实现，只列各故事已经共同遵守的合同，改动其中任一条都跨多条故事：

| 对象 / 上下文        | 不变量                                                               | 归属                              |
| -------------------- | -------------------------------------------------------------------- | --------------------------------- |
| 逻辑行 / 行发生项    | 稳定业务身份与时间记录身份分开；所有引用写明指哪一层                 | US-507 / US-508                   |
| 已解析节点           | 可计算节点是「已解析的头 + 上下文」，不用裸 `item_id` 标识           | US-508 / US-510 / US-514          |
| `ResolutionContext`  | 显式日期、组织、类型、修订与备选选择；配置、序列、批次扩入同一上下文 | US-508；US-517 / US-518 扩展      |
| 数量值               | 值、单位、精度明确；进入子头前量纲一致                               | US-511                            |
| 成本值               | 整批 / 单件与基准批量、币种、费率日明确；本层局部系数 ≠ 根级累计需求 | US-514 / US-524                   |
| `draft` / `released` | 可编辑的非法中间态与可运行的合法态分离，发布原子校验                 | US-507 / US-512 / US-515 / US-520 |
| manifest / 装机事实  | 记录实际解析依据；可变来源不能反向改写历史                           | US-508 / US-515 / US-523          |
| 结果完整性           | 浏览可截断、可未解析；成本、MRP 与导出遇到即拒绝                     | US-510 / US-514 / US-521 / US-522 |

引用完整性落在领域关系上，而不只是 ID 存在：`child_revision_id` 属于 `child_item_id`，替代组成员属于同一头，
投料工序属于该头选定的路线。能复用已有组合外键能力就复用，不自造跨表规则 DSL。

## 非目标

- **工艺路线本体**（工作中心、作业类型、费率）不在首轮切片，但它**在本 Epic 内**——
  独立故事 [US-524](../stories/plugin/US-524-routing-master-model.md)，是
  [US-514](../stories/plugin/US-514-bom-cost-rollup.md) 的前置；
  [US-520](../stories/plugin/US-520-bom-routing-operation.md) 只做 BOM 行到工序的**挂接与分摊**；
- **配置约束求解器**——[US-517](../stories/plugin/US-517-configurable-sales-bom.md) 只定数据模型与契约，求解可外挂；
- **库存 / 批次 / 在制**——属事务域，不进本 Epic；
- **MRP 运算本身**——本 Epic 只负责把正确的结构与数量交给 MRP，见
  [US-521](../stories/plugin/US-521-bom-erp-mrp-integration.md)。
