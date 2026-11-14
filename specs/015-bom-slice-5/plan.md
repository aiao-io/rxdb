# Implementation Plan: epic-009 首轮切片第 5 步

**Branch**: `claude/bom-related-work-77235b` | **Created**: 2026-10-14

## 技术上下文（第 1~4 步已就位）

- 插件：实体与双后端触发器（含发布转移聚合校验的位号/阶梯先例）、`explodeBom` 七步（1~4、6、7）、`resolve/` 解析与展开、`quantity/` kernel
- 发布转移校验机制（`bom_header` 的 draft→released 触发器、SQLite RAISE 顶层形态、PG 查违规行进变量）
- `loadHistory` 装载通道 + SC-100 种子/golden 分层结构 + demo/e2e 全链路

## 设计

### 1. flow_direction（US-513 阶段 A）

- 实体：`BomLineOccurrence.flowDirection`（enum `consume/by_product/scrap_out`，default `consume`）
- 判环触发器（两后端）：边子查询加 `AND occ."flowDirection" = 'consume'`（并集图缩到 consume 子图，US-509 AC#4）；US-509 故事行「列落地时重新生成触发器」——本步生成
- `by_product` 子件 ≠ 头父件：发布转移校验（与位号计数同入口）或保存期触发器——**发布转移**（跨行聚合类：子件与父件关系在头级可见）——SQL：by_product 行的 childItemId = 头的 parentRevision 的 itemId → 拒绝
- consume 负用量：格式触发器已拒负值（首期非负域）✓ 自动满足 AC#5
- 展开（explosion.ts）：行按 flowDirection 分流——
  - consume：现有七步
  - by_product：`q = qty（或公式）`，`产出 = is_fixed ? q : q × P' / base_qty`，单位行 UoM（不换算到库存？副产量单位 = 行 UoM ✓ 不进需求行）
  - scrap_out：同 by_product 的缩放规则（产出量）
  - 产出量进 `ExplosionResult.outputs`（`{ path, itemId, direction, qty, uom }`）；「无投入」= 头有行但无 consume 行 → 抛 BomQuantityError（AC#4）
- demo 的 by_product 展示随 US6。

### 2. 替代组（US-512 非 ECN）

- 实体 `BomSubstituteGroup`：`code`、`strategy`（enum）、`allow_mix`（bool）；关系 → BomHeader；(headerId, code) 唯一
- `BomLineOccurrence` 加：`substituteGroupId`（nullable FK）、`substituteRole`（enum primary/substitute，nullable）、`substitutePriority`（integer nullable）、`usageProbability`（string nullable，[0,1]、≤9 位小数——保存期触发器 + 发布合计定点整数）、`equivQty`（string nullable）
- 单行 CHECK：`strategy` 在组上——`proportional × !allow_mix` 的保存即拒需要跨表（组 + 行？AC#10 是「保存组」时的单行 CHECK——组行的 strategy 与 allow_mix 在同一行！组实体上 CHECK：`NOT (strategy = 'proportional' AND allow_mix = false)` ✓ 单行
- 组合外键（AC#11 ②）：成员的 (substituteGroupId → group) 与 (lineId → line → headerId) 一致性——组合 FK `(substituteGroupId, headerId)`？行发生项的 header 不直接可达（经 line）。设计：substituteGroup 有 headerId；成员行经 line.headerId 必须 = 组的 headerId——组合外键 (lineId, substituteGroupId) 引 (id, headerId)？——line 表有 headerId ✓，可建组合 FK (substituteGroupId, <header via line>) 不可行（跨表）。**发布转移校验**兜底（AC#11 ② 说「组合外键即拒，走不到发布」——需要 FK 级。SQLite 组合 FK 可以跨两列但两列都要在本表——行发生项没有 headerId 列…… 简化：保存期触发器（BEFORE INSERT/UPDATE 成员行）：组的 headerId 必须 = line.headerId → 拒绝）。用触发器实现「组合外键」语义（两后端）。
- 发布转移切片校验（bom_header 发布触发器扩展，SQL）：组内成员按生效域切片——SQL 里切片计算复杂。实现策略：**SQL 生成每对「同组同切片」的冲突判定**——取组内成员两两比较（a, b 同组、生效域相交）：
  - primary 数：`role='primary'` 成员两两相交 → 拒绝（每切片恰好一个 primary 的等价判定：任意两个 primary 生效域相交即违约）✓ 简单！
  - priority 并列：同组两成员 priority 相等且相交 → 拒绝（strategy=priority 时）
  - proportional 合计：切片内合计 = 1——合计校验不能两两比。**简化近似**：同一生效域组（完全相同 from/to 的成员）合计=1；不同区间相交的成员组——严格切片需要端点。首轮近似：**取「组内所有成员的生效域端点集」在 SQL 里不可行**——改用「两两相交检查 + 整组合计」？——不满足 AC#6 的切片语义（ECN 场景才需要精确切片；非 ECN 的 AC#5/#15 场景成员同区间）。**设计决定**：非 ECN 场景（无 ecn 列变更）成员生效域同端点（种子/测试如此）；切片精确校验在 US-515 的「转换后运行投影」入口实现（随 US-515）。本步校验 = 「同组同生效域成员合计 = 1 / 恰好一个 primary / priority 不并列」（生效域按组内成员分桶：SQL GROUP BY (tierGroupNo 同款 from/to)）。文档写明这个边界。
  - 定点整数合计：`substr(s || '000000000', 3, 9)` 转整数求和（US-511 技术笔记的规则）——SQLite `CAST(substr(...) AS INTEGER)`、PG `substr(...)::integer`。
