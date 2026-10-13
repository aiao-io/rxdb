# Implementation Plan: epic-009 首轮切片第 1 步

**Branch**: `claude/bom-related-work-77235b` | **Created**: 2026-10-13

## 技术上下文（探索结论）

| 面 | 现状 | 落点 |
| --- | --- | --- |
| 元数据选项 | `EntityMetadataOptions`（`packages/rxdb/src/entity/entity-options.interface.ts` L111–281）；`EntityIndexMetadataOptions`（`property-types.interface.ts` L501–531，自有字段仅 `properties` / `normalized`） | `checks` / `exclusions` 加在 `indexes` 与 `foreignKeys` 之间；`where` 加在 `EntityIndexMetadataOptions`；属性级 `check` 落在属性接口公共基 |
| 元数据合并 | `transitionMetadata()`（`metadata-transition.ts` L159–230）按 `name` Map 合并 indexes / foreignKeys，子类覆盖父类，L263–270 回写 | `checkMap` / `exclusionMap` 照抄同一模式；属性级 check 编译后以属性名为键参与覆盖 |
| 元数据校验 | `metadata-validate.ts` `validateEntityMetadata()`，`MetadataValidationRule` 字符串联合（现 17 项） | 新增 CHECK / 排他 / where 的规则名 |
| 字面量 | `system/sql-literal.ts`：`quoteSqlIdentifier` / `sqlStringLiteral` / `sqlIntegerLiteral` / `sqlBooleanLiteral` / `sqlTimestampLiteral`，全部「转不动就拒绝」 | 新增非整数字面量；CHECK 编译路径放核心（`entity/check-sql.ts`），两适配器共用 |
| DDL | 各适配器各写一份（有意不分叉抽象）：sqlite-core `table/create_table_sql.ts`（列级 CHECK 先例 L98–128 `column_check_sql`；索引 L253–276 无 `WHERE`）；pglite `table/create_table_sql.ts`（`create_table_indexes_sql` L136–153） | CHECK / partial index 加在两侧建表路径；EXCLUDE 只在 PG 侧生成 |
| 触发器先例 | sqlite-core `fts5/build-fts-triggers.ts` 纯函数（`CREATE TRIGGER IF NOT EXISTS`）；pglite `fts/build-fts-triggers.ts`（plpgsql 函数 + trigger） | SQLite 排他触发器照抄纯函数形态 |
| 引导链 | `RxDB.connect()`（RxDB.ts L1058–1162）：迁移 → `#ensureEntityTables` → `reconcileEntityIndexes?.(entities)`（L1114） | 漂移检查加在 L1114 同一时机；新适配器方法，SQLite family 与 PGlite 都实现 |
| 版本门槛 | `Oo1ClientBase.version()`（`SELECT sqlite_version()`）已存在；sqlite-core 无门槛判定 | 门槛放 sqlite-core 共享层（`RxDBAdapterSqliteBase` 的引导路径），每实例只做一次 |
| 错误归一 | `RxDBError` 子类模式（RxDBError.ts）；`isUniqueConstraintViolation`（migration.ts L216–224）PG 23505 + SQLite 文本 | 新增 23514 / 23P01 / `rxdb:` 前缀判别，同口径 |
| 重放顺序 | 两侧 `version/execute_switch_actions.ts` 均 deletes → inserts → updates；`dispatch_switch_events` 随同 | 改 deletes → updates → inserts，事件分发顺序同步（AC#14） |
| Tauri | rusqlite 0.32.1（libsqlite3-sys 0.30.1 → SQLite 3.46.0）；`--locked` 门禁两份 Cargo.lock；0.33 破坏面仅 `create_scalar_function` `FnMut→Fn`（现有闭包已满足，预计零代码改动）；registry 有离线源码 | Cargo.toml 版本号 + 两份 lock + 文档回写 |
| 插件先例 | graph（包骨架 / 实体装饰器 / 测试样板）；search（后端注册表 + `bootstrapTransaction` DDL 下发 + 迁移记录签名 + 错误家族）；pglite `btree_gist` 在 `@electric-sql/pglite/dist/contrib` 可用 | `packages/rxdb-plugin-bom` 新建 |

## 设计

### 1. US-030 类型与编译（packages/rxdb/src/entity/）

