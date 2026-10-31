# Implementation Plan: epic-009 首轮切片第 8 步（US-517 + US-518 + US-519 + US-521 + US-525 阶段 E）

**Branch**: `claude/bom-related-work-77235b` | **Spec**: [spec.md](./spec.md)

## 摘要

交付配置模型、序列/批次有效性、扩展属性与导入导出：三条故事（US-517/518/519）都往 `ResolutionContext` 扩输入、往解析过滤面加维度；US-521 在展开结果与主数据上定导出契约、在 draft 头上做整批原子导入；US-525 阶段 E 用种子 E 层 + 面板 + e2e 验收全部。

## 技术上下文（既有先例）

- `ResolutionContext`（US-508）已是显式入参并进 manifest——三个新维度（配置输入、`unit`、`lot`）都走同一扩展，不另开入参。
- 行发生项区间排他（US-030 exclusions）与「保存期校验 + 触发器兜底」双后端 DDL 模式已有——序列/批次重叠判定是三维交集的触发器/TS 校验，复刻 occurrence_no_overlap 的模式。
- 选择条件的最小语法与公式语法（US-511 `formula_grammar_version`）同一模式：解析器 + 版本号 + 保存期校验。
- 批量导入的「整批原子 + 逐行诊断 + 行序无关」与 loadHistory 的 open 批次事务、ECN 写入协议矩阵已有大量可复用面；导入走 draft 头 + 显式发布（发布转移校验含位号计数）。
- 十进制值合同（US-511）覆盖导出导入的字符串化要求；api-baseline 自更新机制覆盖导出契约。

## 关键设计决策

### D1. ResolutionContext 扩展（US-517/518 共用）

- 加 `configSelection?: Record<string, string[]>`（特征 code → 选中值集合）、`unit?: number`、`lot?: string`；进 manifest（解析依据完整）。
- 解析过滤顺序：日期 → 序列 → 批次 → 配置条件（都在行发生项级）；任何维度不满足即落选。
- `unresolved` 语义扩展：同逻辑行多候选按序列区分且无 `unit` 输入时，标 `unresolved` 并列出候选（含各自的 unit 区间）。

### D2. 配置模型实体与选择条件解析器（US-517）

- 四实体：`BomConfigChar`（`(orgId, code)` 唯一 + `required`）、`BomConfigCharValue`（`(charId, value)` 唯一）、`BomConfigCondition`（表达式文本 + `grammarVersion` + `orgId`）、`BomConfigConstraint`（`(orgId, code)` 唯一 + `kind` + 左右条件 id）。
- 表达式解析器（无正则，手写递归下降——十进制入口的正则教训）：原子谓词 `特征 = 值` / `!=` / `in (值, …)`，AND/OR/NOT/括号；AST 求值对 `configSelection` 判定真假。
- 保存期校验：解析失败或未知标识 → 拒绝并点名位置/标识；约束两侧同校验。
- 行发生项加 `selectionConditionId`（nullable，无条件 = 恒真）；`bom_line_occurrence` 表加列 + 触发器无新增协议（新列随 schema 迁移）。

### D3. 序列/批次三维有效域（US-518）

- `bom_line_occurrence` 加 `unitFrom` / `unitTo`（整数，`unitFrom > unitTo` 保存期 CHECK 拒绝）与 `lotCodes`（JSON 数组文本，NULL = 全部批次）。
- 重叠判定：三维同时相交才拒绝——日期段相交（US-508 既有谓词）× 序列闭区间相交 × 批次集合相交（NULL 与任何集合相交）；错误消息给出相交的三段。
- 触发器：SQLite BEFORE INSERT/UPDATE 谓词 + PGlite plpgsql（同 occurrence_no_overlap 模式）；「同逻辑行」按 `lineId` 分组、排除自身。

### D4. 扩展属性（US-519）

- `ext` 列：`bom_item` / `bom_header` / `bom_line_occurrence` 各加一列（SQLite/PGlite 均为 JSON 文本）；入口序列化/解析，PGlite 查询显式转 jsonb（无 JSON 专用属性类型的引擎面）。
- `BomAttrDef` 实体：`(code, appliesTo)` 唯一（同一 code 可跨作用域，AC#6）+ `dataType` / `required` / `enumValues` / `unit`。
- 写入期校验在 TS 层（BomRepository 的 create/update 面）：非法枚举值、作用域越界、必填缺失（新写入与完整更新）都拒绝并点名。
- 查询面 `filterByAttr(adapter, scope, filters)`（自动读取 `attr_def`）：按 `attr_def.data_type` 比较；缺字段与 null 等价；`exists` 对二者为假；其余比较对缺字段不匹配（含 `ne`）；类型不符拒绝。SQLite 用 JSON 函数（json_extract）、PGlite 用 jsonb 操作符——同一过滤同一结果（conformance 用例）。

### D5. 导出导入契约（US-521）

- 导出 `exportBom(context, root)`：展开（含 manifest）+ 涉及主数据快照 → 稳定 JSON 形状（version 字段 + manifest + 各层记录数组）；十进制字段规范串；`truncated`/`unresolved` 拒绝。
- 导入 `importBomDraft(payload)`：单事务建 draft 修订 + 头 + 行 + 发生项 + 子表（位号/替代组/分摊）；逐行校验收集**全部**失败（自然键重复、引用缺失、环、十进制非字符串、依赖缺失）；任一行失败整批回滚；诊断按自然键排序（行序无关）；成功后头保持 draft，调用方显式发布。
- 环检测：导入层复用 US-509 的并集判环（导入的边加入已有图一并判）；诊断确定性与行序无关（AC#6/#10/#12/#13）。

