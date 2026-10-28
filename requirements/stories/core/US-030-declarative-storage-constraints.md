---
id: US-030
title: 实体元数据层的声明式存储约束
status: In Review
priority: Medium
epic: epic-004-future-features
created: 2026-09-22
updated: 2026-10-28
tags: [core, schema, integrity]
candidate_acs: [5]
---

# 用户故事：实体元数据层的声明式存储约束

## 作为/我想要/以便

**作为** 实体模型作者
**我想要** 在 `@Entity` 元数据里声明 CHECK、条件唯一与区间排他约束
**以便** 业务不变量落在存储层，而不是只活在仓储方法里

## 交付阶段

| 阶段 | 内容                                                                                      | 状态 |
| ---- | ----------------------------------------------------------------------------------------- | ---- |
| A    | 属性级与实体级 CHECK 约束；SQLite 宿主版本门槛 ≥ 3.47.0（AC#7），Tauri 使用 rusqlite 0.33 | ✅   |
| B    | 条件唯一索引（`where`）                                                                   | ✅   |
| C    | 区间排他约束：PG `EXCLUDE` + SQLite 触发器等价物，错误语义统一                            | ✅   |

阶段归属：A 关闭 AC#1 / #2 / #7～#9 / #11 / #15～#17，以及 AC#6 / #10 的 CHECK 部分；B 关闭 AC#3 与 AC#6 / #10 的条件唯一部分；
C 关闭 AC#4 / #12～#14 与 AC#6 / #10 的区间排他部分。AC#11 / #15 的命名规则与 AC#16 的漂移扫描范围在 A 定下，B / C 沿用。

当前交付范围为 **A～C**，关闭条件是 AC#1～4、#6～17 的实现、验收与合并证据齐全。
生成列、表达式索引与 GIN / GiST 声明保留为**候选阶段 D**：价值待证、未立项，不参与当前关闭条件；
AC#5 保留原编号与未验收状态，供解锁时细化，不能计作已交付能力。

## 范围边界

### In Scope

- `EntityMetadataOptions` 的 `checks`（阶段 A）与 `exclusions`（阶段 C）；`EntityIndexMetadataOptions` 的 `where`（阶段 B）
- 声明语法：CHECK 与条件唯一共用收窄后的 `RuleGroup`；区间排他是「相等列 + 区间维」，见技术笔记各节
- CHECK 表达式复用查询 `RuleGroup` 的形状，收窄为单行子集，另补字段对字段比较（见技术笔记「CHECK 的声明语法」）
- 已有表与声明的约束不一致时 `init()` fail-fast，指向用户迁移（AC#10 / #11）
- 每项能力在 SQLite family 与 PGlite 上**要么都支持、要么显式声明不支持**，不做静默降级
- 无原生能力的后端（SQLite 的 `EXCLUDE`）用触发器补齐，且两侧抛同一个错误码
- 违约错误进 `RxDBError` 体系，携带冲突列与冲突值
- **SQLite 宿主版本门槛 ≥ 3.47.0**：触发器错误要携带冲突值，需要 `RAISE()` 接受表达式；低于门槛的宿主在 `init()` 即 fail-fast（AC#7）。
  门槛只对声明了存储约束（`checks` / 条件唯一 `where` / `exclusions` 任一项）的应用生效，一项都不用的应用不受影响

### Out of Scope

- 候选阶段 D：生成列、表达式索引与 GIN / GiST 声明，须先满足下文的解锁条件
- 插件自有的写入期触发器（图可达性这类跨行判定）——机制已有先例，见技术笔记
- 跨行聚合（位号计数、替代组概率合计、工序分摊合计、ECN 整批校验）——落在 BOM 头的 `draft → released` 发布转移上，见技术笔记
- 跨表断言（ASSERTION）与延迟约束——区间排他按行即时检查，见技术笔记「区间排他的声明与语义」
- 集合值维度的排他（如 [US-518](../domain/US-518-bom-unit-lot-effectivity.md) 的批次集合 `lot_codes`）——PG GiST 无数组运算符类，见同一节
- 同步拉取遇本地约束拒绝远端行时的隔离 / 跳过策略——今天唯一冲突已是同一行为，见技术笔记「与既有写入路径的交互」
- 远端适配器（`supabase` / `http`）的约束下沉——那侧的 DDL 不由本仓掌控
- 已有表的约束自动补建与表重建——由用户迁移承担，见技术笔记「约束命名与已有表漂移」