新文件 `entity/check-rule.interface.ts`：

```ts
export type CheckOperatorName = '=' | '!=' | '<' | '>' | '<=' | '>=' | 'in' | 'notIn' | 'between' | 'notBetween' | 'null' | 'notNull';
export interface CheckRule {
  field: string;
  operator: CheckOperatorName;
  value?: unknown;      // =/!=/</>/<=/>= 的字面量；in/notIn 用 values；between/notBetween 用 low/high
  values?: unknown[];   // in / notIn
  low?: unknown; high?: unknown; // between / notBetween
  ref?: string;         // 字段对字段比较，只配比较操作符（= != < > <= >=）
}
export type CheckRuleGroup = RuleGroupBase<unknown, string, CheckRule>; // 复用递归壳（RT 参数即为此设计）
export interface EntityCheckMetadataOptions { name: string; rule: CheckRuleGroup; }
```

- `EntityMetadataOptions.checks?: EntityCheckMetadataOptions[]`；`exclusions?: EntityExclusionMetadataOptions[]`；`EntityIndexMetadataOptions.where?: CheckRuleGroup`；属性接口公共基加 `check?: CheckRule`（省略 `field` 的单条规则，编译成以属性名为 `name` 的实体级 CHECK；若公共基被 `EntityIndexMetadataOptions` 复用则拆出独立基类，不污染索引声明面）。
- 继承合并：`transitionMetadata` 中属性级 check 先编译成 `{name: <属性名>, rule: {combinator:'and', rules:[{...rule, field: <属性名>}]}}` 进 `checkMap`；`checks` / `exclusions` 同 Map 按 `name` set（子覆盖父，AC#17）；`metadata.interface.ts` 的 `EntityMetadataType` 补 `checks` / `exclusions` 数组与 Map，L263–270 处回写。
- 校验（`metadata-validate.ts` 新规则名）：
  - 操作符白名单；`exists/notExists`、`contains` 系、`startsWith/endsWith` 系、关系路径、JSON/keyValue/二进制/数组列一律拒绝（AC#9）；
  - `ref` 仅比较操作符、指向同实体存在的列；`ref` 与 `value` 互斥；
  - `name` 匹配 `/^[a-z][a-z0-9_]*$/` 且完整生成名 ≤ 63 UTF-8 字节（`ck_<table>_<name>_<hash8>`，PG 标识符上限；超长不截断，AC#15）；
  - 字面量类型与列类型相容；`integer` 列限 int4 值域（两后端错误类不分叉），`bigint` 限安全整数；`number` 列限有限数；`date` 接受 `Date` / ISO 串；`enum` 限成员值（保守）；
  - `where` 要求 `unique: true`；
  - `exclusions`：`equal` 至少一列、`ranges` 至少一维；区间列限 `date` / `integer` / `bigint`；`bounds` 限 `'[)' | '[]'`。

新文件 `entity/check-sql.ts`（核心共享编译路径，两适配器共用）：

- `buildConstraintName(prefix, tableName, name, exprSql): string` — 规范化表达式 8 位哈希（FNV-1a 32 位取前 8 hex，纯同步、跨端一致）。
- `compileCheckRuleToSql(rule, propertyMap): string` — `"col" <op> <literal>` / `"col" <op> "refCol"` / `"col" IS NULL` / `"col" IN (…)` / `"col" BETWEEN … AND …`；列名 `quoteSqlIdentifier`，值走 `sql-literal`（`sql-literal.ts` 新增 `sqlNumberLiteral`：有限数、整数走整数、小数走无指数规范化文本）。
- 编译产物 = DDL 片段 + 规范化串（哈希输入）。

### 2. US-030 DDL（两适配器各一份）

