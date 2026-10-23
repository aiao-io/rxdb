# BOM 故事阶段验收留档

本文件保留迁出故事正文的阶段记录。其中“仍待”等描述对应当时的验收时点；当前状态以[最终验收](closure-map.md)为准。

## US-030

来源：[US-030-declarative-storage-constraints.md](../../requirements/stories/core/US-030-declarative-storage-constraints.md)

### 2026-10-18 阶段D验收进展

用户本轮完整BOM范围包含US-519热字段提升及其阶段D前置，已不处于未授权待证状态。生成列、受限表达式与索引方法、实例级冻结计划和目录漂移已实现；核心完整回归四项覆盖率均达到90%，双端真实DDL/漂移16项及透明查询/迁移/重放25项通过。10k数据的B-tree/GIN实际命中与预算见[spec023验收记录](../023-bom-hot-fields/validation.md)。阶段D/AC#5功能证据已通过，BOM及SQLite共同层完整覆盖率也已达标；PGlite显式四项94.99/87.53/94.32/96.47%也已达标；Tauri、搜索/三端对称性修复后的最终完整门禁及8包严格审计均已通过，本故事已Done。

### 2026-10-18 独立功能验收收口

阶段D与AC#5已有完整证据链：受限DSL、生成列/高级索引与实例级存储声明在核心定向90项和完整核心2660通过/1既有跳过中验证，完整核心四项均≥90%；双端真实DDL、目录、漂移与升级16项通过；透明查询、审计迁移和重放25项通过。10000行/50命中的B-tree及PG GIN实际SQL/EXPLAIN、16ms查询与100ms保存预算均通过，见[spec023 validation](../023-bom-hot-fields/validation.md)。

最终完整affected351任务EXIT0、三端共享51/51、demo24/24（2026-10-18时点）、Tauri额外门禁及8包严格覆盖率全部通过，本故事全部功能AC与最终门禁已关闭，status为Done。证据及失败/修复历史见[最终验收](closure-map.md)。

## US-507

来源：[US-507-bom-graph-skeleton.md](../../requirements/stories/domain/US-507-bom-graph-skeleton.md)

### 2026-10-18 验收状态复核

AC#2/#3补记既有解析回归的通过事实：US-508 AC#17按两个日期验证imprecise跟随与precise锁版，本轮联产C09及共享视图新修订回归再次验证。AC#13的Reach零写入追加段已有独立通过证据，52条Reach回归现已随完整BOM886/886通过；最终完整门禁已通过，故事已Done。

### 2026-10-18 独立功能验收收口

AC#13的结构归属不可改与Reach零写入追加段已具独立证据：Reach维护/备份44项包含被拒归属更新后的逐行闭包不变与DML审计，新上下文8项另行通过。字段拒绝仍来自写入协议，不能借物化表改变归属。证据和完整矩阵见[spec024 quickstart](../024-bom-reach/quickstart.md)。

最终完整affected351任务EXIT0、三端共享51/51、demo24/24（2026-10-18时点）、Tauri额外门禁及8包严格覆盖率全部通过，本故事全部功能AC与最终门禁已关闭，status为Done。证据及失败/修复历史见[最终验收](closure-map.md)。

### 首轮切片第 4 步关闭记录

阶段 C 已交付：`bom_line_designator` 位号子表（挂行发生项 1:N，`(occurrenceId, designator)` 唯一、
随发生项删除级联）+ `designator_managed` 列；发布转移校验位号数 = 名义 `qty`（整数逐字节判定），
违约整次回滚且错误同时给位号数与 qty（AC#5）；非 managed 行不校验（AC#12）；位号完整返回且
需求量仍取自 qty（AC#4）；已发布头的位号增删改与改指拒绝、`occurrenceId` 结构列不可改
（AC#10/#13 的位号部分）。至此阶段 A/B/C 全关，本故事的 AC#1/#8/#9/#11/#14 与 AC#4/#5/#12 全绿。

