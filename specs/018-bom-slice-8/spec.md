# Feature Specification: epic-009 首轮切片第 8 步（demo UX 产品化 + US-517 + US-518 + US-519 + US-521 + US-525 阶段 E）

**Feature Branch**: `claude/bom-related-work-77235b`
**Created**: 2026-10-16
**Status**: Implemented

**Input**: 首轮切片第 1~7 步已交付（建图 → 视图 → 展开 → 反查 → 数量 → 时间轴 → 双图与卷算，affected 全绿）；本步两件事：① 把 `dev-rxdb-bom` 从「验收面板」升级为**产品级应用**（参照 `dev-rxdb-angular` 的壳、导航、视觉与交互质量）；② 按 [epic 切片表](../../requirements/epics/epic-009-bom-domain-model.md#首轮可开工切片) 第 5 步与 [US-525 阶段 E](../../requirements/stories/domain/US-525-bom-end-to-end-demo.md) 的引导，交付配置选择、序列/批次有效性、扩展属性与导入导出。

- [US-517 可配置销售 BOM](../../requirements/stories/domain/US-517-configurable-sales-bom.md) — 全部 AC#1~#7
- [US-518 序列 / 批次有效性](../../requirements/stories/domain/US-518-bom-unit-lot-effectivity.md) — 全部 AC#1~#10
- [US-519 扩展属性](../../requirements/stories/domain/US-519-bom-extension-attributes.md) — AC#1/#2/#4/#5/#6（AC#3/#7 等 US-030 阶段 D）
- [US-521 ERP/MRP 导出与导入](../../requirements/stories/domain/US-521-bom-erp-mrp-integration.md) — 全部 AC#1~#15
- [US-525 BOM 端到端 demo](../../requirements/stories/domain/US-525-bom-end-to-end-demo.md) — 阶段 E（AC#17~#20）

## 用户故事与优先级

### US0 demo 应用产品化（UX 升级，Priority: P0）

- 应用壳：侧边栏分区导航（概览 / 展开 / 时间轴 / 双图映射 / 成本卷算 / 反查）+ 顶栏（应用名、库状态、重置入口）+ 内容区；参照 `dev-rxdb-angular` 的壳与 `dev-rxdb-angular` 页面质量（daisyUI 组件面、图标、卡片布局、加载/空/错误态）。
- 现有「验收面板」单页按域拆成六页：概览（种子行数/批次/物料清单）、展开（BOM 树 + 七步算式面板）、时间轴（ECN 面板）、双图映射（双图 + 覆盖率/缺口）、成本卷算（逐层明细 + 缺失演示）、反查（where-used）。
- 交互标准：每个动作有加载态（按钮禁用 + 进度）、结果区有数据态/空态/错误态；状态提示（成功/失败 toast 或内联）；表格与树有可读的层级与对齐；响应式布局。
- 既有 17 条 e2e 的 `data-testid` 与行为断言在新 UI 下全部保持绿（验收面不缩水）。

**Independent Test**：e2e 1~17 条全绿 + 新 UI 走查（六页可达、加载态可见、错误态可读）。

### US1 可配置销售 BOM（US-517 全部 AC，Priority: P1）

- `config_char`（特征，`required` 必选标记）+ `config_char_value`（选项值）+ `config_condition`（选择条件，最小语法：`特征 = 值` / `!=` / `in`，AND/OR/NOT 与括号；持久化记 `condition_grammar_version`）+ `config_constraint`（`exclude` 互斥 / `require` 蕴含，两侧各一条选择条件）。
- 行发生项加 `selection_condition_id`；配置输入是 `ResolutionContext` 的扩展字段，不另开入参；解析过滤出入选行集，manifest 记录所用配置。
- 配置不完整（`required` 特征未赋值）或冲突时明确报错，不静默产出部分结构（AC#3）。
- 保存期校验：条件不合语法或引用不存在的特征/值即拒绝，点名位置与未知标识（AC#5）；约束两侧同样校验。
- 环约束不因配置放宽（AC#6 沿用 US-509 并集保守政策）；同一输入两次解析结果与 manifest 逐字相同（AC#7）。
- **不做约束求解器**（只定契约，朴素求值覆盖 AC#1~#5 场景）。

**Independent Test**：US-517 AC#1~#7（双后端同断言）。

### US2 序列 / 批次有效性（US-518 全部 AC，Priority: P1）

- 行发生项加 `unit_from` / `unit_to`（序列闭区间，整数）与 `lot_codes`（批次集合）；有效域 = 日期 × 序列 × 批次三维的积，三维同时满足才入选。
- 重叠约束是**有效域交集**：同一逻辑行两个发生项只有三维同时相交才拒绝（US-508 AC#2 的日期排他是特例）；`unit_from > unit_to` 保存期 CHECK 拒绝。
- 序列 / 批次扩入 `ResolutionContext`；不带 `unit` 的解析：多候选时标 `unresolved` 并列出候选，MRP 导出与成本卷算拒绝。
- `lot_codes` 批次精确匹配，NULL = 全部批次。

**Independent Test**：US-518 AC#1~#10（双后端同断言；重叠判定按三维交集的矩阵用例）。

### US3 扩展属性（US-519 AC#1/#2/#4/#5/#6，Priority: P1）

- `item` / `bom_header` / `bom_line_occurrence` 各带 `ext`（双后端均沿用引擎 JSON 文本列，PGlite 查询显式转 jsonb）；逻辑行不带（行级值随时间变化，落在发生项层）。
- `attr_def` 元数据表：`code` / `data_type` / `required` / `enum_values` / `applies_to` / `unit`；`applies_to` = `item` / `bom_header` / `bom_line_occurrence`。
- 写入期按 `attr_def` 校验（非法枚举值拒绝并给合法取值、作用域越界拒绝、必填缺失在新写入/完整更新时拒绝、局部更新不触碰扩展属性不强制补齐）。
- 查询语义契约：`eq` / `ne` / `in` / `lt` / `lte` / `gt` / `gte` / `exists`；缺字段与显式 null 等价、`exists` 对二者都为假、其余比较对缺字段一律不匹配（含 `ne`）；类型不符即拒绝查询；SQLite 与 PGlite 同一过滤同一结果。
- **不做**：热字段提升与 GIN/表达式索引（AC#3/#7，等 US-030 阶段 D）。

**Independent Test**：US-519 AC#1/#2/#4/#5/#6（双后端逐行一致）。

### US4 ERP/MRP 导出与导入（US-521 全部 AC，Priority: P1）

- 导出契约：展开结果与主数据稳定形状（进 api-baseline）；附带 resolution manifest；十进制字段是字符串；`truncated`/`unresolved` 即拒绝；同快照读取；按组织隔离。
- 批量导入 = 整批原子提交到草稿：任一行失败整批回滚，返回**全部**失败行的逐行诊断（确定性：诊断行序与输入行序无关）；自然键重复、引用缺失、环路（含行序无关的成对环）都逐行点名；通过后由调用方显式发布（发布走 US-507 校验，含位号计数）。
- 记录类型：物料、修订、头、逻辑行、发生项 + 已落地子表（位号、替代组与成员、工序分摊）；十进制字段必须是字符串（JSON number 拒绝）；ECN/loadHistory/其余主数据首期不经本契约导入（引用不到按依赖缺失失败）。

**Independent Test**：US-521 AC#1~#15（行序无关性用两种行序各跑一遍断言）。

### US5 demo 阶段 E（US-525 AC#17~#20，Priority: P1）

- 种子 E 层：物料 B-01 的 `ext` 声明必填枚举「rohs」（`attr_def` 随种子入库）；同一逻辑行旧件 `unit_to = 136`、新件 `unit_from = 137`（日期相同）；特征「颜色」红/蓝 + 某行挂选择条件「颜色 = 红」+ 约束「红与蓝互斥」；导出导入演示数据。
- 页面：扩展属性面板（写非法值/缺必填报错 + `eq` 过滤）；评估日 + `unit` 输入展开（清空 `unit` 标未解析列候选）；配置选择面板（选红入选 / 红蓝都选冲突点名 / 不选必填报配置不完整）；导出导入按钮（导出 JSON 含 manifest 与十进制字符串；导入环/重复键/JSON number 文件整批回滚 + 逐行诊断；修好重导发布）。
- e2e 第 18~21 条（AC#17~#20）。

## 约束与门禁

同前几步：TS strict / 零 ESLint 警告 / TSDoc；插件覆盖率 ≥ 80%；api-baseline 更新（新实体 + 导出/导入契约 + ResolutionContext 扩展）；双后端同断言；`audit:*` 五个门禁与 format:check 全仓绿；affected full 全绿后提交。US-517/518/519/521 的 AC 关闭以 US-525 阶段 E 的消费方用例绿为准（联合验证）。

## 非目标

- 约束求解器（外挂契约之外）；变式定价与报价；产品级配置界面（演示级面板在 demo 内）
- 序列号生成与分配；实例化装机结构（→ US-523 阶段 F）
- 热字段提升、GIN/表达式索引（US-519 AC#3/#7，等 US-030 阶段 D）
- ECN/loadHistory/路线本体/`bom_map`/配置模型经导入契约（首期引用式）