- **SQLite**（`sqlite-core/table/create_table_sql.ts`）：实体级 CHECK 推入 `column_check_sql`：`CONSTRAINT "ck_…" CHECK (<expr>)`；属性级编译项同路；部分唯一索引在 indexMap 循环加 `WHERE <expr>` 且命名改 `uq_…`（带 `where` 的唯一索引），普通唯一索引维持 `idx_…` 不动。
- **PGlite**（`pglite/table/create_table_sql.ts`）：CHECK 同款；`create_table_indexes_sql` 加 `WHERE`、`uq_` 命名、`reconcileEntityIndexes` 路径跳过（`ifNotExists` 也不补，漂移检查兜底）；每个 `exclusion` 生成 `CONSTRAINT "ex_…" EXCLUDE USING gist ("eq1" WITH =, tstzrange("from","to",'[)') WITH &&, int8range(…) WITH &&)`；`btree_gist` 在 `resolvePGliteInitOptions` 默认注入（`@electric-sql/pglite/contrib/btree_gist`）并 `CREATE EXTENSION IF NOT EXISTS btree_gist`（bootstrapTransaction 内、建表前）。

### 3. SQLite 排他触发器（sqlite-core，纯函数）

新文件 `sqlite-core/src/table/build-exclusion-triggers.ts`（仿 `build-fts-triggers.ts`）：

- 每条排他生成两个触发器（`CREATE TRIGGER IF NOT EXISTS`，名 = 约束名 + `_i` / `_u`）：
  - `BEFORE INSERT`：`SELECT RAISE(ABORT, 'rxdb:exclusion_violation:' || '<约束名>' || ':' || <冲突行 PK 与两区间>) WHERE EXISTS (SELECT 1 FROM "t" WHERE <相等列 = 相等> AND <区间相交>)`；
  - `BEFORE UPDATE`：同上，追加 `AND existing."pk" <> NEW."pk"` 排除自身（AC#12）；相等列用 `=`（NULL 不冲突，与 PG 一致）；区间相交 `[]`：`(to IS NULL OR to >= NEW.from) AND (from IS NULL OR from <= NEW.to)`；`[)`：`>` / `<`。
- 拼接点：`create_tables_sql` 在每表 DDL 后追加（或与既有触发器同批次）。触发器 `RAISE` 的表达式参数是 SQLite ≥ 3.47 能力，版本门槛保证。

### 4. 版本门槛（sqlite-core 共享层）

`RxDBAdapterSqliteBase` 引导路径（每实例一次、惰性缓存）：`SELECT sqlite_version()`（`SqliteClientLike.version()` / desktop 协议的 version 请求）→ 语义化比较 < 3.47.0 → 抛错点名实际版本与门槛。放在两条 connect 分支都会执行的钩子（`completeBootstrap` 或等价点），不打掉仓内任何宿主（升级后全部达标）。

### 5. 漂移检查（新适配器方法 + RxDB.ts 调用点）

- `rxdb-adapter.ts` 新增可选方法 `checkEntityConstraintDrift?(EntityTypes: EntityType[]): Promise<void>`（与 `reconcileEntityIndexes` 同款可选契约）。
- `RxDB.ts` L1114 之后：实体声明了约束（checks / 带 where 唯一索引 / exclusions）时调用；方法缺席 → 按 AC#6 抛「该适配器不支持声明的存储约束」；方法抛 `RxDBConstraintDriftError`（携带 `missing` / `extra` 名单）。
- **PGlite 实现**：按 schema 查 `pg_constraint`（contype `c`/`x`）+ `pg_indexes` 索引名，与元数据生成名集合比对（只比 `ck_`/`uq_`/`ex_` 前缀对象，AC#16）。
- **SQLite 实现**：查 `sqlite_master`——type=`table` 的 `sql` 文本中 `CONSTRAINT "ck_…"` 出现集、type=`index` 的 `uq_…` 名、type=`trigger` 的 `ex_…_i/_u` 名，与生成名集合比对。

### 6. 错误归一（core）

- `RxDBError.ts` 新增 `RxDBCheckViolationError`（`constraintName`，尽力带实体/列）、`RxDBExclusionViolationError`（`constraintName` + 冲突详情）、`RxDBConstraintDriftError`（`missing` / `extra`）。
- `system/migration.ts` 旁新增判别：`isCheckConstraintViolation`（PG `23514` / SQLite `CHECK constraint failed: (.+)`）、`isExclusionViolation`（PG `23P01` / 消息前缀 `rxdb:exclusion_violation:`）。
- 归一接入：找到 `isUniqueConstraintViolation` 的消费点（保存路径），同处把适配器错误包装成上述类（消息骨架一致指归一后的类与字段，AC#1/#4）；直连 SQL 场景只保证 `rxdb:` 前缀消息可读（US-030 技术笔记口径）。