### D6. demo 阶段 E（US-525 AC#17~#20）

- 种子 E 层：B-01 的 `attr_def`（rohs 必填枚举）+ B-01 的 `ext` 演示；SC-100 经 ECN-2026-017 在 2026-10-16 接入 UNIT-DEMO 子装配（同一逻辑行旧/新件序列区间 136/137）、CONFIG-DEMO 配置子装配与 B-01；特征「颜色」红/蓝 + 条件「颜色=红」行 + 互斥约束；导出导入演示复用现有树。
- 页面四块：扩展属性面板（写值/过滤）、序列批次展开（`unit` 输入）、配置选择面板（选择/冲突/缺参）、导出导入面板（导出下载 + 导入文件 + 诊断列表）。
- e2e 第 18~21 条对应 AC#17~#20。

## 风险与对策

- **ResolutionContext 扩展的回归面**：US-508/511/514/516 全在解析链上——扩展字段全部 nullable 且默认「无约束」，既有用例逐位不变（golden 各阶段不受扰动是断言本身）。
- **三维重叠触发器与既有日期排他**：日期排他是三维特例——实现为同一触发器的交集判定，AC#5 断言交集消息；注意 SQLite 三值逻辑（NULL 维度的 IS NULL 处理）。
- **选择条件解析器的语法版本**：与公式语法（US-511）同模式——版本号持久化、解析器升级不改旧条件含义；解析器无正则（CodeQL ReDoS 教训）。
- **导入的行序无关诊断**：诊断收集后按自然键排序输出——两种行序各跑一遍断言（AC#6/#10/#12/#13）。

## 任务分解（tasks.md 概要）

T001-T003 文档、共享实体与触发器打底；T004-T008 六页应用与配置、有效性、属性、导入导出并行实现；T009-T012 集成、整机 E 层种子与 21 条 e2e；T013-T016 门禁、故事回写与提交；T017-T020 收敛审计发现的解析、仓储、导入导出及消费面缺口。

## Constitution Check 与验证方法

- 质量：strict 编译、ESLint 零警告、公共导出 TSDoc；领域约束用单一保存/解析校验入口。
- 测试：新增双后端真实写入与解析回归先红，再补实现；完整插件覆盖率四项 ≥ 80%；演示 21 条端到端用例。
- 体验：本切片演示按US-525为单端Angular；US-522三框架绑定由后续spec020实现并独立验收，不回算为第8步范围。六页及新增面板具备加载、空、错误状态与有标签的原生输入。
- 性能：在本地 Chromium 记录首屏；Node/PGlite 在连接并预热后测量解析/展开/导出/单条保存与千行导入耗时。单查询 < 16ms、单记录操作 < 100ms；千行导入按批量事务单独报告耗时；依赖构建日志记录包 gzip 体积。测量结果写入 quickstart，超预算明确记录原因。

## 本轮红阶段记录（2026-10-16）

新增 SQLite/PGlite 真实回归已失败：单层解析未消费配置/序列，序列反向区间未拒绝，属性保存校验未触发，领域导入导出模块不存在；E 种子旧件/新件使用同一物料。后续实现复用这些失败回归验证。

## 收口实现决策

- 扩展属性的物理列沿用 RxDB 当前字符串属性映射：两端均保存 JSON 文本，PGlite 查询显式转换为 `jsonb` 后比较；`filterByAttr` 根据元数据确定类型。此处实现 jsonb 查询语义，不为 BOM 改动整个存储引擎的属性类型映射。
- 后端 DDL 在插件连接阶段动态加载，公共 API 与 `connect()` 的完成语义保持不变。包体积区分入口静态依赖与连接后累计下载，不能只报主文件或把分块当成减少总字节。
- 导入拒绝 ECN/history 旁路及对已发布头的成员写入；PGlite 在事务开始将外键检查改为 immediate，确保保存点能收集每一行的失败。
- 导出已选替代组时同时保留当前有效的所有候选与主件，需求数组仍使用调用方选择后的数量结果；导入诊断将本批随机 ID 替换为稳定自然键与源标识。

## 门禁必要修复

全量 e2e 暴露 React QueryBuilder 在 StrictMode 清理并重建服务后跳过同引用 initialQuery 的缺陷：列表仍标记筛选，重开的面板却没有条件。沿用 `apps/dev-rxdb-react-e2e/src/entity-model.spec.ts`「筛选弹层按条件重查，重置后恢复全量」作为既有失败回归，清理服务时同步清除初值引用标记，不改变 API。复验该回归、模型包测试与整个 React e2e 套件。

网站首页生产 SSR 暴露 `code-editor-react` 构建产物错误包含开发版 `jsxDEV`：Nx 在进程内推断 Vite 配置时留下 `NODE_ENV=development`，后续构建继承后生成开发调用，生产 React 中该函数不可用。库配置在 `command === 'build'` 时显式选择生产 JSX；沿用原失败的 `website:site-build` 和完整 `website:build` 回归，不覆盖调用环境、不绕过缓存或 SSG。