### 首轮切片第 1 步关闭记录

阶段 A/B 已交付（`packages/rxdb-plugin-bom`）：AC#1/#6/#7/#8/#9/#11/#14 全关；
AC#10/#13 的发生项部分已关（⚠️），位号子表部分随阶段 C（第 4 步）；AC#2/#3 随第 2 步（US-508 imprecise 解析）、
AC#4/#5/#12 随阶段 C。AC#14 的 `released → draft` 按「发布不可逆」拒绝（决策 4），发布转移要求 `effective_from` 非空。

## US-508

来源：[US-508-bom-view-resolution.md](../../requirements/stories/domain/US-508-bom-view-resolution.md)

### 首轮切片第 2 步关闭记录

首轮 AC#1~#11 / #13~#15 / #17 / #18 全关（`packages/rxdb-plugin-bom`，双后端 wa-sqlite / pglite 同断言）：
显式 `ResolutionContext`（`as_of_date` 必填、不读系统时钟）；父修订按时点取已发布最新或显式指定；
released 头 + 生效窗口 `[effective_from, effective_to)` 含评估日；imprecise 子件修订取「released 且
`effective_from ≤ as_of_date`」的最新（唯一性由 AC#10 的部分唯一索引保证）；多备选手动未指定 → `unresolved` + 候选。
追溯发布由存储层触发器拒绝（UTC 当日，不读宿主时区），`loadHistory` 经开启态批次审计通道放行、批次只追加、
关闭后不再放行（AC#13/#14/#18）；一次解析的全部读取在同一个读事务（AC#15）。
AC#12/#16已随US-515关闭：未发布ECN不入解析，发布后按显式评估日可见，不读取宿主当前日期替代评估日。本轮共享视图真实事件及日期回归再次通过；最终分支门禁已通过，故事状态已同步Done。

## US-509

来源：[US-509-bom-dag-cycle-detection.md](../../requirements/stories/domain/US-509-bom-dag-cycle-detection.md)

### 2026-10-18 独立功能验收收口

AC#8/#15/#16补关Reach追加段：真实存储先点查物料对，再取单条有界见证；draft头/draft ECN及已发布未生效ECN进入consume并集，拒绝写入不改闭包，接受的draft写入立即入闭包，发布状态本身零DML，取消/撤回实际删除后维护支持关系。双后端维护/备份44项与上下文8项分轮通过。AC#13真实PG最终已扩至12/12，覆盖Read Committed作用域锁、RR/Serializable拒绝、反向边及删除串行、跨作用域死锁和调用方事务ROLLBACK；证据为本地日志`bom-reach-pg-12-green.log`（未留存）及[spec024 quickstart](../024-bom-reach/quickstart.md)。

最终完整affected351任务EXIT0、三端共享51/51、demo24/24（2026-10-18时点）、Tauri额外门禁及8包严格覆盖率全部通过，本故事全部功能AC与最终门禁已关闭，status为Done。证据及失败/修复历史见[最终验收](closure-map.md)。

### 首轮切片第 2 步关闭记录

首轮 AC#1~#3 / #5~#7 / #9~#12 / #14 / #17 全关（`packages/rxdb-plugin-bom`，双后端同断言）：
`(bom_type, org_id)` 物料级并集的递归 CTE 判环（深度硬上限 128、三态判定），递归项到达父物料即停止延伸——
路径终止于父正是错误消息要的环路径，也避免多重边成环时 UNION ALL 不去重导致的指数爆炸；
自环是路径长度 0 的退化环（AC#2）；绕过 adapter 直连写库仍被拒（AC#5）；`union_only` 由插件 API 层
读路径各边区间求交集补充标记（AC#9）；http/supabase `init()` 显式 fail-fast（AC#6）、
`cycleConstraintDdlForRemotePg()` 导出含 advisory 锁与隔离级别检查的远端 DDL（AC#7）、
BOM 实体声明同步配置即拒绝（AC#12）。
AC#4 等 US-513、AC#8 等 US-510 阶段 B 的可达性表、AC#13 等真实 PostgreSQL 环境、AC#15/#16 等 US-515 落地。

