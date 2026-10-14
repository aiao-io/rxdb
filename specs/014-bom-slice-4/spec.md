# Feature Specification: epic-009 首轮切片第 4 步（US-507 阶段 C + US-525 阶段 A）

**Feature Branch**: `claude/bom-related-work-77235b`
**Created**: 2026-10-14
**Status**: Draft

**Input**: 第 1~3 步已交付（US-030 A/B/C、US-507 A/B、US-508 首轮、US-509 首轮、US-510 A、US-511 A/C/B1，affected 272/272 全绿）；按 [epic 切片表](../../../requirements/epics/epic-009-bom-domain-model.md#首轮可开工切片) 推进第 4 步（首轮切片的最后一步）。

- [US-507 BOM 图骨架](../../../requirements/stories/domain/US-507-bom-graph-skeleton.md) — 阶段 C：位号子表 + 发布转移的位号计数校验
- [US-525 BOM 端到端 demo](../../../requirements/stories/domain/US-525-bom-end-to-end-demo.md) — 阶段 A：种子、golden、Angular demo 与 playwright e2e

## 用户故事与优先级

### US1 位号子表（US-507 阶段 C，Priority: P1）

- `BomLineOccurrence` 加 `designator_managed`（boolean，default false）；新实体 `BomLineDesignator`（表 `bom_line_designator`，挂行发生项 1:N）：`(occurrenceId, designator)` 唯一；位号字符串按业务语义（如 `R1`、`C3`）不做内容校验。
- 已发布头协议扩展到子表：位号的 INSERT / UPDATE / DELETE 经 occurrence → line → header 判 `released` 即拒（与行/发生项同口径，US-507 AC#10 位号部分）；`occurrenceId` 创建后不可改（结构归属列，US-507 AC#13 位号部分）。
- 发布转移校验（`bom_header` 发布触发器追加）：`designator_managed = true` 的发生项，位号数必须等于名义 `qty`（`qty` 须为整数，逐字节判无小数点；计数经 `COUNT(*)`，整数 CAST 比较两后端一致）；违约整次转移回滚，错误同时给出位号数与 `qty`（AC#5）。草稿下可暂不合法（AC#5 ①）。
- 非 `designator_managed` 行不挂位号发布照常（AC#12）；需求量仍取自 `qty`，不由位号数推导（AC#4 与 US-511 七步的既有口径）。

**Independent Test**：managed 行挂 100 位号 qty=100 查询完整返回（AC#4）；草稿 99/100 可存、发布拒绝且错误含 39 与 100 两数（AC#5）；非 managed 不挂位号发布通过（AC#12）；已发布头下位号增删改与改指拒绝（AC#10/#13 位号部分）。

### US2 确定性种子与手写 golden（US-525 阶段 A 的数据底座，Priority: P1）

- `packages/rxdb-plugin-bom/src/testing/scooter-dataset.ts`：电动滑板车 `SC-100` 一份数据集，覆盖阶段 A 的硬形状——PCBA 下同一 10kΩ 电阻分属三条逻辑行（三组位号、qty 各不同，AC#2）；线束 `WH-01` D 版 `default_phantom = true`、头 1 m 基准（AC#4）；M3 螺钉经直连与虚拟件两条路径被使用（AC#6）；层级 ≥ 5；装配/组件损耗与定量行让算式面板七步都有值。
- **确定性**：每个 `id` 由业务键确定性派生、`createdAt`/`updatedAt` 取固定基准、日期字面值、`loadHistory` 批次号不含随机成分——两遍装载逐字节相同，与宿主当日无关（AC#1）。
- `scooter-golden.ts`：**全部手写**，不调用被测 kernel；每条路径（行发生项 id 序列）按阶段的七步中间值（P / P' / G / G' / D / 穿透 / 需求行取整值）与最终数量。

**Independent Test**：两遍 `loadDataset` 读出行逐字节相同（AC#1 的 vitest 面）；`explodeBom` 结果与 golden 位级一致（共享输入、独立 oracle）。

### US3 算式面板与 demo（US-525 阶段 A 的应用，Priority: P1）

- `apps/dev-rxdb-bom`（Angular）：展开树（选中行联动面板）+ 算式面板（七步中间值与单位、每步标注取值字段；第 5 步显示「工序损耗未交付」，**不是「按 0 计算」**）+ 评估日显式输入（不读系统时钟）+ 直连写入按钮（证存储层环约束，AC#5）+ `reset` / `seed` target。
- **七步中间值暴露**：`explodeBom` 的需求行与穿透节点各带 `steps`（`{ P, prime, G, net, demand, uom 链, phantom 判定与来源修订 }`），demo 只展示、不重算。
- `apps/dev-rxdb-bom-e2e`（playwright）：AC#1~#6 各至少一条用例；含「既有库重开」（先以非 BOM 实体建库、重开再装 BOM 插件并跑种子）。

**Independent Test**：AC#2 三行位号独立可见可编辑；AC#3 页面上 39/100 拒绝且不自动补位号不改 qty；AC#4 无 WH-01 需求行、面板第 6/7 步显示换算与 `COALESCE(phantom_override, default_phantom)` 取值与来源修订号；AC#5 直连写入与表单两条路径同一存储层错误码；AC#6 where-used 全部父件与路径（含虚拟件路径）、每跳可点回。

## 功能需求

1. **位号是发生项的 1:N 子表**：位号引用发生项 ID（描述「那一段时间的那组值」）；随发生项删除级联（CASCADE）。
2. **种子落插件不落 app**：`packages/rxdb-plugin-bom/src/testing/`，vitest 与 demo 共用同一份；装载顺序固定（阶段 A 单层）。
3. **分阶段 golden 的骨架**：golden 结构按阶段组织（本步只有阶段 A 的层），不受新层影响的路径各阶段值逐位相同（为 B~F 预留结构）。
4. **算式面板是展示不是重算**：七步中间值由 `explodeBom` 返回；面板与单测的数字来自同一组输入。
5. **demo 单端即可**（US-522 才要三端）：`apps/dev-rxdb-bom` Angular；`pnpm nx serve dev-rxdb-bom` 起在 `127.0.0.1:4310`。

## 约束与门禁

同前几步：TS strict / 零 ESLint 警告 / TSDoc；插件包覆盖率 ≥ 80%；api-baseline 更新；双后端同断言（位号部分）；affected full（含两个新 app 的 lint/test/build/e2e）全绿后提交。demo/e2e 打上与既有 demo 一致的 tag。

## 非目标

- 三框架绑定（US-522）；替代组/多输出/工序（阶段 B）；ECN（阶段 C）；成本（阶段 D）；实例 BOM（阶段 F）。
- 位号内容的格式校验（只按字符串存，业务格式留给使用方）。
