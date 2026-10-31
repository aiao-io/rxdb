# Quickstart: epic-009 首轮切片第 5 步（验证记录）

**日期**：2026-10-14 | **分支**：`claude/bom-related-work-77235b`

## 交付物

| 项                                | 落点                                                                                                                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-513 阶段 A 多输出物料流        | `flow_direction` 三值列、判环/可达性只认 consume（US-509 AC#4 同批）、by_product 子件≠头父件发布校验、展开反向流（副产按 P' 缩放、scrap_out 进产出列表、「无投入」拒绝、自回流分列）    |
| US-512 非 ECN 替代组              | `bom_substitute_group` 实体 + 成员列（概率 9 位小数域）、发布转移切片聚合校验（定点整数 10⁹ 合计、错误还原规范串）、展开分流（proportional/priority/manual + `ResolutionContext` 扩展） |
| US-524 阶段 A（除 AC#7 展开面）/D | `work_center` / `routing`（唯一键与 BOM 头对齐）/ `routing_operation`（工序损耗与各自 convention）、头挂 `routing_id` FK                                                                |
| US-520 非 ECN 挂接与分摊          | 行 `operation_seq`（保存期工序校验）+ `bom_line_operation_split` 子表（互斥 AC#6、结构列 AC#9）、发布合计校验                                                                           |
| US-511 B2 第 5 步                 | 投料工序（含）至末工序逐道累乘、分摊每份额各自起算；`steps.operationScrapped`；算法版本 `'2'`；AC#1 的 34 位 golden `220.8247422680412371134020618556701` → 221 逐字断言                |
| US-525 阶段 B                     | 种子 B 层（外壳下料 / 替代组 COVER-ASSY / 路线 PROCESS-01）+ 手写 golden（A 层路径逐位不变）+ 面板第 5 步 + e2e 三条 AC 用例（共 10 条）                                                |

## 测试与门禁（截至当日）

- `rxdb-plugin-bom`:test — 278/278 通过（19 个 spec）；覆盖率 95.11% 语句 / 85.49% 分支 / 94.58% 函数 / 96.3% 行
- `dev-rxdb-bom-e2e` — 10/10 全绿（A/B 两阶段 AC）；demo/e2e lint 零警告
- `audit:api-surface` / `audit:requirements` — 通过（100 条故事，13 In Progress）
- affected full（279 任务）— **279/279 全绿**（第一轮挂 rxdb-plugin-bom 两个旧 fixture 与新增互斥规则冲突——修 fixture 后第二轮全绿；3 个本机负载 flaky 照旧单跑即绿）

## 排障记录（第 5 步踩过的坑）

1. **判环触发器过滤 flow_direction 要三处齐改**：存储边子查询、UNION ALL 的 NEW 边、以及「非 consume 的 NEW 行整体跳过」（自环根判定会命中 by_product 自边）——漏一处反向对就误报环。
2. **概率/分摊合计的定点整数还原**：10⁹ 整数还原规范串要分整数段与小数段（`1.01` 直接拼 `'0.' + right(9)` 会变成 `0.010000000`）。
3. **US-520 AC#6 互斥与种子的冲突**：分摊行的行不能同时挂 `operation_seq`——种子 B 层的 PROCESS-01 分摊去掉 operationSeq；展开的分摊分支条件要覆盖「无 operationSeq 但有 splits」的行。
4. **Angular @for 迭代 Map**：`itemNos()` 直接迭代得到 entries（数组），`.keys()` 是 id（Map 键为 id），应迭代 `.values()`。
5. **eslint member-ordering**：根配置顺序 = #private 字段 → private 字段 → protected → public 字段 → 构造 → 方法——页面组件的 `ngOnInit` 不能在信号字段之前。
6. **演示头的唯一键与自环**：种子已发布头占着 `(revision, type, org, alt)` 唯一键，演示头必须挂新建 draft 修订；替代组演示头挂 R10K 修订会因成员行 consume R10K 构成自环——挂 COVER-ASSY。
7. **PGlite 的 FK 类型匹配**：`routingId` 列声明 string 引 uuid 主键 → `foreign key constraint cannot be implemented`——列类型必须 uuid。