### 首轮切片第 5 步关闭记录

AC#4 已关（随 US-513 阶段 A）：`flow_direction` 列落地，判环触发器只认 `consume` 边
（存储边与 NEW 边均过滤，非 consume 的 NEW 行整体跳过）——X consume Y 与 Y by_product X
并存不报环，consume 子图成环仍拒。

### 真实 PostgreSQL 关闭记录

2026-10-18：`pnpm nx run rxdb-plugin-bom:test-pg` 在独立临时 PostgreSQL 16.15 集群通过 8/8 用例，关闭 AC#13。先确认原始 DDL 的 schema 部署功能红，再修正 `bom` schema、camelCase 列名、父物料解析与方向更新触发入口。Read Committed 用真实 `pg_locks` 等待同步证明锁后重检；Repeatable Read / Serializable 预先建立快照后均被拒绝；跨类型/组织反序取锁得到 `40P01` 且各作用域无环。自环、非 consume 更新与作用域隔离同批通过。服务只监听独占 Unix socket，集群启动与清理均已验证；记录见 [spec021 quickstart](quickstart.md)。

## US-510

来源：[US-510-bom-multilevel-explosion.md](../../requirements/stories/domain/US-510-bom-multilevel-explosion.md)

### 2026-10-18 独立功能验收收口

阶段B的功能AC已具独立证据：44项维护/备份回归覆盖A×D增量、重边与替代路径、端点/方向变更、非拓扑零DML、四图固定种子oracle、旧库/坏图/水位和真实物理备份；新增8项覆盖历史修订/日期与所有上下文。20串菱形61物料/80边只物化1810对，仍按10000条实际发生项路径截断。备选由resolveBom和完整消费入口裁决，expandBom/whereUsed保留首轮多头路径合同。主数据反查最小索引独立基线为236.24→7.60ms；读取原型与写入/维护/迁移预算已由主会话独占复测确认，原始数据及不启用额外读取策略的取舍由[spec024 quickstart](../024-bom-reach/quickstart.md)记录，不把索引收益记成闭包收益。

最终完整affected351任务EXIT0、三端共享51/51、demo24/24（2026-10-18时点）、Tauri额外门禁及8包严格覆盖率全部通过，本故事全部功能AC与最终门禁已关闭，status为Done。证据及失败/修复历史见[最终验收](closure-map.md)。

### 首轮切片第 2 步关闭记录

阶段 A 已交付（`packages/rxdb-plugin-bom`，双后端同断言）：AC#1 / #2 / #11 全关；AC#7 / #10 的
下钻部分（生效窗口滤除、预算截断）已关（⚠️），可达性表部分随阶段 B。
实现：`expandBom` / `whereUsed` 按 BFS 逐层取解析后的发生项（与 US-508 同口径），路径为行发生项 id 序列
（根→节点；反查保持同一方向）；预算结算在 TS 侧逐层进行——深度是 SQL 侧唯一硬停，展开数 / 返回路径数
触顶即停并标 `truncated`（附触顶项），`AbortSignal` 在节点间检查（`cancelled`）；AC#10 的 20 串联菱形
（1,048,576 条路径）恰好返回 10,000 条、原因路径数；`assertCompleteResolution` 守卫截断与未裁决备选
（AC#11 的本步形态），数量 / 成本 / 导出消费方必须先过它。

## US-511

来源：[US-511-bom-quantity-semantics.md](../../requirements/stories/domain/US-511-bom-quantity-semantics.md)

### 2026-10-18 验收状态复核

阶段A/B1/B2/C与全部26项AC已关闭，AC#22的展开段已有手算golden，旧注释不再表示待实现。最终完整分支门禁已通过，故事已Done；数量、成本与导出的既有回归不由静态阅读替代。