## 验收标准

| #   | 前置条件                                                                                                          | 操作                                                      | 预期结果                                                                                          | 状态 |
| --- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---- |
| 1   | 属性声明 CHECK                                                                                                    | 写入越界值                                                | 两个后端均拒绝，错误码与消息骨架一致                                                              | ✅   |
| 2   | 实体级 CHECK「两字段二选一」                                                                                      | 两字段同时给值                                            | 拒绝                                                                                              | ✅   |
| 3   | 索引声明 `where`                                                                                                  | 写入不满足条件的重复行                                    | 不被唯一约束误拒                                                                                  | ✅   |
| 4   | 区间排他约束                                                                                                      | 插入重叠区间                                              | 两个后端均拒绝，错误指出冲突区间                                                                  | ✅   |
| 5   | 候选阶段 D 获准立项；声明生成列 + GIN                                                                             | 按该列过滤                                                | 走索引；原字段的读写方式不变；未立项前不参与 A～C 关闭条件                                        | ⬜   |
| 6   | 后端不支持某项声明                                                                                                | `init()`                                                  | 建元数据期抛错，不静默降级为应用层校验                                                            | ✅   |
| 7   | SQLite 宿主版本 < 3.47.0                                                                                          | `init()`                                                  | 抛错并点名实际版本与门槛，不退化为常量错误消息                                                    | ✅   |
| 8   | 实体级 CHECK `unit_from <= unit_to`（字段对字段）                                                                 | 写入 `unit_from > unit_to`；另写一行 `unit_from` 为 NULL  | 前者两后端均拒绝；后者两后端均放行（SQL 三值逻辑，要拒 NULL 须另加 `notNull`）                    | ✅   |
| 9   | CHECK 用了单行子集外的规则（`exists`、`contains`、`startsWith`、关系路径、JSON / 键值 / 二进制字段）              | `init()`                                                  | 建元数据期抛错，点名规则与原因                                                                    | ✅   |
| 10  | 库里已有该实体的表，实体新增一条 CHECK（或条件唯一索引、区间排他）                                                | `init()`                                                  | 抛 `RxDBConstraintDriftError`，列出缺失与多余的约束名，不自动补建；用户迁移补上后再 `init()` 通过 | ✅   |
| 11  | 已有约束只改表达式、不改 `name`                                                                                   | `init()`                                                  | 同 #10：约束名含表达式哈希，改表达式即判为漂移                                                    | ✅   |
| 12  | 区间排他已生效；行 X 经 UPDATE 扩成与行 Y 重叠；另一行只在自身范围内扩区间、不碰他行                              | 保存                                                      | 前者两后端均拒绝（SQLite 的 UPDATE 路径同样设防）；后者两后端均放行（不与自身旧值比）             | ✅   |
| 13  | 排他声明一个相等列 + 日期 `[)` 与整数 `[]` 两个区间维，端点可为 NULL                                              | 写入两维同时相交的一行；再写整数维相邻（136 / 137）的一行 | 前者两后端均拒绝，错误给出双方区间；后者放行；NULL 端点按无界比较                                 | ✅   |
| 14  | 同一相等键「截止旧行 `to` + 新开一行 `from`」两步写入后                                                           | undo 再 redo；或经分支切换重放同一组变更                  | 两后端均不被排他误拒，最终态与直接写入一致                                                        | ✅   |
| 15  | CHECK 字面量超出列类型值域（如 `integer` 列写 `3000000000`）；或 `name` 含 `[a-z0-9_]` 外字符、或约束名超 63 字节 | `init()`                                                  | 建元数据期抛错，点名约束与原因                                                                    | ✅   |
| 16  | 既有库的实体未声明任何新约束，但表上已有外键、`idx_` 普通索引、系统 CRUD 触发器、FTS 触发器                       | `init()`                                                  | 不报漂移：这些对象不在比对范围                                                                    | ✅   |
| 17  | 父实体与子实体（`extends`）各声明 CHECK，其中一条同名                                                             | 子实体 `init()` 后写入                                    | 同名项按子实体的生效、父实体的被覆盖；异名项全部生效                                              | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**当前声明面覆盖 A～C。** [`EntityMetadataOptions`](../../../packages/rxdb/src/entity/entity-options.interface.ts)
提供 `checks` / `exclusions`；[`EntityIndexMetadataOptions`](../../../packages/rxdb/src/entity/property-types.interface.ts)
提供条件唯一的 `where`，并保留 `properties` / `normalized` 等既有声明。
生成列、索引 `expression` / `method` 不在当前声明面；它们属于未立项的候选阶段 D。

