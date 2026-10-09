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
      卷算的拓扑排序永不死锁，且副产品与废料的反向物料流（非 `consume` 边）**不被误判成环**
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

从本 Epic 拆出去的 [US-030](../stories/core/US-030-declarative-storage-constraints.md) 解锁条件低一档，
已于 2026-10-02 由 owner 决定提前解锁阶段 A～C（阶段 D 仍待证），见该故事「解锁记录」。它可以先于第 0 步开工；本 Epic 其余各条不随之解锁。

## 首轮可开工切片

驱动场景一旦出现，按下表顺序推进。每一步只关闭表中列出的 AC 子集，**不因部分阶段验收而把整条故事置 Done**；
顺序本身也不是解锁授权——第 0 步不成立，后面都不开工。

| 顺序 | 交付                                                                                                                                           | 可以验收 / 关闭什么                                                                                                                                                                                                                                                          | 明确不承诺                                                                                                                |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 0    | 真实 BOM 样本 + 手工数量 golden（[默认决策](#解锁前须先处理) 1～8 已于 2026-10-02 确认；[形态样本与 golden 已就位，驱动者仍缺](#第-0-步样本)） | 驱动者、实际症状、所需模型与输入规模明确                                                                                                                                                                                                                                     | demo 不当业务需求证据；不估完整 19 条故事的交期                                                                           |
| 1    | US-030 所需阶段（A / B / C）+ US-507 阶段 A / B                                                                                                | SQLite ≥ 3.47 门槛（US-030 AC#7，前置 Tauri 升 rusqlite）；CHECK 与区间排他；物料、修订、头（`draft` / `released`）、逻辑行与行发生项；结构归属列与已发布修订不可改（US-507 AC#13 / #14）；`qty` 以规范十进制串存取（US-511 AC#22 ① 的存储与回读段、AC#23；展开段归第 3 步） | 不拉入副产与联产能力；不改变 graph 插件的默认语义；已发布头不开 ECN 写入口                                                |
| 2    | US-508 + US-509 不依赖可达性表的 AC + US-510 阶段 A                                                                                            | 单一上下文可解析、`as_of_date` 显式；一致快照（US-508 AC#15 的发布与补装两种写入）；历史装载通道；下钻 / 反查与预算截断；直连真环与自环拒绝；归属列改写与草稿头反向边被拒（US-509 AC#14 / #17）                                                                              | US-508 AC#12 / #16 等 US-515；US-509 AC#4 / #8 / #13 / #15 / #16 等各自前置；US-510 只关闭阶段 A 的 AC；三条都不提前 Done |
| 3    | US-511 阶段 A / C + B1                                                                                                                         | 四态用量、量纲与单位换算、十进制值合同与阶梯切片（AC#22～#26）、phantom 穿透、装配与组件损耗                                                                                                                                                                                 | 没有路线不接受工序损耗；B2 等 US-520 与 US-524 阶段 D                                                                     |
| 4    | US-507 阶段 C + US-525 阶段 A                                                                                                                  | 位号计数的编辑 / 发布协议；分层种子的 A 层与分阶段 golden；无路线版算式面板                                                                                                                                                                                                  | 不演示第 5 步工序损耗，面板标「未交付」而非按 0 计                                                                        |
| 5    | 真实需求驱动的后续阶段                                                                                                                         | 替代、副产与废料、路线、成本、ECN 各按自身 References 的前置接入；联产品属 US-513 阶段 B，另需驱动                                                                                                                                                                           | US-510 阶段 B 只由实测热路径触发；实例、配置器、三框架全量不捆绑首轮                                                      |

第 1～4 步合起来就是最小可演示闭环：建 BOM → 按视图解析 → 多级展开 → where-used 反查 → 拒绝成环 → 数量与手算一致。
这个闭环的**验收手段**是 [US-525](../stories/plugin/US-525-bom-end-to-end-demo.md) 阶段 A：
各故事的 AC 都是单点断言，而组合错误（乘序、二次过滤、穿透后继承）只在一份贯穿的数据集上显形。
它不是解锁依据——demo 需要插件存在，拿它当启动理由是循环论证，见该故事的「价值待证」。

## 第 0 步样本

第 0 步要两样东西，截至 2026-10-02 只有前一样：

- **形态样本（已就位，owner 2026-10-02 接受）**：微软 AdventureWorks 示例库的 `Production.BillOfMaterials`，
  一家**虚构**自行车厂的多级 BOM，MIT 许可。固定到
  [microsoft/sql-server-samples@beaab06e](https://github.com/microsoft/sql-server-samples/tree/beaab06ef72831089ca80e5355d65e661fd19b26/samples/databases/adventure-works/oltp-install-script)
  的 `BillOfMaterials.csv` / `Product.csv` / `UnitMeasure.csv`（制表符分隔、无表头；SHA-256 前 12 位依次为
  `a27765426bd4` / `df0379a7cba8` / `6e4d07534b69`）。数据不进仓库；落成测试夹具时随实现 PR 定位置，并保留 MIT 声明。
- **驱动者与实际症状（仍缺）**：示例库没有用户、没有症状。它回答「模型装不装得下、输入多大」，不回答「谁要、为什么」——
  上面的价值待证与解锁条件**不因它改变**。

| 形态       | 实测                                                                                                                                                                                                       | 对模型与默认决策的复核                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 规模       | 2679 行；97 个成品（顶层记录 103 行，6 个成品的顶层有多段生效期）；按 `as_of_date` 展开的路径行数（含中间件）：2021-09-01 时 16～79 行，2022-01-01 起各成品均为 89 行（同一车型的尺寸 / 颜色变体共用拓扑） | 首轮输入规模的量级；不构成 US-510 阶段 B 的热路径证据                                                                          |
| 多层       | `BOMLevel` 0～4                                                                                                                                                                                            | 覆盖 US-510 阶段 A                                                                                                             |
| 共享子件   | 145 个子件有多个父件，最多 97 个                                                                                                                                                                           | 覆盖 where-used 反查                                                                                                           |
| 行版本     | 189 组「父件 → 子件」按日期换过用量，同组区间无重叠，后段起始 = 前段结束 + 1 天                                                                                                                            | 与决策 1 一致：`(父件, 子件)` 即逻辑行，每段即发生项。样本的结束日含当天，导入换成半开区间 `[StartDate, EndDate + 1 天)`，无损 |
| 顶层生效期 | 6 个成品（750 / 753 / 768 / 797 / 972 / 999）的顶层记录分两段，前段终止 + 1 天 = 后段起始，两段除日期外完全相同；子件行挂在产品上，不挂在顶层记录上                                                        | 不是结构版本：导入折成一个 `item_revision`，`effective_from` 取最早起始日；分段不进模型，展开结果不受影响                      |
| 环         | 全部日期的边取并集仍无环                                                                                                                                                                                   | 与决策 2 不冲突，但也测不到保守误拒                                                                                            |
| 历史日期   | 生效期集中在 2021 年                                                                                                                                                                                       | 只能经 [US-508](../stories/plugin/US-508-bom-view-resolution.md) 历史装载通道导入（决策 4），首轮正好覆盖 AC#13 / #14          |
| 单位       | EA 2578 行、OZ 92 行、IN 9 行；非 EA 的全落在外购叶子件                                                                                                                                                    | 不需要跨量纲换算，[US-511](../stories/plugin/US-511-bom-quantity-semantics.md) 的换算无覆盖                                    |
| 用量       | 列是小数类型，但取值全是整数                                                                                                                                                                               | 决策 8 的精度与取整**无覆盖**                                                                                                  |

样本覆盖不到：ECN 单据（只有按日期切换的行，决策 3 与 US-515 无样本）、替代料、虚拟件、损耗率、工艺路线主数据、
组织维度、EBOM / MBOM 之分；成本只有 29 / 87 个叶子件有 `StandardCost`，US-514 无法拿它对账。这些仍由各故事自己的手算 golden 承担。

**手算 golden**（叶子汇总；导入后按 `as_of_date` 展开并汇总比对）。ML Road Handlebars（ProductID 812）的结构：

```
Road End Caps  ×2 EA   [2021-12-14, ∞)            → Metal Sheet 2 ×1
ML Grip Tape   ×40 IN  [2021-12-14, ∞)
Handlebar Tube ×1 EA   [2021-08-04, ∞)            → Metal Sheet 6 ×1
Stem           ×2 EA   [2021-06-08, 2021-08-08)   → Metal Bar 1 ×1
Stem           ×1 EA   [2021-08-08, ∞)            → Metal Bar 1 ×1
```

| 父件                      | `as_of_date` | 叶子汇总                                                                | 测什么                                         |
| ------------------------- | ------------ | ----------------------------------------------------------------------- | ---------------------------------------------- |
| ML Road Handlebars（812） | 2021-07-01   | Metal Bar 1 ×2                                                          | 未生效行被排除（Handlebar Tube 2021-08-04 起） |
| 812                       | 2021-08-07   | Metal Bar 1 ×2、Metal Sheet 6 ×1                                        | 原闭区间的末日仍属旧段：Stem ×2                |
| 812                       | 2021-08-08   | Metal Bar 1 ×1、Metal Sheet 6 ×1                                        | 半开区间起点：Stem 改 ×1                       |
| 812                       | 2022-01-01   | Metal Sheet 2 ×2、ML Grip Tape ×40 IN、Metal Sheet 6 ×1、Metal Bar 1 ×1 | 混合单位不相加                                 |
| HL Fork（804）            | 2021-08-07   | Metal Sheet 5 ×4、Metal Sheet 2 ×2                                      | 两条路径同时取旧段：Blade 2×1 + Fork Crown 2×1 |
| 804                       | 2022-01-01   | Metal Sheet 5 ×3、Metal Sheet 2 ×2、Metal Sheet 6 ×1                    | 跨路径合并：Blade 2×1 + Fork Crown 1×1         |

未注单位的均为 EA。

## 解锁前须先处理

早先列在这里的 Epic 内部矛盾（首轮五处、RV-021 新增五处、2026-10-09 RV-080 新增十五处、同日 RV-081 再补七处、RV-082 再补一处）已写回各故事，不再挡排期：

| 原矛盾                                                  | 现在的落点                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 首轮切片关不掉 US-509                                   | US-509 技术笔记写明首轮只验收的 AC 子集，其余 AC 各自点名前置；切片表第 2 步同此                                                                                                                                                                                                                                                                                 |
| US-511 只有一部分能紧随                                 | US-511 阶段 B 拆为 B1（装配 / 组件损耗）与 B2（工序损耗，前置 US-520 与 US-524 阶段 D）                                                                                                                                                                                                                                                                          |
| 跨行聚合约束没有落点                                    | 位号计数、替代组概率合计、工序分摊合计、ECN 整批校验统一落在 `bom_header` 的 `draft → released` 发布转移上（US-507 / US-512 / US-515 / US-520）；US-030 不承接跨行聚合                                                                                                                                                                                           |
| 未声明的前置                                            | 各故事 References 已逐条标「前置」，并按阶段 / AC 写明依赖                                                                                                                                                                                                                                                                                                       |
| US-525 的评估日 AC 没有归属                             | 已成为 [US-508](../stories/plugin/US-508-bom-view-resolution.md) AC#7 / #8（`as_of_date` 必填、不读系统时钟）                                                                                                                                                                                                                                                    |
| ECN 要写已发布头，US-507 AC#10 又禁写                   | [US-515 已发布头的写入协议](../stories/plugin/US-515-bom-change-management.md#已发布头的写入协议)：只放行挂在 `draft` ECN 上的写入与状态转移级联；US-508 按 ECN 状态定可见性；首轮无 ECN，全部拒绝                                                                                                                                                               |
| 动态错误消息要 SQLite ≥ 3.47，Tauri 是 3.46.0           | [US-030](../stories/core/US-030-declarative-storage-constraints.md) AC#7 宿主版本门槛；Tauri 升 rusqlite 是第 1 步前置                                                                                                                                                                                                                                           |
| US-509 自反边依赖 US-030 的 CHECK                       | 自反边改由同一可达性触发器拒绝（US-509 AC#2，路径长度 0），不再依赖 US-030，进首轮验收                                                                                                                                                                                                                                                                           |
| US-511 阶梯行按「同头同子件」成组，与 US-507 多重图冲突 | 阶梯以 `(bom_header_id, tier_group_no)` 成组（[US-511](../stories/plugin/US-511-bom-quantity-semantics.md) AC#6 / #19）                                                                                                                                                                                                                                          |
| US-525 固定日期种子撞禁止追溯生效                       | [US-508](../stories/plugin/US-508-bom-view-resolution.md) 历史装载通道（AC#13 / #14，可审计而非不可绕过）；种子按阶段分层追加                                                                                                                                                                                                                                    |
| 34 位精度只管计算、不管输入存储导出                     | [US-511 十进制值合同](../stories/plugin/US-511-bom-quantity-semantics.md#技术笔记)：规范十进制串全程不经 `number`；存储层只有两处数值运算，各收窄字段域：阶梯边界限 15 位有效数字且整数 / 小数各至多 15 位（AC#26），概率与分摊比例限 `[0, 1]`、9 位小数并按定点整数求和（US-512 AC#15、US-520 AC#10）；US-507 / US-512 / US-514 / US-520 / US-521 / US-524 共用 |
| 改头的组织 / 类型、换行归属能绕过判环                   | 结构归属列创建后不可改（[US-507](../stories/plugin/US-507-bom-graph-skeleton.md) AC#13、US-509 AC#14）；移动 = 草稿里删除重建                                                                                                                                                                                                                                    |
| ECN 草稿「可暂不合法」与即时区间排他冲突                | 草稿只放宽跨行聚合；存储区间是候选时间线，截止标记写入即收窄、可见性由 US-508 裁决；写入顺序「先收窄后插入、先删除后放宽」（[US-515](../stories/plugin/US-515-bom-change-management.md) AC#17～#20）                                                                                                                                                             |
| US-515 的「并集只算可见发生项」反转了并集政策           | 解析不可见 ≠ 判环不可见：草稿 ECN 的成环发生项保存即拒绝（US-509 AC#15 / #16、US-515 AC#10）                                                                                                                                                                                                                                                                     |
| ECN 写入白名单缺逻辑行与子表                            | US-515「表 × 操作」矩阵：逻辑行与替代组带 `ecn_in_id`，位号 / 成员 / 分摊随所属发生项；头字段发布后不可改                                                                                                                                                                                                                                                        |
| 替代组 / 阶梯组聚合没有时间切片                         | 按生效域原子切片校验，旧成员保留、运行期不再重分配（[US-512](../stories/plugin/US-512-bom-substitute-group.md) AC#6 / #12 / #13、US-511 AC#24）                                                                                                                                                                                                                  |
| 聚合切的是候选时间线；已发布 ECN 改期 / 取消不重校验    | ECN 发布、已发布改期、取消共用「转换后运行投影」聚合入口，不借草稿凑合法（[US-515](../stories/plugin/US-515-bom-change-management.md) AC#23～#25）                                                                                                                                                                                                               |
| 子对象可挂在另一张草稿 ECN 新建的逻辑行 / 组下          | 父逻辑行 / 组须来自已发布数据或同一张 ECN；被引用的 ECN 不可取消（US-515 AC#26）                                                                                                                                                                                                                                                                                 |
| 映射要求即时父件相同，禁止重新分层                      | 变换范围由根级头配对定义，成员资格由从根头出发的头链证明、物料级并集只剪枝；共享子装配可带路径；换头不继承（[US-516](../stories/plugin/US-516-ebom-mbom-mapping.md) AC#11～#15）                                                                                                                                                                                 |
| 成本子件单价与需求不同单位；加工费乘无损耗的 L          | 相乘前按数量同一换算转到子头 `base_uom`；每件工时乘工序加工量 `W_op`（[US-514](../stories/plugin/US-514-bom-cost-rollup.md) AC#12～#16、US-511「装配损耗级联到工序」）                                                                                                                                                                                           |
| 多输出没有产出基准与成本归属                            | 主产物 = 头父件，副产量按 `P'` 缩放；联产品转 [US-513](../stories/plugin/US-513-bom-coproduct-byproduct.md) 阶段 B（价值待证）；US-513 AC#10 / #11、US-514 AC#17                                                                                                                                                                                                 |
| 导入同键平局、快照确定性、PG 隔离级别、配置 UI 无归属   | US-521 同键全员失败 + 完整排序键；US-508「同一份已提交数据」与一致快照；US-509 导出 DDL 只支持 Read Committed 并在触发器内检查；配置 UI 明确不做（US-517）                                                                                                                                                                                                       |
| 映射跟进基线只比末端行的发生项                          | 基线 = 源侧解析步骤集合（行发生项 + 解析所得子件修订，取自 manifest）：祖先用量变、imprecise 修订变都进缺口，precise 锁版与评估日变化不产生假缺口，确认整体推进基线（[US-516](../stories/plugin/US-516-ebom-mbom-mapping.md) AC#16～#22、[US-508](../stories/plugin/US-508-bom-view-resolution.md) AC#17）                                                       |

以下产品决策已按**最小方案**写进各故事。**1～8 条已于 2026-10-02 由 owner 确认**，作为开工基线；它们仍不是驱动样本验证过的结论——
第 0 步的真实样本若与其中任一条冲突，推翻它要先改对应故事再开工：

1. **逻辑行历史留在同一张头内**：`bom_line`（稳定业务身份）与 `bom_line_occurrence`（按生效期的时间记录）分层，
   改一行不强制新父修订（[US-507](../stories/plugin/US-507-bom-graph-skeleton.md)）。
2. **并集无环**：按 `(bom_type, org_id)` 禁止全部已存 `consume` 边的并集成环，接受对跨时段 / 互斥配置的保守误拒
   （[US-509](../stories/plugin/US-509-bom-dag-cycle-detection.md)、[US-517](../stories/plugin/US-517-configurable-sales-bom.md)）。
3. **聚合在发布时校验**：草稿只允许**跨行聚合**（位号、阶梯、替代组、分摊）暂不合法，发布转移按生效域切片原子整组校验；
   单行 CHECK、区间排他与判环在草稿里同样逐行即时生效。发布后只接受挂在 `draft` ECN 上的待校验写入，
   ECN 发布、已发布改期与取消都在转换后运行投影上整批校验（[US-515](../stories/plugin/US-515-bom-change-management.md#已发布头的写入协议)）。
4. **按当前知识查询过去**，不承诺精确重放当年计算；任何发布不得追溯生效，已生效的 ECN 不可取消或提前。
   「当日」是存储层在发布事务里取的 UTC 日期，保证相对写入端时钟；ECN 的 `effective` 由此派生、不存储；
   种子与历史数据经可审计的历史装载通道写入
   （[US-508](../stories/plugin/US-508-bom-view-resolution.md)、[US-515](../stories/plugin/US-515-bom-change-management.md)）。
5. **定量与固定工时按批计**：数量按路径 / 批次求，标准成本按头上的 `cost_lot_qty`（以头 `base_uom` 计）折单件，一次卷算单一币种
   （[US-511](../stories/plugin/US-511-bom-quantity-semantics.md)、[US-514](../stories/plugin/US-514-bom-cost-rollup.md)）。
6. **首轮不支持 BOM 同步**：同步配置即拒绝；导入整批原子进草稿；导出的 PG DDL 自带并发锁
   （[US-509](../stories/plugin/US-509-bom-dag-cycle-detection.md)、[US-521](../stories/plugin/US-521-bom-erp-mrp-integration.md)）。
7. **`unresolved` / `truncated` 只给浏览**：UI 可展示候选集与截断结果，数量、成本与 MRP 导出遇到即拒绝。
8. **数量精度是约定而非精确**：34 位有效数字十进制、中间量 half-even、需求行一次向上取整；非虚拟子装配取整后的值作为其子 BOM 的 P
   （[US-511](../stories/plugin/US-511-bom-quantity-semantics.md) AC#17）。约定的前提是输入无损：十进制值从输入到导出全程以规范串承载（US-511 AC#22）。
9. **驱动者仍是解锁条件**：[形态样本与手算 golden](#第-0-步样本) 已就位，但谁提出需求、验收场景是什么、本期支持哪些行业语义，仍是第 0 步要回答的问题。

### 数据结构与不变量

不指定表名实现，只列各故事已经共同遵守的合同，改动其中任一条都跨多条故事：

| 对象 / 上下文        | 不变量                                                                     | 归属                              |
| -------------------- | -------------------------------------------------------------------------- | --------------------------------- |
| 逻辑行 / 行发生项    | 稳定业务身份与时间记录身份分开；所有引用写明指哪一层                       | US-507 / US-508                   |
| 结构归属列           | 修订→物料、头→修订 / 类型 / 组织、行→头、发生项→行创建后不可改             | US-507 / US-509 / US-510          |
| 已解析节点           | 可计算节点是「已解析的头 + 上下文」，不用裸 `item_id` 标识                 | US-508 / US-510 / US-514          |
| `ResolutionContext`  | 显式日期、组织、类型、修订与备选选择；配置、序列、批次扩入同一上下文       | US-508；US-517 / US-518 扩展      |
| 数量值               | 值、单位、精度明确；进入子头前量纲一致；规范十进制串，不经 `number`        | US-511                            |
| 成本值               | 整批 / 单件与基准批量、币种、费率日、单位明确；本层局部系数 ≠ 根级累计需求 | US-514 / US-524                   |
| `draft` / `released` | 只有跨行聚合可暂不合法，在转换后运行投影上按生效域切片原子校验             | US-507 / US-512 / US-515 / US-520 |
| 已发布头的写入       | 只经 ECN「表 × 操作」矩阵；协议写入在 ECN 发布前不可见，但计入判环并集     | US-507 / US-508 / US-509 / US-515 |
| 存储宿主             | SQLite ≥ 3.47.0，低于即 `init()` 失败；不把触发器错误退化为常量消息        | US-030 / US-507 / US-509          |
| manifest / 装机事实  | 记录实际解析依据；可变来源不能反向改写历史                                 | US-508 / US-515 / US-523          |
| 结果完整性           | 浏览可截断、可未解析；成本、MRP 与导出遇到即拒绝                           | US-510 / US-514 / US-521 / US-522 |

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