### 首轮切片第 3 步关闭记录

阶段 A / C / B1 已交付（`packages/rxdb-plugin-bom`，双后端同断言）：AC#2~#12 / #14~#22 / #24~#26 全关
（AC#22 的存储 / 回读与入口规范化段已在第 1 步关闭，展开段随本步完成；AC#23 第 1 步已关）。
实现要点：

- **十进制 kernel**（`src/quantity/decimal.ts`）：纯 BigInt 定点，34 位有效数字、中间量 half-even、
  需求行 `ceilToDecimalPlaces` 向上取整；不经 JS `number`（AC#20 的 34 位 golden 逐字断言）。
- **公式求值器**（`formula.ts`）：受限语法（字面量、四则、括号、命名参数，参数名允许 Unicode 字母），
  `FORMULA_GRAMMAR_VERSION = '1'` 持久化；缺参 / 语法错 / 除零 / 负结果整次拒绝点名（AC#3 / #14）。
- **单位换算**（`uom.ts`）：同量纲 metric 前缀标准系数；跨量纲只经行级 / 物料级显式换算率
  （「1 目标单位含多少源单位」，行级覆盖物料级）；缺换算率拒绝不默认 1（AC#5 / #9 / #10）。
- **七步展开**（`explosion.ts`）：`explodeBom` 按故事技术笔记的固定顺序逐层计算，BFS 复用
  US-510 骨架与预算结算；阶梯按损耗前 P 选行（AC#6 / #19）；phantom 穿透在换算之后、
  中间量不舍入（AC#8）；非虚拟子装配取整值下传（AC#17）；`truncated` / `unresolved` 拒绝计算；
  manifest 追加换算率 / 公式参数 / 语法版本 / 算法版本（`EXPLOSION_ALGORITHM_VERSION = '1'`）。
- **存储约束**：`qty` 与 `qty_formula` 恰好一项、阶梯三字段形状（US-030 CHECK，AC#7 / #21）；
  良率制损耗域 `[0,1)` 逐字节谓词（AC#12）；阶梯边界 15 位有效数字、整数与小数各 ≤ 15 位
  保存期一致拒绝（AC#25 / #26）；头发布转移的阶梯切片校验——同组阶梯行生效域与批量区间
  同时相交才拒绝，SQLite `CAST AS REAL` / PG `::numeric` 在收窄域内结论一致（AC#24）。

AC#1 / #13（工序损耗）随阶段 B2（US-520 / US-524 落地后）。

### 首轮切片第 5 步关闭记录

阶段 B2 已交付（`packages/rxdb-plugin-bom`，双后端同断言）：AC#1/#13 全关——七步第 5 步
工序损耗：从投料工序（含）至末工序逐道累乘（每道工序各自的 `scrap_convention`），分摊行每份额
从自己的工序起算；`steps.operationScrapped` 进算式面板；`EXPLOSION_ALGORITHM_VERSION` 升 `'2'`。
AC#1 的 34 位 golden `220.8247422680412371134020618556701` → 需求行 221 逐字断言。

## US-512

来源：[US-512-bom-substitute-group.md](../../requirements/stories/domain/US-512-bom-substitute-group.md)

### 首轮切片第 5 步关闭记录

非 ECN 场景已交付（`packages/rxdb-plugin-bom`，双后端同断言）：AC#1~#5/#7/#8/#10~#13/#15 全关。
`bom_substitute_group` 一等实体（(headerId, code) 唯一 + 单行 CHECK AC#10）；成员列挂行发生项
（概率 9 位小数域两后端保存即拒）；发布转移按生效域桶校验（恰好一个 primary / priority 不并列 /
合计恒 1 定点整数 10⁹ 比较，错误还原规范串）；已发布头组/成员写入拒绝；展开分流（proportional
分摊 golden、priority 择优与可用量上限、manual unresolved + `ResolutionContext` 扩展）。
ECN 场景（AC#6/#9/#14）随 US-515 同批关闭。