**阶段 C 的双后端等价是最贵的一段。** PGlite 有范围类型 + GiST `EXCLUDE`；SQLite 没有，
必须用触发器补。触发器生成在本仓有现成先例——FTS 按方言各有一份生成器：PGlite 的
[`fts/build-fts-triggers.ts`](../../../packages/rxdb-adapter-pglite/src/fts/build-fts-triggers.ts) 与 SQLite 共享层的
[`fts5/build-fts-triggers.ts`](../../../packages/rxdb-adapter-sqlite-core/src/fts5/build-fts-triggers.ts)。可复用的是**机制**，不是那份 SQL。
声明与语义见下文「区间排他的声明与语义」。

**SQLite 版本门槛是阶段 C 与插件触发器的共同前置。** SQLite 的 `RAISE(ABORT, msg)` 在 3.47.0（2024-10-21）之前只接受字符串字面量，
触发器拼不出「冲突区间」「环路径」「位号数与 `qty`」这类动态消息——AC#4、[US-509](../domain/US-509-bom-dag-cycle-detection.md) AC#1、
[US-507](../domain/US-507-bom-graph-skeleton.md) AC#5 都依赖它。
门槛由 [`SQLITE_MIN_HOST_VERSION` / `assertSqliteHostVersion()`](../../../packages/rxdb-adapter-sqlite-core/src/system/sqlite-version.ts)
定义，`RxDBAdapterSqliteBase` 每次连接读取一次 `SELECT sqlite_version()`，按实际宿主版本判定，不从包版本猜测。
Tauri 的 [`rust/Cargo.toml`](../../../packages/rxdb-adapter-tauri/rust/Cargo.toml) 使用 **rusqlite 0.33**，
[`Cargo.lock`](../../../packages/rxdb-adapter-tauri/rust/Cargo.lock) 锁定 rusqlite 0.33.0 / libsqlite3-sys 0.31.0；
它不再是待升级的前置。其他宿主同样以运行时检查为准，低于门槛时按 AC#7 显式失败。

**违约错误的判别。** 按 [`RxDBError.ts`](../../../packages/rxdb/src/RxDBError.ts) 的约定「新错误按类名主判别」，
各 AC 说的「同一错误码」指适配器归一后的**同一个错误类**，不另立码表：

| 违约                                  | 错误类（核心，`RxDBError` 子类）                                                                                    | PG 识别                           | SQLite 识别                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------ |
| CHECK（阶段 A）                       | `RxDBCheckViolationError`                                                                                           | SQLSTATE `23514`                  | 原生 `CHECK constraint failed: <约束名>`                           |
| 条件唯一（阶段 B）                    | 不新增类，与现有唯一冲突同一口径（[`isUniqueConstraintViolation`](../../../packages/rxdb/src/system/migration.ts)） | SQLSTATE `23505`                  | 原生 `UNIQUE constraint failed`                                    |
| 区间排他（阶段 C）                    | `RxDBExclusionViolationError`                                                                                       | SQLSTATE `23P01`                  | 触发器 `RAISE(ABORT, 'rxdb:exclusion_violation:<约束名>:' \|\| …)` |
| 已有表约束漂移（`init()`，阶段 A 起） | `RxDBConstraintDriftError`                                                                                          | 查 `pg_constraint` / `pg_indexes` | 查 `sqlite_master`                                                 |

约束名由元数据确定性生成，适配器凭它反查实体与列；冲突值取自适配器自己发出的那一行（原生 CHECK 消息不带值），
已有冲突区间取自 PG 的 `DETAIL` 或触发器消息。直连 SQL 拿不到错误类，只拿到原生消息或 `rxdb:` 前缀消息。
AC#1 / #4 的「消息骨架一致」指归一后的类与字段一致，不要求两后端原生文本相同。

插件自有触发器沿用同一前缀格式 `rxdb:<kind>:<detail>`（PG 侧 `RAISE EXCEPTION` 用同一文本），错误类归插件：
环 → `BomCycleError`（[US-509](../domain/US-509-bom-dag-cycle-detection.md)），发布转移聚合 → `BomPublishValidationError`、
已发布头协议外写入 → `BomWriteProtocolError`（[US-507](../domain/US-507-bom-graph-skeleton.md) AC#5 / #10、
[US-515](../domain/US-515-bom-change-management.md)）。