- 展开分流（explosion.ts）：行的 substituteGroupId 非空 → 按组 strategy 分流；ResolutionContext 加 `substituteSelections?: Record<groupCode, { allocation: Record<memberKey, string> | memberKey }>` 与 `substituteAvailabilities?: Record<groupCode, { memberKey: string; value: string; uom: string }[]>`——类型设计与 US-512 原文对齐（manual 的选择/分配、priority 的可用量上限）。
  - proportional：primary 需求 D（七步第 3 步的 G，未过组件损耗？——分摊发生在第 3 步后：对每成员按概率分摊 primary 需求，各乘 equiv_qty 后走各自的第 4 步（组件损耗）→ 第 6/7 步。primary 成员自身 = 概率 × primary 需求 × 1（equiv）。
  - priority：取有效成员中 substitutePriority 最高者（primary 视为最高？——AC#2「只取 as_of_date 有效成员中 substitute_priority 最高者」——primary 也是成员（role=primary），其 priority？——primary 不设 substitutePriority（主件不是替代件）。择优集 = substitutes；primary 需求全部给最高者（primary 不产出？——AC#2 的操作「展开」预期「只取最高者」——primary 不承担。AC#1 的 proportional 里 primary 承担 0.5。priority 策略下 primary 不承担、最高者承担全部（等价 primary 概率 0）。实现：priority → 只取最高 substitute，其承担 primary 需求 × equiv_qty；allow_mix=true 且可用量上限不足时按序补足（下一 priority）——本步实现 allow_mix=false 的拒绝（AC#4 ①）+ true 的补足。
  - manual：无选择 → result.unresolved 列成员（复用 manifest.unresolved？——ExpansionManifest 没有 unresolved 字段——ExplosionResult 加 `unresolved: UnresolvedAlternative[]`？——设计：`ExplosionResult.unresolved: { groupCode, candidates }[]`；assertCompleteResolution 拒）。

### 3. 路线与工序（US-524 A/D + US-520 非 ECN）

- 实体 `WorkCenter`（code + orgId，(code, orgId) 唯一）、`Routing`（parentRevisionId/bomType/orgId/alternativeNo 唯一 + validFrom + disabledAt nullable）、`RoutingOperation`（routingId + operationSeq 唯一 + description nullable + workCenterId FK + operationScrap + scrapConvention（D））
- `BomHeader.routingId`（nullable FK → Routing，无 onDelete 动作默认 RESTRICT）；`BomLineOccurrence.operationSeq`（integer nullable）+ `operationAllocation`（string nullable，[0,1] 9 位小数）
- 发布转移校验：头挂 routing 时，行的 operationSeq 必须在路由的工序序集内（挂了必须可解析）；分摊比例合计=1（定点整数）——同替代组机制
- 展开第 5 步：行有 operationSeq → 从该工序（含）至末工序的 operationScrap 依次累乘（convention 各自）；分摊展示：需求按 operationAllocation 分到投料工序（第 5 步的每份经过的工序与累乘因子进 steps）
- 算法版本升 `'2'`（步骤增加）；无路线/无 operationSeq 的行 steps 第 5 步 = null 且结果逐位不变

### 4. 测试矩阵

| 面             | 位置                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------ |
| flow_direction | `bom-flow.spec.ts`（双后端：AC#1/#3/#4/#5/#6/#8/#9/#10/#11）                                     |
| 替代组         | `bom-substitute.spec.ts`（双后端：AC#1~#5/#7/#8/#10~#13/#15）                                    |
| 路线/工序      | `bom-routing.spec.ts`（双后端：US-524 AC#1/#2/#6/#7/#8/#10/#11 + US-520 分摊 + US-511 AC#1/#13） |
| demo B 层      | bom-scooter.spec 扩展 + e2e 三条                                                                 |

### 5. 门禁与回写

api-baseline、覆盖率、affected full、故事回写（六条故事 + US-509 AC#4）、specs/015 quickstart。
