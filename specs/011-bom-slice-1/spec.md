# Feature Specification: epic-009 首轮切片第 1 步（US-030 A/B/C + US-507 A/B）

**Feature Branch**: `claude/bom-related-work-77235b`
**Created**: 2026-10-13
**Status**: Approved for implementation
**Input**: owner 解锁 epic-009（2026-10-12），第 0 步样本与决策复核已就位；按 [epic 首轮可开工切片](../../../requirements/epics/epic-009-bom-domain-model.md#首轮可开工切片) 推进第 1 步。

权威规格见各故事文件，本 spec 是第 1 步的**实现范围编译**，冲突以故事为准：

- [US-030 实体元数据层的声明式存储约束](../../../requirements/stories/core/US-030-declarative-storage-constraints.md) — 阶段 A / B / C
- [US-507 BOM 图骨架](../../../requirements/stories/domain/US-507-bom-graph-skeleton.md) — 阶段 A / B
- [US-511 展开数量正确性](../../../requirements/stories/domain/US-511-bom-quantity-semantics.md) — 十进制值合同的存储/回读与入口规范化段（AC#22 ① 的存储与回读段、②、AC#23）
- [epic-009 切片表第 1 步](../../../requirements/epics/epic-009-bom-domain-model.md#首轮可开工切片) — 交付清单与「可以验收」子集
- [roadmap 批次 4](../../../requirements/roadmap.md#批次-4bom-首轮切片epic-009-已解锁) — Tauri 升 rusqlite ≥ 0.33 随第 1 步同 PR

## User Scenarios & Testing

### User Story 1 - 元数据声明 CHECK（US-030 阶段 A，Priority: P1）

实体模型作者在 `@Entity` 元数据里声明属性级 / 实体级 CHECK（含字段对字段 `ref`），业务不变量落在存储层。SQLite 宿主版本 < 3.47.0 时 `init()` 直接失败。

**Independent Test**：两后端均拒绝越界写入且错误类一致；字段对字段比较遵守 SQL 三值逻辑；白名单外的规则在建元数据期被拒；已有表与声明不一致时 `init()` 抛漂移错误、不自动补建。

**Acceptance Scenarios**：US-030 AC#1 / #2 / #7 / #8 / #9 / #10 / #11 / #15 / #16 / #17。

### User Story 2 - 条件唯一索引（US-030 阶段 B，Priority: P1）

`EntityIndexMetadataOptions.where` 声明部分唯一索引，两后端一致；带 `where` 的唯一索引进漂移比对、`reconcileEntityIndexes` 补建时跳过。

**Independent Test**：不满足条件的重复行不被唯一约束误拒；满足条件的重复行被拒；漂移检查覆盖 `uq_` 对象。

**Acceptance Scenarios**：US-030 AC#3，AC#6 / #10 的条件唯一部分。

### User Story 3 - 区间排他（US-030 阶段 C，Priority: P1）

`EntityMetadataOptions.exclusions` 声明「相等列 + 区间维」（时间 / 整数，`[)` / `[]`，NULL 端点无界）。PG 走 `EXCLUDE USING gist`（加载 `btree_gist`），SQLite 走 INSERT / UPDATE 双触发器，错误语义统一为 `RxDBExclusionViolationError`。「截止旧行 + 新开一行」的分支重放不被误拒。

**Independent Test**：重叠区间两后端均拒绝且报出冲突区间；UPDATE 扩区间同样设防、自身扩区间不误拒；相邻区间放行；两维同时相交才冲突；重放路径（undo/redo）通过。

**Acceptance Scenarios**：US-030 AC#4 / #12 / #13 / #14，AC#6 / #10 的区间排他部分。

### User Story 4 - BOM 图骨架实体（US-507 阶段 A/B，Priority: P1）

新建 `packages/rxdb-plugin-bom`：`item` / `item_revision`（`default_phantom` 随修订、`serialized` 随物料）/ `bom_header`（挂修订，`draft`/`released`，唯一键 `(parent_revision_id, bom_type, org_id, alternative_no)`）/ `bom_line`（逻辑行，`(bom_header_id, line_no)` 唯一）/ `bom_line_occurrence`（行发生项，区间排他，`child_revision_id` NULL=imprecise 且必须属于 `child_item_id`）。同一子件可挂多条逻辑行（多重图）。已发布修订除状态转移外不可改；结构归属列创建后不可改；已发布头的成员写入按 US-515 协议（首轮无 ECN，全部拒绝）。

**Independent Test**：三行同子件并存；相邻发生项接受、重叠拒绝；修订不属于子件拒绝；直连 SQL 改结构归属列 / 已发布数据全部拒绝；`default_phantom` 随修订取值。

**Acceptance Scenarios**：US-507 AC#1 / #6 / #7 / #8 / #9 / #11 / #13（发生项部分）/ #14，AC#10 的发生项部分。

### User Story 5 - 数量十进制值合同（US-511 存储段，Priority: P1）

`qty` 以规范十进制串存取，全程不经 JS `number`。插件入口规范化（指数写法、尾随零），存储层触发器拒非规范串（直连 SQL 也不放行），35 位有效数字 / 非有限值 / 负值（首期）在入口拒绝。

**Independent Test**：34 位有效数字写入 → 两后端回读逐字相同；`1.5E-3`/`1.50` 入口规范化为 `0.0015`/`1.5`；直连 SQL 写 `1.5E-3`、`01`、`1.50`、`-0` 两后端均拒绝并点名字段。

**Acceptance Scenarios**：US-511 AC#22 ①（存储与回读段）/ ②、AC#23。

### 非目标（第 1 步明确不做）

- 展开段数量计算与损耗（US-511 其余阶段，第 3 步）；`qty_formula`、阶梯、换算率字段本体
- 位号子表与发布聚合校验（US-507 阶段 C，第 4 步）
- 视图解析 / imprecise 解析规则（US-508，第 2 步）；判环（US-509，第 2 步）
- US-030 阶段 D（生成列 / 表达式索引，价值待证）；替代组、ECN、工艺路线等后续故事

## 需求要点（实现须遵守的合同）

1. **CHECK 声明语法**：复用查询 `RuleGroup` 形状收窄（操作符白名单 `= != < > <= >= in notIn between notBetween null notNull`；新增字段对字段 `ref`）；属性级 `check` 是省略 `field` 的单条规则，编译成以属性名为 `name` 的实体级 CHECK。白名单外的规则（`exists`、`contains` 系、`startsWith/endsWith`、关系路径、JSON/键值/二进制字段）在建元数据期拒绝（AC#9）。
2. **字面量编译**：CHECK/`where` 只拼字面量（无占位符），编译路径放核心、两类适配器共用；列名用 `quoteSqlIdentifier`，值用 `sql-literal` 既有函数 + 新增非整数字面量（转不动就拒绝）；`PropertyType.integer` 列的字面量不得超 int4 值域（AC#15）。
3. **约束命名**：`ck_` / `uq_` / `ex_` + 表名 + 作者 `name`（限 `[a-z][a-z0-9_]*`）+ 规范化表达式 8 位哈希；完整约束名 ≤ 63 UTF-8 字节，超长建元数据期抛错；改表达式不改 `name` 即判漂移（AC#11 / #15）。
4. **SQLite 版本门槛 ≥ 3.47.0**：检查放 sqlite-core 共享层、只做一次；低于门槛 `init()` 抛错并点名实际版本与门槛；Tauri 升 rusqlite 0.33（libsqlite3-sys 0.31 → SQLite 3.48.0）随本 PR。
5. **漂移检查**：`init()` 在用户迁移与缺表补建之后、与 `reconcileEntityIndexes` 同一时机做**只读**比对（SQLite 查 `sqlite_master`，PG 查 `pg_constraint` / `pg_indexes`），只纳入 `ck_` / `uq_` / `ex_` 起头的对象；不一致抛 `RxDBConstraintDriftError`（列出缺失与多余），不自动补建（AC#10 / #16）。适配器未实现该方法的实体声明了约束 → `init()` 报不支持（AC#6）。
6. **错误归一**：`RxDBCheckViolationError`（PG 23514 / SQLite `CHECK constraint failed`）、`RxDBExclusionViolationError`（PG 23P01 / SQLite `rxdb:exclusion_violation:` 前缀消息）、`RxDBConstraintDriftError`；条件唯一复用现有唯一冲突口径；三类都进 `RxDBError` 体系、api-baseline 登记。
7. **区间排他语义**：相等列 `=`（NULL 不相等，与 PG EXCLUDE 一致）；区间维时间列 `tstzrange` / 整数 `int8range`，`bounds` 限 `[)` / `[]`；端点 NULL 即无界；全部维同时相交才冲突；SQLite 触发器对 UPDATE 按主键排除被更新行自身（AC#12）；触发器名为约束名加 `_i` / `_u`。
8. **重放路径**（AC#14）：「截止旧行 + 新开一行」的 undo/redo 与分支切换重放必须通过——两侧 `execute_switch_actions` 的执行顺序改为 deletes → updates → inserts（并核对更新对新插行的外键依赖），`dispatch_switch_events` 遍历顺序同步。
9. **BOM 插件架构**：完全照抄 `rxdb-plugin-search` 的 DDL 下发机制——`inject: ['adapter:local']`、`bootstrapTransaction`、按 adapter 名分后端注册表（sqlite 家族 / pglite）、幂等靠 `RxDBMigration` 记录名签名；包骨架照抄 `rxdb-plugin-graph`。
10. **结构归属列不可改**：`item_revision.item_id`、头的 `parent_revision_id` / `bom_type` / `org_id`、逻辑行的 `bom_header_id`、发生项的 `bom_line_id`——UPDATE 触发器拒绝（`BomWriteProtocolError` 点名列），草稿里也不可改；「移动」= 草稿里删除重建（US-507 AC#13）。
11. **已发布修订不可改**：除 `draft → released` 状态转移外全部拒绝（`BomWriteProtocolError`），转移要求 `effective_from` 非空；`released → draft` 拒绝（发布不可逆，与决策 4 一致）（US-507 AC#14）。
12. **已发布头成员写入协议**：成员表（逻辑行、发生项）INSERT/UPDATE/DELETE 触发器查所属头状态，已发布即拒（首轮无 ECN，全部拒绝）；`rxdb:bom_write_protocol:` 前缀，归一为 `BomWriteProtocolError`（US-507 AC#10）。
13. **修订归属**：`(child_item_id, child_revision_id)` 组合外键指向 `item_revision(item_id, id)`（配唯一索引），`child_revision_id` NULL 时两后端 MATCH SIMPLE 放行（US-507 AC#11）。
14. **十进制值合同**：规范串（可选负号、整数部分无前导零（单 `0` 除外）、无指数、小数无尾随零、`-0` 写作 `0`、≤ 34 位有效数字）；入口接受指数写法并规范化；存储层触发器只做格式 / 符号的逐字节谓词判断（两后端同口径），不做数值运算；首期拒绝负值；触发器消息 `rxdb:bom_decimal_format:` 前缀，归一为 `BomDecimalFormatError` 点名字段。

## 交付阶段状态约定

按 epic 切片表：本步只关闭「可以验收」子集，**不把 US-030 / US-507 整条置 Done**；US-511 只勾 AC#22 的存储段与 AC#23，展开段归第 3 步。

## 约束与门禁

- TS strict / ESLint 零警告 / TSDoc；核心包（rxdb）覆盖率 ≥ 90%，插件与适配器包 ≥ 80%
- api-baseline：`pnpm audit:api-surface:update`（rxdb 新增导出 + 新包 `rxdb-plugin-bom` 基线）
- `requirements/package-graph.json` 登记新包；`tsconfig.base.json` paths 登记
- Tauri：`--locked` 门禁要求两份 Cargo.lock 同步更新；cargo-check / clippy / test / conformance 全绿
- 双后端等价：每条存储约束在 SQLite family 与 PGlite 上要么都支持、要么显式声明不支持，不做静默降级