**CHECK 的声明语法。** 不自造表达式 DSL：复用查询 [`RuleGroup`](../../../packages/rxdb/src/repository/query.interface.ts) 的形状
（`combinator` + `rules` 递归），按 CHECK 只看单行的性质收窄，另补一种查询里没有的比较：

```ts
@Entity({
  checks: [
    {
      name: 'qty_xor_formula', // US-511 AC#7：恰好一项
      rule: {
        combinator: 'or',
        rules: [
          { combinator: 'and', rules: [{ field: 'qty', operator: 'notNull' }, { field: 'qty_formula', operator: 'null' }] },
          { combinator: 'and', rules: [{ field: 'qty', operator: 'null' }, { field: 'qty_formula', operator: 'notNull' }] }
        ]
      }
    },
    {
      name: 'unit_range', // US-518 AC#4：字段对字段
      rule: { combinator: 'and', rules: [{ field: 'unit_from', operator: '<=', ref: 'unit_to' }] }
    }
  ]
})
```

- **操作符白名单**：`=` `!=` `<` `>` `<=` `>=` `in` `notIn` `between` `notBetween` `null` `notNull`。
  `exists` / `notExists` 要子查询，CHECK 里不允许；`contains` 系与 `startsWith` / `endsWith` 系在两后端的单行语义不一致
  （SQLite `LIKE` 对 ASCII 不分大小写，PG 区分）；关系路径与 JSON / 键值 / 二进制字段同理。一律在元数据期拒绝（AC#9）。
- **`ref`** 是查询 `Rule` 没有的字段对字段比较，只配比较操作符，指向同实体的另一列——各类「下界 ≤ 上界」都靠它（AC#8）。
- **属性级 `check`** 是语法糖：`EntityPropertyMetadataOptions` 上一条省略 `field` 的规则，编译成以属性名为 `name` 的实体级 CHECK。
- **值只拼字面量。** 复用的是 `RuleGroup` 的形状与类型，不是查询构造器：PG 的 `buildRuleGroupPG` 走 `$n` 占位符，
  而 DDL 里的 CHECK 不能带占位符。CHECK 另走一条只拼字面量的编译路径，放在核心、两类适配器共用：
  列名用 [`sql-literal.ts`](../../../packages/rxdb/src/system/sql-literal.ts) 的 `quoteSqlIdentifier`，值用同文件的字面量函数——
  `sqlBooleanLiteral` / `sqlTimestampLiteral` 已按两后端的存储形态统一，同一字面量两边都对，不按后端分叉；
  缺的字面量类型（如非整数）在那里按「转不动就拒绝」的口径补。
- **字面量不得超出列类型值域**（AC#15）：PG 把 `PropertyType.integer` 建成 `integer`（int4），SQLite 的整数是 8 字节。
  超 int4 的字面量在 PG 上先撞列类型（SQLSTATE `22003`）而不是 CHECK（`23514`），两后端的错误类就分叉了，所以在元数据期拒绝；
  需要更大值域的列声明为 `bigint`。`uuid` 列同理：PG 建表时就按 uuid 解析字面量（非法文本让 DDL 失败，SQLite 照建），
  大写 / 无连字符的合法写法在 PG 按值比较、在 SQLite 按文本比较，所以只收小写规范形态（8-4-4-4-12），`where` 同一条路径。
- **字符串比较按字节序**：PGlite 默认排序规则是 `C`，与 SQLite 的 `BINARY` 一致；远端 PG 的 locale 排序不在本故事内（Out of Scope 已排除远端）。
- **继承**：`checks` / `exclusions` 按 `name` 进 [`transitionMetadata()`](../../../packages/rxdb/src/entity/metadata-transition.ts)，
  与 `indexes` / `foreignKeys` 同一套 Map 覆盖——子实体同名项覆盖父实体的，异名项全部生效（AC#17）；属性级 `check` 编译出的项以属性名为键，同样参与覆盖。
- **NULL 按 SQL 三值逻辑**：比较遇 NULL 结果未知，CHECK 放行。两后端一致，但与查询的 WHERE（未知即不命中）相反，
  要拒 NULL 须显式写 `notNull`（AC#8）。US-511 AC#21 的阶梯三字段（三者同空，或 `tier_group_no` 与 `lotsize_from` 同非空）正是用 `null` / `notNull` 组合写出。