## US-513

来源：[US-513-bom-coproduct-byproduct.md](../../requirements/stories/domain/US-513-bom-coproduct-byproduct.md)

### 2026-10-18 阶段B功能验收收口

此前demo首轮保留真实失败：原23条通过，新增联产场景因SC-100必填rohs未提供而装载失败。共享loader随后增加调用方显式`itemExt: { rohs: 'yes' }`，缺参数与非法枚举仍拒绝，种子6/6通过。第三轮完整收集现确认`dev-rxdb-bom-e2e` **24/24通过，50.9s**：新增首条联产场景验证220→132/88、显式下游来源及17.6成本，原23条全部回归通过，本地日志`bom-affected-complete3.log`（未留存）。

结合完整领域886/886与三端包内绑定/组件回归，C14及阶段B功能验收据此关闭。三端共享51/51、Tauri、恢复后的PGlite有效覆盖率、8包严格审计及完整分支门禁均已通过，整体status已Done。

### 首轮切片第 5 步关闭记录

阶段 A 已交付（`packages/rxdb-plugin-bom`，双后端同断言）：AC#1/#3/#4/#5/#6/#8/#9/#10/#11 全关。
`flow_direction` 三值列 + 判环/可达性只认 `consume`（US-509 AC#4 同批关闭）；`by_product` 子件 =
头父件发布拒绝；consume 负用量复用格式触发器非负域；展开分流——`by_product` 产出量按 `P'` 缩放
（`is_fixed_qty` 按批）、`scrap_out` 进产出列表不进需求行、「无投入」头整次拒绝、自回流分列。
AC#2/#7（卷算）随 US-514 同批关闭。

2026-10-18追加：阶段B的C07真实双后端已证明副产10×0.5抵减5、废料与produce不抵减，过程220→215后分配129/86；据此补关阶段A的AC#2/#7。阶段B完整记录见 [quickstart](../022-bom-coproduct/quickstart.md)，剩余演示与门禁见 [tasks](../022-bom-coproduct/tasks.md)。

## US-517

来源：[US-517-configurable-sales-bom.md](../../requirements/stories/domain/US-517-configurable-sales-bom.md)

### 第 8 步关闭记录

2026-10-16：配置实体、保存期引用校验与统一解析链；缺参、互斥、并集环与 manifest 双后端回归通过。 联合验收：插件 554 条、演示 21 条通过；完整门禁和性能证据见 [第 8 步 quickstart](../018-bom-slice-8/quickstart.md)。

## US-518

来源：[US-518-bom-unit-lot-effectivity.md](../../requirements/stories/domain/US-518-bom-unit-lot-effectivity.md)

### 第 8 步关闭记录

2026-10-16：三维有效域整体由 BOM 插件触发器承担，日期排他退化为全序列/全批次特例；区间 CHECK、三维矩阵、未解析候选与消费方拒绝通过。 联合验收：插件 554 条、演示 21 条通过；完整门禁和性能证据见 [第 8 步 quickstart](../018-bom-slice-8/quickstart.md)。

## US-519

来源：[US-519-bom-extension-attributes.md](../../requirements/stories/domain/US-519-bom-extension-attributes.md)

### 2026-10-18 热字段收口进展

AC#3/#7已随本轮完整BOM授权进入spec023，真实双后端透明查询、审计迁移和重放25/25通过；10000行、50条命中的正常规划器配置下，SQLite B-tree及PGlite B-tree/GIN命中新索引，filterByAttr和ext保存均在16/100ms预算内。原始SQL、EXPLAIN及样本见[验收记录](../023-bom-hot-fields/validation.md)。当前两项功能证据已齐；T017/T018及故事整体已随最终完整验收关闭。

### 2026-10-18 独立功能验收收口

