# Feature Specification: epic-009 首轮切片第 5 步（US-525 阶段 B 的前置故事群）

**Feature Branch**: `claude/bom-related-work-77235b`
**Created**: 2026-10-14
**Status**: Draft

**Input**: 第 1~4 步已交付（首轮切片闭环，affected 279/279 全绿）；按 [epic 切片表](../../../requirements/epics/epic-009-bom-domain-model.md#首轮可开工切片) 推进第 5 步——US-525 阶段 B（数量的三个硬用例：替代组 / 多输出 / 工序）的前置故事群。

- [US-513 联产品与副产品](../../../requirements/stories/domain/US-513-bom-coproduct-byproduct.md) — 阶段 A（AC#2/#7 随 US-514）
- [US-512 替代组与替代策略](../../../requirements/stories/domain/US-512-bom-substitute-group.md) — 非 ECN 场景（AC#1~#5/#7/#8/#10~#13/#15；ECN 场景随 US-515）
- [US-524 工艺路线本体](../../../requirements/stories/domain/US-524-routing-master-model.md) — 阶段 A / D（存储面）
- [US-520 工艺路线挂接与工序投料分摊](../../../requirements/stories/domain/US-520-bom-routing-operation.md) — 非 ECN 场景（分摊与挂接）
- [US-511 展开数量正确性](../../../requirements/stories/domain/US-511-bom-quantity-semantics.md) — 阶段 B2（七步第 5 步工序损耗）
- [US-525 BOM 端到端 demo](../../../requirements/stories/domain/US-525-bom-end-to-end-demo.md) — 阶段 B（AC#7~#9 + 种子 B 层 + 面板第 5 步）

## 用户故事与优先级

### US1 多输出物料流（US-513 阶段 A，Priority: P1）

- `bom_line_occurrence.flow_direction` 三值 `consume` / `by_product` / `scrap_out`（default consume）；主产物 = 头父件。
- 判环与可达性只认 `consume`（同时关闭 US-509 AC#4）；`by_product` 边不入并集图。
- 展开：`consume` 走七步（现有链路）；`by_product` 产出量 = `q × P' / base_qty`（`is_fixed_qty` 按批不缩放），不过组件/工序损耗；`scrap_out` 不产需求行、进结果可归集；`consume` 负用量存储层拒绝（复用格式触发器非负域）；`by_product` 子件 = 头父件拒绝；只有非 consume 行无 consume 行的头展开报「无投入」；自回流（同头副产又投入）接受且毛需求与产出量分列。
- `produce` 值阶段 A 不存在（枚举三值即拒）。

**Independent Test**：AC#1 反向对不报环；AC#3 只有 consume 构成层级；AC#4 无投入报错；AC#5 负用量拒绝；AC#6 scrap_out 可见不产需求行；AC#8 自回流分列；AC#9 consume 子图成环仍拒；AC#10 副产缩放 golden（R 110/220→121 kg、S 10/20→11 kg）；AC#11 by_product 子件=头父件拒绝。

### US2 替代组（US-512 非 ECN，Priority: P1）

- `bom_substitute_group` 一等实体：`(headerId, code)` 唯一、`strategy`（priority/proportional/manual）、`allow_mix`；成员挂在行发生项上：`role`（primary/substitute）、`substitute_priority`、`usage_probability`（[0,1]、小数 ≤9 位，两后端保存即拒越界）、`equiv_qty`；同一发生项至多一个组（组合外键/索引）。
- 聚合约束在**发布转移**按生效域切片校验：每切片恰好一个 primary、priority 不并列、proportional 合计恒 1（定点整数比较，两后端一致）；单行非法组合（proportional × allow_mix=false）保存即拒（CHECK）；组/成员跨头组合外键即拒；发布后成员与组不可改。
- 展开分流（`ResolutionContext` 扩入 `substituteSelections` / `substituteAvailabilities`）：proportional 按概率分摊（各乘 equiv_qty，守恒按 primary 计）；priority 择优（allow_mix=false 且最高者可用量不足 → 拒绝点名）；manual 未给选择 → `unresolved` 列成员。
- 已发布头的成员/组写入拒绝（写入协议扩展）。

**Independent Test**：AC#1（50/60/10 golden）、AC#2 择优、AC#3 方向不推导、AC#4 两种拒绝、AC#5 发布合计校验、AC#7 并列拒绝、AC#8 manual unresolved、AC#10 CHECK、AC#11 发布校验 + 组合外键、AC#12 跨期 primary 切片、AC#13 旧成员不可改、AC#15 概率域与定点合计。

### US3 路线本体（US-524 阶段 A/D 存储面，Priority: P1）

- `routing`（唯一键与 BOM 头对齐 `(parentRevisionId, bomType, orgId, alternativeNo)` + `valid_from` / `disabled_at`）、`routing_operation`（`(routingId, operationSeq)` 唯一、工作中心引用完整性、`operation_scrap` + `scrap_convention` 与 US-511 同记法）、`work_center`（编码 + 组织）。
- 头挂 `routing_id`（可空；挂了必须可解析——BOM 头加 `routingId` 列）。

**Independent Test**：AC#1 工序按序返回；AC#2 引用不存在的工作中心拒绝；AC#6 损耗与记法可读；AC#7 路线级生效/停用；AC#8/#10/#11（存储面）。

### US4 挂接与分摊（US-520 非 ECN，Priority: P1）

- 行发生项加 `operation_seq`（投料工序，可空）+ 分摊比例列（`operation_allocation`，[0,1]、9 位小数域，发布转移合计校验——复用 US-512 的定点整数机制）。
- 展开第 5 步的投料方向：从 `operation_seq`（含）至末工序。

**Independent Test**：分摊 6:4 合计校验、份额 60/40 无舍入漂移、投料方向（10 投料经 20 损耗、30 投料不经）。

### US5 七步第 5 步（US-511 B2，Priority: P1）

- `explodeBom` 第 5 步：`G'' = G'` 依次过 `scrap(·, op.scrap, op.convention)`，op 从投料工序（含）至末工序；`steps` 加第 5 步中间值；算法版本升 `'2'`（工作精度与步骤变化）。
- 工序损耗方向：10→20→30 只有 20 损耗 3%（加成制）→ 10 投料 103、20 投料 103、30 投料 100（AC#13）；AC#1 golden `220.8247422680412371134020618556701` → 需求行 221。

**Independent Test**：AC#1、AC#13 双 golden；旧用例（无路线）结果逐位不变（算法版本只在涉及工序损耗的行变化——无路线的行 steps 不加第 5 步）。

### US6 demo 阶段 B（US-525 AC#7~#9，Priority: P1）

- 种子 B 层追加：10kΩ 替代组（proportional 0.5/0.3/0.2，AC#7）、外壳下料头（consume 板材 + by_product 余料 + scrap_out 边角料，AC#8）、路线 10→20→30（20 损耗 3% 加成制）+ 分摊 6:4（AC#9）。
- 算式面板第 5 步显示每份经过的工序与累乘因子；替代组行显示分摊。
- e2e 三条 AC 用例；分阶段 golden：A 层路径值逐位不变（加层不扰动旧结构）。

## 约束与门禁

同前几步：TS strict / 零 ESLint 警告 / TSDoc；插件覆盖率 ≥ 80%；api-baseline 更新；双后端同断言（含直连 SQL 拒绝与发布校验）；affected full 全绿后提交。US-509 AC#4、US-511 B2 的 AC#1/#13 随本步关闭。

## 非目标

- 联产品（US-513 阶段 B，价值待证）；ECN 场景（US-512 AC#6/#9/#14、US-520 的 ECN 部分，随 US-515）；成本卷算（US-514）；排产/产能；费率与工时模型（US-524 阶段 B/C）。