**条件唯一的声明语法（阶段 B）。** `where` 与 CHECK 用同一份收窄后的 `RuleGroup`、同一条字面量编译路径（含 `ref` 与 AC#9 的白名单），
白名单里只有确定性比较，PG 与 SQLite 的部分索引都接受：

```ts
indexes: [
  {
    name: 'released_effective_from', // US-508 AC#10：同一物料已发布修订的 effective_from 唯一
    properties: ['item_id', 'effective_from'],
    unique: true,
    where: { combinator: 'and', rules: [{ field: 'state', operator: '=', value: 'released' }] }
  }
];
```

`where` 只对 `unique: true` 有意义，非唯一索引带 `where` 在元数据期报错（`invalidIndexWhere`），不静默忽略。
索引名为 `uq_` + 表名 + 索引 `name` + 规范化定义哈希，定义含 namespace——SQLite 的索引名是库级的，跨 namespace 的同名表不撞名。

`ON CONFLICT` 推断子句要命中带 `where` 的唯一索引，须带同一 `WHERE`，否则两后端都拒绝该语句。今天的实体保存路径全以主键为冲突目标，不受影响；
插件里已有非主键目标（[`SqliteGraphRepository`](../../../packages/rxdb-plugin-graph/src/sqlite/SqliteGraphRepository.ts) 的 `("sourceId", "targetId")`），
在同一列集上加条件唯一时要一并核对。

**区间排他的声明与语义（阶段 C）。** 形状是「相等列 + 区间维」，全部维**同时**相交才算冲突：

```ts
@Entity({
  exclusions: [
    {
      name: 'occurrence_no_overlap', // US-508 AC#2；加第二维即 US-518 AC#5 的日期 × 序列
      equal: ['bom_line_id'],
      ranges: [
        { from: 'effective_from', to: 'effective_to', bounds: '[)' },
        { from: 'unit_from', to: 'unit_to', bounds: '[]' }
      ]
    }
  ]
})
```

- `equal` 至少一列、`ranges` 至少一维。区间维只接受时间类与整数列，`bounds` 限 `[)` / `[]`；端点 NULL 即该侧无界，两后端一致（AC#13）。
- **PG**：`EXCLUDE USING gist (<equal> WITH =, <range>(from, to, bounds) WITH &&, …)`，时间列（PG 侧是 `timestamptz`）取 `tstzrange`，整数取 `int8range`。
  相等列可以是关系外键，而 PGlite 的关系列在建表之后才 `ADD COLUMN`，所以排他以 `ALTER TABLE … ADD CONSTRAINT` 单列一条，与外键一起排在全部建表语句之后。
  `=` 上 GiST 要 `btree_gist`：有实体声明 `exclusions` 时，适配器从 `@electric-sql/pglite/contrib/btree_gist` 装载（OPFS worker 模式由 worker 入口装载），
  并在 `connect()` 里 `CREATE EXTENSION IF NOT EXISTS`，排在用户迁移之前。装载由实体元数据决定、不进用户的 `extensions`，备份扩展清单不变。
  桌面端（Electron）的 PGlite 由宿主在主进程创建，宿主据 `pgliteServerExtensionRequirementsOf(entities)` 自行装载；没装载时 `connect()` 显式失败、点名缺的扩展（AC#6）。
  倒置区间（`from > to`）在 PG 侧以 `CASE … THEN 'empty'` 映射成空区间——否则范围构造函数先抛 `22000`，与 SQLite 的错误类分叉。
  探针（PGlite 0.5.8）：`uuid` / `varchar` 相等列 + `tstzrange` / `int8range` 多维可建，半开区间相邻不冲突，冲突报 `23P01`，`DETAIL` 带双方键值。
- **SQLite**：每条排他生成**两个**触发器，`AFTER INSERT` 与 `AFTER UPDATE OF <相等列与区间端点>`；判定按主键排除被写入行自身。
  只建 INSERT 时，UPDATE 能静默造出重叠；不排除自身，则合法的自身扩区间被误拒（AC#12）。触发器名为约束名加 `_i` / `_u`，仍以 `ex_` 起头，进漂移比对。
  用 `AFTER` 而不是 `BEFORE`：`BEFORE` 先于 NOT NULL / CHECK 求值，同一行同时违反 CHECK 与排他时 SQLite 会报排他、PG 报 CHECK（PG 先做行约束、插索引时才查排他），
  两后端的错误类就分叉了；`RAISE(ABORT)` 回滚整条语句，效果与 `BEFORE` 一致。判定按相等列查找同组行，SQLite 不为此自动建索引，大表请为相等列另行声明普通索引。