AC#3/#7按真实计划关闭：10000行、50条命中，原filterByAttr API在同键生成列B-tree及PG未提升键GIN路径上命中新索引；GIN关闭时结果保持一致，规划器未禁用seqscan。显式迁移、字典/旧值审计、坏值回滚和全部重放纳入25/25；16项双端DDL/目录回归另行通过。查询/保存原始样本与EXPLAIN见[spec023 validation](../023-bom-hot-fields/validation.md)。

最终完整affected351任务EXIT0、三端共享51/51、demo24/24（2026-10-18时点）、Tauri额外门禁及8包严格覆盖率全部通过，本故事全部功能AC与最终门禁已关闭，status为Done。证据及失败/修复历史见[最终验收](closure-map.md)。

### 第 8 步关闭记录

2026-10-16：本轮关闭 AC#1/#2/#4/#5/#6：三层扩展值、声明元数据、强制保存校验与双后端类型化查询。AC#3/#7 继续等待 US-030 阶段 D。PGlite 当前物理 JSON 文本列通过 ::jsonb 实现查询语义，见 specs/018 设计决策。 联合验收：插件 554 条、演示 21 条通过；完整门禁和性能证据见 [第 8 步 quickstart](../018-bom-slice-8/quickstart.md)。

## US-520

来源：[US-520-bom-routing-operation.md](../../requirements/stories/domain/US-520-bom-routing-operation.md)

### 首轮切片第 5 步关闭记录

非 ECN 场景已交付（`packages/rxdb-plugin-bom`，双后端同断言）：AC#1~#10 全关。
行挂 `operation_seq`（保存期校验：头已挂路由时工序必须在序集内）+ `bom_line_operation_split`
分摊子表（9 位小数域、`(occurrenceId, operationSeq)` 唯一、`occurrenceId` 结构列不可改、
与 `operation_seq` 互斥 AC#6）；发布转移校验分摊合计恒 1（定点整数）；展开第 5 步——
投料工序（含）至末工序逐道累乘、分摊每份额从各自工序起算不重复施加损耗（AC#8）。
AC#11已与US-524 AC#7在spec020同批验收：`bom-routing-effectivity.spec.ts`双后端54/54通过，覆盖validFrom/disabledAt边界、单工序与分摊，以及数量/根层子层成本/导出对未覆盖路线的明确拒绝。最终统一门禁已通过，故事已Done。

## US-521

来源：[US-521-bom-erp-mrp-integration.md](../../requirements/stories/domain/US-521-bom-erp-mrp-integration.md)

### 第 8 步关闭记录

2026-10-16：稳定导出契约、同快照主数据与数量、完整替代组、逐行 SAVEPOINT 和整批原子草稿导入通过；位号/组成员/分摊、延迟外键、同键组、重叠及环诊断均有双后端真实回归。 联合验收：插件 554 条、演示 21 条通过；完整门禁和性能证据见 [第 8 步 quickstart](../018-bom-slice-8/quickstart.md)。

## US-523

来源：[US-523-bom-as-built-instance.md](../../requirements/stories/domain/US-523-bom-as-built-instance.md)

### 2026-10-18 当前实现补记

上节“US-522独立排期”仅记录第9步当轮范围。三端绑定现已在[spec020](../020-bom-slice-10/quickstart.md)实施，Angular14、React16、Vue18条包内回归及三端四项覆盖率≥80%已通过；当前完整BOM60文件、886/886通过，含新增联产的独立demo24/24通过。最终三端共享e2e与完整分支门禁仍待收口，不将第9步历史通过扩写为本轮全绿。

### 第 9 步关闭记录

2026-10-16～17：AC#1～13 完成领域与消费方联合验收。实例事实固定实际修订，支持显式时点、全历史与序列/批次追溯；安装区间、单父、无环及序列必填由写入期约束保护。草稿来源直接删除、未生效 ECN 取消与草稿 ECN 撤回均验证引用保护及整次回滚。