### 7. AC#14 重放顺序（两侧 execute_switch_actions）

- 两侧 apply 顺序改 **deletes → updates → inserts**；`dispatch_switch_events` 遍历顺序同步。
- 核对：更新动作的补丁若引用本批新插行的外键值会被新顺序破坏——实现期检查动作生成器确认 FK 列是否可能出现在 update 补丁中；若存在真实依赖，仅对声明 `exclusions` 的实体应用新顺序并写清理由（首版预计：BOM 结构归属列不可改、普通实体重放无此依赖，全局新顺序可行——以测试为准，全量既有套件回归兜底）。

### 8. BOM 插件（packages/rxdb-plugin-bom）

包骨架照抄 graph（package.json exports / tsconfig 三件套 / vite.config.mts / project.json / eslint.config.mjs），依赖：`@aiao/rxdb`（peer `workspace:^`）、`@aiao/rxdb-adapter-sqlite-core`、`@aiao/utils`；devDep `@aiao/rxdb-adapter-wa-sqlite` + `@aiao/rxdb-adapter-pglite`（双后端测试）。

实体（`@BomEntity` 包装装饰器 + 具体 `@Entity` 类，namespace `bom`）：

| 表 | 关键列 | 存储约束 |
| --- | --- | --- |
| `item` | `item_no`（string，required，`idx_` 唯一）、`description`（nullable）、`serialized`（boolean，default false） | — |
| `item_revision` | `item_id`（→item，结构列）、`revision_no`（string）、`state`（enum `draft/released`，default draft）、`effective_from`（date，nullable）、`default_phantom`（boolean，default false） | 触发器：`item_id` 不可改；已发布除 `draft→released` 外不可改、`released→draft` 拒、转移要求 `effective_from` 非空 |
| `bom_header` | `parent_revision_id`（→item_revision，结构列）、`bom_type`（enum `ebom/mbom/sales`，结构列）、`org_id`（string，结构列）、`alternative_no`（integer，default 1）、`state`（enum draft/released） | 唯一 `(parent_revision_id, bom_type, org_id, alternative_no)`；触发器：结构列不可改、已发布协议 |
| `bom_line` | `bom_header_id`（→header，结构列）、`line_no`（integer）、`ecn_in_id`（nullable，首轮恒空） | 唯一 `(bom_header_id, line_no)`；触发器：结构列不可改、已发布头成员写入全拒 |
| `bom_line_occurrence` | `bom_line_id`（→line，结构列）、`child_item_id`（→item）、`child_revision_id`（→item_revision，nullable）、`qty`（string，规范十进制串）、`effective_from`（date）、`effective_to`（date，nullable）、`ecn_in_id` / `ecn_out_id`（nullable，首轮恒空） | 组合外键 `(child_item_id, child_revision_id) → item_revision(item_id, id)`（配唯一索引；AC#11）；`exclusions: [{ name:'occurrence_no_overlap', equal:['bom_line_id'], ranges:[{from:'effective_from', to:'effective_to', bounds:'[)'}] }]`（US-030 阶段 C；AC#8/#9）；触发器：结构列不可改、已发布头成员写入全拒、十进制格式 |

触发器 DDL 下发（照抄 search 插件）：

- `plugin.ts`：`inject: ['adapter:local']`；`install(scope)` 里 `adapter.bootstrapTransaction` 执行后端 DDL；后端注册表按 adapter 名分 sqlite / pg 两套 `install(plan, executor, migrationStore)`；幂等与漂移靠 `RxDBMigration` 记录名签名（`bom__v1__<table>__<signature>` 之类）；PL/pgSQL 函数侧动态 import。
- 消息前缀：`rxdb:bom_write_protocol:<列或表>:<detail>`、`rxdb:bom_publish_validation:<detail>`、`rxdb:bom_decimal_format:<field>`。
- 错误家族（`types.ts`，search 先例，`name` 必须字面量）：`BomError` 基类 + `BomWriteProtocolError` / `BomPublishValidationError` / `BomDecimalFormatError`（点名字段）；`BomRepository extends Repository` 在保存路径把适配器错误归一为这些类（直连 SQL 只保证前缀消息）。
- 十进制规范化（`decimal.utils.ts`）：`normalizeDecimalString(input): string`（指数展开、去前导零、去尾随零、`-0→0`；35 位有效数字 / 非有限 / 空串 / 负值拒绝并点名字段）；`BomRepository` 写前规范化 `qty`。格式触发器谓词（两后端逐字节同口径）：
  - PG：`qty ~ '^(0|[1-9][0-9]*)([.][0-9]*[1-9])?$'`；
  - SQLite：`GLOB` 四分支等价（`'0'` / `'[1-9][0-9]*'` / `'0.[0-9]*[1-9]'` / `'[1-9][0-9]*.[0-9]*[1-9]'`）。