- **空区间与倒置区间不与任何行冲突**，两后端一致：`[)` 的 `from = to` 天然是空区间，`from > to` 两侧都当空区间。要拒绝倒置须另加 CHECK `from <= to`，与「要拒 NULL 须显式 `notNull`」同口径。
- **违约错误** `RxDBExclusionViolationError` 携带实体、约束名与逐维的双方区间（`incoming` / `existing`，端点 `null` 即无界；时间维为 `Date`、整数维为 `number`、bigint 维为 `bigint`）。
  PG 的整数范围按 `[a,b)` 规范化输出，`[]` 维换回闭区间后再上报，两后端给出同一组值；PGlite worker 模式只回传消息文本、没有 `DETAIL`，此时 `ranges` 为空、约束名仍准确。
- **按行即时检查，两后端一致**：PG 不用 `DEFERRABLE`，SQLite 触发器逐行触发；本故事不提供延迟检查。代价落在批量重放路径——
  两类适配器的 `execute_switch_actions`（[PGlite](../../../packages/rxdb-adapter-pglite/src/version/execute_switch_actions.ts) /
  [SQLite](../../../packages/rxdb-adapter-sqlite-core/src/version/execute_switch_actions.ts)）都按 deletes → inserts → updates 执行，
  「截止旧行 + 新开一行」的 redo 会先插新行、后截旧行，中间态重叠被拒。对**声明了区间排他的实体**，重放（undo / redo / 切分支 / 同步拉取）改为
  删除 → 更新 → 插入，更新内部收窄类（相等列不变、每一维只缩不扩）排最前，其余保持原相对顺序（核心 `exclusion-write-order.ts`）：删除与更新执行完时表是合法终态去掉本批新插行，
  逐行插回去的每一步仍是终态的子集。外键不受影响——两后端都在提交时检查外键（SQLite 事务内 `defer_foreign_keys`、PG 外键 `DEFERRABLE INITIALLY DEFERRED`）。
  批量写入（`saveMany` / `mutations`）原本按 插入 → 更新 → 删除 执行，同一批「截旧 + 新开」「删旧 + 新增」同样经过重叠，同样改为删除与更新先于插入；
  同一批里既被创建又被更新 / 删除的实例不提前（提前会改写它的语义）。没有区间排他的实体两条路径的顺序都不变。
  PGlite 适配器直调的 `saveMany` 是按类型一条多行 UPSERT（不经 `mutations`），同一口径落在行序上：已在库里的行（收窄类最前）排在新行之前，违约同样归一。
  两行**互换**区间这类终态合法、却无论顺序都经过重叠的操作不支持，调用方经中间值分两步写。
- **集合维不支持**：PG GiST 对 `int[]` / `text[]` 无默认运算符类（探针确认），NULL 在 `EXCLUDE` 里又永不冲突，表达不了「NULL = 全部批次」。
  [US-518](../domain/US-518-bom-unit-lot-effectivity.md) 的批次维由它启动时另行决定，本故事只交付标量区间维。
  排他声明不带条件、对整表生效：日期、序列都相交而批次集合不相交的两条发生项（US-518 AC#10）同样会被拒，
  所以 US-518 能否消费阶段 C，也取决于那次裁决（见其技术笔记「三维判定的落点」）。

**约束命名与已有表漂移。** 约束名由前缀（`ck_` / `uq_` / `ex_`）+ 表名 + 作者给的 `name` + 规范化表达式的 8 位哈希确定性生成。
`name` 限 `[a-z][a-z0-9_]*`；PG 标识符上限 63 字节，按 UTF-8 字节数计（不是字符数），超长在元数据期抛错，不截断——截断会让两个约束撞名（AC#15）。
表名段只允许字母（任意文字）、数字与下划线：约束名要原样出现在 SQLite 的违约消息（`CHECK constraint failed: <名>` 以空白为界、
排他触发器消息以冒号为界）与建表 SQL 里，漂移扫描与违约归一都按这些边界取名，空白、冒号、逗号、引号会把名字截断。
哈希让「改表达式不改名」也成为可检出的漂移（AC#11）。`uq_` / `ex_` 的规范化定义含 namespace：它们在 SQLite 上是库级对象（索引、触发器），
两个 namespace 下同名表、同名约束、同一定义不会撞成同一个名字。