插件 38 个测试文件、599 条用例分段通过（597 条常规与 2 条规模），包含 SQLite/PGlite 各 1000 台、10 万实例节点的主数据隔离回归（该规模为当轮一次性实跑，2026-10-17 起常驻回归为 100 台、1 万节点，见第 9 步 tasks T008），以及阶段 F 种子真实执行前后三个时点的整机展开与卷算结果不变。演示 23 条 e2e 全部通过：41 个物料、43 个发生项与 5 条初始安装事实覆盖 SN-001/SN-002、换件历史、固定实际修订、追溯与来源删除拒绝。

运行方式、实际命令与分段验证证据见 [第 9 步 quickstart](../019-bom-slice-9/quickstart.md)，公共契约见 [实例 API](../019-bom-slice-9/contracts/instance-api.md)。BOM、Electron 与分支级 affected 剩余目标均已分段完成；首轮 Vue 失败、确定性修复及后续补齐结果完整保留。US-522 三框架绑定继续独立排期；本轮不扩展维修工单、换件事务、实际数量/单位或跨安装的稳定实物身份。

## US-524

来源：[US-524-routing-master-model.md](../../requirements/stories/domain/US-524-routing-master-model.md)

### 2026-10-18 路线停用消费验收

AC#7与US-520 AC#11已由spec020的54/54双后端回归补齐：路线在`[validFrom, disabledAt)`内可用，停用当天及之后的工序与分摊消费明确报路线/发生项未覆盖；数量、成本和导出使用同一边界。其余阶段与AC原已交付，没有额外待实现阶段，最终统一门禁已通过，故事已Done。

### 首轮切片第 5 步关闭记录

阶段 A（除 AC#7 的展开面）与阶段 D 已交付（`packages/rxdb-plugin-bom`，双后端同断言）：
AC#1/#2/#6/#8/#9/#10/#11 全关。`work_center` / `routing`（唯一键与 BOM 头对齐）/
`routing_operation`（(routingId, operationSeq) 唯一、工作中心引用完整性、工序损耗与各自
`scrap_convention` 同 US-511 记法）；头挂 `routing_id`（FK，指向不存在路线保存拒绝）。
AC#7 的「停用后不入结果」展开面随 US-520 AC#11 同批（阶段 C 的工时模型之前）；AC#3/#4/#5
随阶段 B/C。

## US-525

来源：[US-525-bom-end-to-end-demo.md](../../requirements/stories/domain/US-525-bom-end-to-end-demo.md)

### 2026-10-19 产品体验回归补记

2026-10-18～19 并行会话的 demo 产品体验改进（研究与实施记录见[产品体验研究](../../requirements/domain-research/bom-demo-product-ux-2026-10-19.md)第 7 节）新增 10 条 e2e，此前未入任何切片账：

