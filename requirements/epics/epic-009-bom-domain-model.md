---
id: epic-009-bom-domain-model
status: Backlog
startDate: TBD
targetDate: TBD
owner: jimmy
---

# BOM 领域模型

## 愿景

让**一套数据结构**表达 EBOM / MBOM / 销售 BOM / 成本 BOM，覆盖单级与多级、树与 DAG、虚拟件与替代料，
并能对接 ERP/MRP。

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
- 它是**应用领域模型**：一层建立在现有实体/仓储/活查询之上的行业语义，
  对引擎的唯一要求是「边要能带 20+ 属性且同一对节点间允许多条边」。

## 目标

三条都是可核对的状态：

- [ ] 一套表结构同时解析出 EBOM / MBOM / 销售 BOM / 成本 BOM 四种视图，且四者共享同一份物料主数据；
- [ ] 多级展开的**数量**与手算一致——三类损耗（装配 / 组件 / 工序）位置正确、虚拟件穿透、定量与公式用量；
- [ ] 成环在存储层被拒，卷算的拓扑排序永不死锁，且联产品/副产品的反向物料流**不被误判成环**。

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [US-507 BOM 图骨架：物料、修订与多重边 BOM 行](../stories/plugin/US-507-bom-graph-skeleton.md) (Low)
- [US-508 BOM 视图解析：类型/组织/版本/生效期过滤](../stories/plugin/US-508-bom-view-resolution.md) (Low)
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

## 价值待证（整个 Epic）

**本 Epic 的 17 条故事全部标价值待证，`priority` 一律 `Low`，不进任何排期批次。**

判据是 [CONVENTIONS 的病灶数 ≥ 抽象数](../CONVENTIONS.md#价值待证)：这 17 条新增约 12 个抽象
（`item_revision` / `bom_substitute_group` / `ecn` / `bom_map` / `flow_direction` / `config_condition` /
`attr_def` / `bom_closure` 等），而本仓当前**零个已知 BOM 缺陷**，也写不出「今天用户踩得到的具体症状」。

**解锁条件**：出现一个真实的驱动场景——客户 BOM 数据集，或一个要上线的 BOM 应用。
在那之前 epic 的 `startDate` / `targetDate` 保持 `TBD`：填日期就是本条款禁止的「凭 Epic 惯性排期」。

唯一带独立病灶的是 [US-509](../stories/plugin/US-509-bom-dag-cycle-detection.md)，
它同时补 `@aiao/rxdb-plugin-graph` 的一个现存缺口（图插件只保证 `findPaths` 返回非循环路径，
**不阻止**成环边写入）。该条可脱离本 Epic 单独评审。

## 首轮可开工切片

驱动场景一旦出现，最小可演示闭环是 **US-507 + US-508 + US-509 + US-510 阶段 A**：
建 BOM → 按视图解析 → 多级展开 → where-used 反查 → 拒绝成环。四条都不预设行业。
US-511 必须紧随——数量对不上，前面四条没有业务意义。

## 非目标

- **工艺路线本体**（工作中心、作业类型、费率）——[US-520](../stories/plugin/US-520-bom-routing-operation.md)
  只做 BOM 行到工序的**挂接与分摊**，路线本体是独立模型；
- **配置约束求解器**——[US-517](../stories/plugin/US-517-configurable-sales-bom.md) 只定数据模型与契约，求解可外挂；
- **库存 / 批次 / 在制**——属事务域，不进本 Epic；
- **MRP 运算本身**——本 Epic 只负责把正确的结构与数量交给 MRP，见
  [US-521](../stories/plugin/US-521-bom-erp-mrp-integration.md)。