今天的已有表处理：[`RxDB.#ensureEntityTables`](../../../packages/rxdb/src/RxDB.ts) 只给**缺失**的表建表；
已有表上只有 PGlite 实现了可选的 `reconcileEntityIndexes`（以 `IF NOT EXISTS` 补建索引），SQLite family 没有实现。
照这个现状直接加 `checks`，老库会静默没有约束——正是本故事要消灭的「不变量只活在声明里」。

所以在 `init()` 调用 `reconcileEntityIndexes` 的同一时机（用户迁移与缺表补建之后）加一步**只读**漂移检查。它是新的适配器方法，
SQLite family 与 PGlite 都要实现——SQLite family 今天没有 `reconcileEntityIndexes`，没有现成挂点可扩展；
本地适配器未实现它而实体声明了约束，按 AC#6 在 `init()` 报不支持。远端适配器（supabase / http）永远不实现它，但只拒**主存储在该远端上**的实体（remote-only）：
「本地 + 远端同步」的实体由本地适配器承担约束，远端只是同步对端，按「声明了就拒」处理会让整个同步应用连不上远端。PG 查 `pg_constraint` / `pg_indexes`，
SQLite 查 `sqlite_master`（表 `sql` 文本里的约束名、索引名与触发器名），与元数据生成的名字集合比对，
不一致即抛 `RxDBConstraintDriftError`，列出缺失与多余的名字（AC#10）。

比对**只纳入** `ck_` / `uq_` / `ex_` 起头的对象，每类对象只认自己的前缀：SQLite 上 `ck_` 读建表 SQL 文本里紧跟 `CHECK` 的命名约束（外键 / 唯一约束的名字也可能以 `ck_` 起头）、`uq_` 读 `type = 'index'`、`ex_` 读 `type = 'trigger'`（每条约束两个）；
PG 上 `ck_` 读 `pg_constraint`（`contype = 'c'`）、`ex_` 读 `pg_constraint`（`contype = 'x'`）、`uq_` 读 `pg_indexes`（`EXCLUDE` 的同名支撑索引也在那里，按前缀分开）。外键约束（作者原名，见 `create_table_sql.ts`）、普通索引（`idx_` 前缀）、
系统 CRUD 触发器（`<表>_insert` / `_update` / `_delete`）、FTS 触发器与插件自有触发器都不在范围——否则每张既有表首次 `init()` 就被报「多余」（AC#16）。

不自动补建：SQLite 3.53.0 起才有原生 `ALTER TABLE ADD CONSTRAINT CHECK`（本机 3.53.1 实测：老数据违约时 ALTER 被拒），
而门槛只保证 3.47.0、`@sqliteai/sqlite-wasm` 停在 3.50.4，低版本仍只能按官方「12 步」重建表，本故事不依赖原生 ALTER；
PG 虽能 `ADD CONSTRAINT`，但老数据违约时，启动就成了一次无界的数据校验。补建由用户写进 `migrations`，它恰好排在漂移检查之前执行。
本故事声明的约束类索引（带 `where` 的唯一索引）与区间排他同样只走漂移检查，`reconcileEntityIndexes` 补建时跳过它们。

**与既有写入路径的交互。** 同步拉取把整批应用与水位推进放在一个事务里
（[`pull-batch.ts`](../../../packages/rxdb-plugin-sync/src/pull-batch.ts) / [`pull-repository.ts`](../../../packages/rxdb-plugin-sync/src/pull-repository.ts)）。
远端行违反本地约束时事务回滚、水位不动，下次拉取重取同一行、再失败，直到有人修远端数据或改本地约束。今天的唯一冲突已经是这个行为，
本故事只是让能触发它的约束变多。不新增隔离或跳过（Out of Scope）；要求违约以归一后的错误类原样抛出、不被吞，
消息点名实体与约束名，运维才看得见是哪一行卡住。

**插件自有触发器不在本故事内。** 图可达性这类判定要读整张边表，装不进声明式约束；
它按 FTS 的先例由插件自己发 DDL，归 [US-509](../domain/US-509-bom-dag-cycle-detection.md)。
本故事只负责「元数据能表达的约束」这一层。

**跨行聚合也不是 CHECK 的消费方。** CHECK 只看单行；「位号数 = `qty`」「概率合计为 1」这类聚合若逐行校验，
第一条录入就必然失败，合法聚合永远建不出来。epic-009 把它们统一放在 `bom_header` 的 `draft → released` 状态转移上，
由插件触发器整组校验（[US-507](../domain/US-507-bom-graph-skeleton.md) AC#5 / #10），与图可达性同属插件自有触发器，不进本故事。