| spec                           | 条数 | 覆盖                                                                                                                                                                                                                     |
| ------------------------------ | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bom-redesign.spec.ts`         |    4 | 已有数据重开直接可用且取消重置不丢数据；成本按业务精度展示并可展开原值；窄屏导航可关闭且无横向溢出；反查树鼠标/键盘折叠与窄屏                                                                                            |
| `bom-product-workflow.spec.ts` |    6 | 计划量改后结果待更新、重新展开后下载保留同一批量；搜索→快捷反查→回到结构及刷新保留条件；10 台生产引导贯穿结构/成本/反查；375px 导航焦点循环与 Escape；导入草稿离页刷新后显式勾选再发布；重复 M3 发生项各自路径与窄屏返回 |

口径校准：`dev-rxdb-bom-e2e` 现共 34 条（`bom-demo.spec.ts` 23 + `bom-coproduct.spec.ts` 1 + 上表 10）。各切片与故事里的「demo24/24」「原23条」是 2026-10-18 最终门禁时点的统计（当时只有前两份 spec），保留为历史记录。34 条的可复核证据：PR #129 CI [run 39218306973](https://github.com/aiao-io/rxdb/actions/runs/39218306973)（d8542b3c）的 `e2e (bom)` lane「Running 34 tests using 1 worker / 34 passed」。

### 2026-10-18 当前实现补记

上节三框架绑定的“独立后续范围”属于第9步历史分工；当前三端绑定已在[spec020](../020-bom-slice-10/quickstart.md)实现，包内回归及四项覆盖率门槛已通过。完整BOM默认套件60文件、886/886通过，含联产49、v2集成16、种子6与Reach52；`dev-rxdb-bom-e2e`24/24通过（50.9s），新增联产验证220→132/88与显式下游来源，原23条全绿，证据为本地日志`bom-affected-complete3.log`（未留存）。最终三端共享e2e、Tauri、PGlite覆盖率、五项审计与整个分支结论仍待主会话收口。

### 首轮切片第 4 步关闭记录

阶段 A 已交付（AC#1~#6 全绿）：
`packages/rxdb-plugin-bom/src/testing/`（`scooter-dataset.ts` 确定性种子——id 由业务键 FNV-1a
派生、审计时间戳固定基准、批次号常量，两遍装载全表 dump 逐字节相同；`scooter-golden.ts`
手写 golden 表，不由被测 kernel 生成）、`apps/dev-rxdb-bom`（Angular：展开树 + 七步算式面板
（第 5 步显示「工序损耗未交付」）+ 评估日显式输入 + 直连写入按钮 + 位号发布校验演示 +
where-used 面板，`pnpm nx serve dev-rxdb-bom` 一键起）、`apps/dev-rxdb-bom-e2e`
（playwright 六条 AC 用例）。vitest 对账测试以独立 oracle 逐位比对 explodeBom 输出。
端口：本机 4310 被 QQ 占用，demo 起在 **4311**（故事 INVEST 清单端口可调）。

### 首轮切片第 5 步关闭记录

阶段 B 已交付（AC#7~#9 全绿）：种子 B 层追加外壳下料头（consume/by_product/scrap_out）、
10kΩ 替代组（COVER-ASSY，proportional 0.5/0.3/0.2）、工艺路线 10→20→30（20 损耗 3%）与
分摊 6:4（PROCESS-01）；A 层路径 golden 值逐位不变（加层不扰动旧结构）；算式面板第 5 步
显示工序损耗累乘值与分摊；e2e 三条 AC 用例 + demo 替代组发布拒绝演示（0.5/0.3 → 0.8）。

### 首轮切片第 8 步关闭记录

阶段 E 已交付（2026-10-16，AC#17~#20）：41 物料、4 批次的 E 层种子，扩展属性、序列候选、配置与导入导出面板；六页应用壳保留全部验收行为，21 条 e2e 全绿。阶段 F 于第 9 步接续实施。验证与性能见 [第 8 步 quickstart](../018-bom-slice-8/quickstart.md)。

### 首轮切片第 9 步关闭记录

2026-10-16～17：阶段 F 已交付，AC#21/#22 通过。SC-100 的 SN-001 / SN-002 复用实际电池部位，41 个物料、43 个发生项与 5 条初始安装事实覆盖两台整机、电池及批次件；实例追溯页展示实际修订、装拆区间与序列/批次反查，并验证换件历史、主数据 BATT:B 改版不改实例、草稿来源直连删除拒绝。

原 21 条与新增 2 条共 23 条 e2e 全部通过。联合领域回归为 38 个文件、599 条分段测试，包含两端各 10 万实例节点的主数据隔离、F 种子保持 A～E 计算结果，以及来源三条删除路径的拒绝与回滚；领域验收见 [US-523](../../requirements/stories/domain/US-523-bom-as-built-instance.md)。运行、实际命令与分支门禁证据见 [第 9 步 quickstart](../019-bom-slice-9/quickstart.md)：保留首轮 affected 的 Vue 失败及必要修复，随后补齐剩余目标，BOM/Electron 分段验证均已完成。US-522 三框架绑定保持独立后续范围。