### 9. Tauri rusqlite 升级（同 PR）

`rust/Cargo.toml` `rusqlite = "0.33"`（features 不变）→ 两份 Cargo.lock 经 `cargo update -p rusqlite` 更新（`apps/dev-rxdb-tauri/src-tauri/Cargo.lock` 一并）→ `cargo-check / cargo-clippy / cargo-test / test-conformance` 全绿（预期零代码改动）。文档回写：US-030 版本矩阵行、US-217 L340、epic-009 L191、`website/docs/adapters/backup.md`、engine.rs 注释。

### 10. 测试矩阵（TDD，红→绿）

| 面 | 位置 |
| --- | --- |
| 元数据合并 / 校验（AC#9/#15/#17） | `packages/rxdb/src/__tests__/entity/metadata-transition.<主题>.spec.ts`、`metadata-validate.spec.ts` |
| 编译 / 命名（哈希确定性、int4 域、字面量） | `__tests__/entity/check-sql.spec.ts`、`__tests__/system/sql-literal.spec.ts` |
| DDL 文本 | sqlite-core / pglite `__tests__/table/`（可执行 spec 仿 pglite 先例） |
| 版本门槛（AC#7） | sqlite-core 单测（mock client `version()`） |
| CHECK / 条件唯一 / 排他执行（AC#1~#4/#8/#12/#13） | 双后端可执行：sqlite-core shared suite（wa-sqlite 宿主）+ pglite spec |
| 漂移（AC#10/#11/#16、AC#6） | 双后端可执行（先建裸表 → 声明约束 → init 断言） |
| AC#14 重放 | sqlite-core + pglite `execute_switch_actions` 回归（既有共享套件 + 新用例） |
| BOM AC#1/#6~#9/#11/#13/#14 | `packages/rxdb-plugin-bom/src/__tests__/`（wa-sqlite + pglite 双后端集成） |
| 十进制 AC#22 存储段 / AC#23 | 同上，直连 SQL 负例 + API 规范化正反例 |
| Tauri | cargo 三目标 + conformance |

### 11. 门禁与回写

`pnpm audit:api-surface:update`（rxdb 新导出 + 新包基线）、`requirements/package-graph.json` 登记、`tsconfig.base.json` paths、story 回写（US-030 阶段 A/B/C 与 AC 勾选；US-507 阶段 A/B 与 AC 勾选；US-511 AC#22 存储段/AC#23 勾选+说明；status-overview / roadmap / epic 第 1 步关闭记录）、specs quickstart 记录验证结果。最后 `affected-ci` full + 覆盖率门禁。

## 风险与对策

| 风险 | 对策 |
| --- | --- |
| `execute_switch_actions` 全局换序破坏既有重放 | 全量既有共享套件回归；若 FK 依赖真实存在则收窄为「声明 exclusions 的实体新顺序」 |
| `btree_gist` 注入增加所有 PGlite 用户启动开销 | 探测确认 0.5.8 支持后再定；若显著则仅在有 exclusions 时注入 |
| 属性级 `check` 基类与索引声明面耦合 | 拆分独立基类（见设计 1） |
| 漂移检查解析 SQLite 表 SQL 文本脆弱 | 只做 `CONSTRAINT "名"` 子串匹配 + `sqlite_master` 对象名比对，不做表达式解析 |
| 已发布头协议触发器查头状态有 JOIN 开销 | 触发器体一次 EXISTS 子查询，可接受 |
| 34 位规范串判定两端差异 | 用逐字节谓词（GLOB / POSIX 同定义正则），入口规范化两端共用同一 TS 函数 |