## 价值待证

**A～C 的有效授权**：owner 于 2026-10-02 确认 [epic-009 默认决策](../../epics/epic-009-bom-domain-model.md#解锁前须先处理)
1～8 条，并授权 A～C 以 Medium 优先级交付，豁免这三个阶段的「病灶数 ≥ 抽象数」准入条件。
授权不覆盖 D；BOM 领域的准入以 epic-009 自己的有效授权为准。

owner 确认的约束仍有效：同步拉取遇本地约束拒绝不做隔离；区间排他支持 AC#14「截旧 + 新开」重放、
不支持区间互换；继承同名约束子覆盖父；约束名遵守「约束命名与已有表漂移」一节。A～C 的关闭只核对当前交付范围，
不等待候选 D 或 BOM 样本。

已识别的消费需求集中在已获准的 [epic-009](../../epics/epic-009-bom-domain-model.md)，各故事仍按自身前置验收，不计作已交付的调用方：
阶段 A 对应 US-511 AC#7 / #21、US-512 AC#10、US-518 AC#4（US-511 AC#12 与 US-513 AC#5 判的是十进制文本，由 BOM 插件的格式触发器承担，见 US-511「十进制值合同」）；AC#7 的版本门槛对应 US-507 AC#5 与 US-509 AC#1；
阶段 B 对应 US-508 AC#10；阶段 C 对应 US-507 AC#9、US-508 AC#2、US-518 AC#5（日期 × 序列两维，以 US-518 启动时对三维判定落点的裁决为准；批次集合维不在本故事）与 US-524 AC#3；
候选 D 对应 US-519 AC#3 / #7 的可选加速——GIN、表达式索引与生成列是按后端能力启用的**优化**，US-519 的查询契约不依赖它们，
后端缺某项索引能力时按 AC#6 显式声明不支持该索引，而不是让 SQLite 上整个扩展属性不可用。

**候选 D 的解锁条件**：出现具名消费方和需要生成列 / 表达式索引的实际查询症状，再评审范围与后端支持矩阵，
细化 AC#5。US-519 的可选加速方向本身不构成立项；未解锁前不实现、不排期。

## 实现文件

- `packages/rxdb/src/entity/` — 元数据接口与校验：`check-constraint.ts`（CHECK 与 `where` 共用的单行规则组编译）、`conditional-unique-index.ts`、
  `exclusion-constraint.ts`、`constraint-name.ts`（三类共用的确定性命名）；`metadata-transition.ts` 的继承合并、`metadata-validate.ts` 的
  `invalidCheck` / `invalidIndexWhere` / `invalidExclusion`
- `packages/rxdb/src/system/` — `check-violation.ts` / `exclusion-violation.ts`（违约归一化）、`constraint-drift.ts`（漂移比对共享核心）、
  `exclusion-write-order.ts`（AC#14 的执行顺序）
- `packages/rxdb/src/RxDB.ts` — AC#6 的能力判定与 `init()` 漂移检查的调用点（与 `reconcileEntityIndexes` 同一时机）
- `packages/rxdb-adapter-sqlite-core/` — SQLite family 的 DDL（`table/create_table_sql.ts`、`table/exclusion_trigger_sql.ts`）、漂移检查、
  写入路径归一化；`version/execute_switch_actions.ts` 与 `rxdb_adapter_mutations.ts` 的执行顺序（AC#14）
- `packages/rxdb-adapter-pglite/` — PG 侧 DDL、`btree_gist` 装载（`pglite-server-extensions.ts`）、漂移检查、写入路径归一化；执行顺序同上
- `packages/rxdb-test/src/check-constraint/` — 两后端共用的契约套件（CHECK / 条件唯一 / 区间排他）
- `requirements/api-baseline/rxdb.json` — 三个新错误类是 `packages/rxdb` 的新导出，跑 `pnpm audit:api-surface:update` 同步基线并补 TSDoc

## References

- [epic-004 未来功能](../../epics/epic-004-future-features.md)
- [epic-009 BOM 领域模型](../../epics/epic-009-bom-domain-model.md) — 当前全部消费方
- [`EntityIndexMetadataOptions`](../../../packages/rxdb/src/entity/property-types.interface.ts) — 现有索引声明面
