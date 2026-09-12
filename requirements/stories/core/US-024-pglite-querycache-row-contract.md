---
id: US-024
title: PGlite 侧 QueryCache 远端行的列契约
status: Done
priority: Medium
epic: epic-004-future-features
created: 2026-09-05
updated: 2026-09-12
tags: [core, querycache, pglite, contract]
---

<!--
INVEST 检查清单:
- [x] Independent: 只动 pglite 的 upsert 构建器与共享测试包，不依赖任何未关闭故事
- [x] Negotiable: 判据的归属（抽公共层 / 各包实现）可议，评审后裁为各包实现；「不做本地兜底」不可议（铁律）
- [x] Valuable: 今天 PGlite 后端缺列时抛的是 Postgres 的 `null value in column ... violates not-null constraint`，列名是本地表的，远端实现者对不上号
- [x] Estimable: 一处落地前校验 + 一条契约测试 + 一处文档
- [x] Small: 单次迭代内可完成
- [x] Testable: 断言错误类型与消息，并断言本地表未落半行
-->

# 用户故事：PGlite 侧 QueryCache 远端行的列契约

> [US-022](US-022-querycache-remote-row-contract.md) 在 sqlite-core 侧定义了「远端一行必须带哪些列」的契约与缺列诊断
> （`assertQueryCacheRowContract`）。PGlite 是 QueryCache 的另一个本地行缓存后端，走的是自己的
> [upsert_many_sql.ts](../../../packages/rxdb-adapter-pglite/src/query-cache/upsert_many_sql.ts)，**同一份契约在这条路上没有执行**。
> 本故事把**契约语义**补齐；**必填列判据按 PostgreSQL 的 DDL 规则重写**——两个后端的建表规则在两处确有分歧，
> 见「设计决策」。

## 作为/我想要/以便

**作为** 用 PGlite 当 QueryCache 行缓存、对着协议文档实现远端的开发者
**我想要** 远端少给一列时，在落地前收到与 sqlite-core 同一种错误、同一份消息骨架
**以便** 不必从 Postgres 的 not-null 约束错误反推是哪一列、也不必按后端分别学两套诊断

## 问题现状

[upsert_many_sql.ts](../../../packages/rxdb-adapter-pglite/src/query-cache/upsert_many_sql.ts) 的 `buildQueryCacheUpsertStatements`
只做两件事：`assertKnownKeys` 拒绝**多出来**的列，再按归一化后的列集把行分组成多条 INSERT。它**不看**列是否
`nullable: false` 且无字面量 `default`——一行少了这样的列，只会让该组的列清单少一项，错误留给 Postgres 在执行时抛。
sqlite-core 侧同样的输入在 `RxDBAdapterSqliteBase.upsertMany` 落地前就被 `assertQueryCacheRowContract` 点名。
能力矢量在 [capability-matrix「已知的需求覆盖缺口」](../../capability-matrix.md#已知的需求覆盖缺口) 登记了这条不对称。

## 范围边界

### In Scope

- `buildQueryCacheUpsertStatements` 在生成任何 SQL 之前，执行与 sqlite-core **同一条契约语义**
  （缺非空无默认值列 → fail-fast）；**必填列判据按 PGlite 自己的建表 DDL 规则实现**（见「设计决策」）
- 缺列时抛出 `name` 与消息骨架与 US-022 逐字同形的错误，且**不落任何一行**（同批次整体拒绝，不做部分成功）
- 契约测试：`@aiao/rxdb-test/query-cache-contract` 跨后端套件（两侧共同成立的部分）+ PG 专属分歧用例 +
  真实 `RxDBAdapterPGlite` 上的真机用例
- `website/docs` 的 QueryCache 行契约一节按后端拆开「哪些列可以省略」，显式写出两条分歧

### Out of Scope

- 改契约语义本身（可省略列的定义、binary 例外）——那是 US-022 的裁决
- 用实体 `default` 在本地补值（铁律：不做本地兜底）
- 远端未知列的处理（`assertKnownKeys` 已覆盖）
- **不移植 US-022 的「批内异构」判据**，也不动 `groupByColumnSet`：那条判据的成因是 sqlite 侧列清单取自
  `data[0]`，PGlite 按列集分组，结构上没有那个病（见「设计决策」第 3 条）
- 不修 `default: null` 写在非空列上的既有误豁免（sqlite 侧保持原状，见「设计决策」第 4 条）

## 验收标准

| #   | 前置条件                                                           | 操作                                       | 预期结果                                                                                                                                              | 状态 |
| --- | ------------------------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | PGlite 作 QueryCache 本地端，实体含 `nullable: false` 无默认值的列 | 远端返回一行缺该列，触发 `upsertMany`      | 落地前抛契约错误（消息点名实体与缺失列，**不含** PG 的 `null value` / `not-null` 字样）；本地已有行的列值分毫不动                                     | ✅   |
| 2   | 同上                                                               | 同一批次里一行完整、一行缺列               | 整批拒绝，完整的那行也不落地；且 `transaction()` **一次都没被调用**（校验发生在开事务之前）                                                           | ✅   |
| 3   | 实体含带**字面量** `default` 的列                                  | 远端行省略该列                             | 通过契约判定（PG 的 DDL 有 `DEFAULT` 子句）；`default: null` **不算**可用默认值，仍必填                                                               | ✅   |
| 4   | 实体含非空 `binary` 列，且该列写了字面量 `default`                 | 远端行省略该列                             | **抛契约错误**——两侧的 DDL 都对 `binary` 跳过 `DEFAULT` 子句，列上只剩 NOT NULL，跟着 default 放行等于让行在 INSERT 时才被拒                          | ✅   |
| 5   | sqlite-core 与 pglite 两个后端                                     | 跑同一份跨后端契约套件                     | 两侧共同成立的规则结论一致，错误 `name` 与消息骨架逐字一致（共享套件，不复制第二份断言）；uuid 主键 / `SET NULL` 两条**故意不同**，各自在本包用例锁死 | ✅   |
| 6   | —                                                                  | 读 `website/docs` 的 QueryCache 行契约一节 | 「哪些列可以省略」按后端拆开，显式写出两条分歧及其成因；[capability-matrix](../../capability-matrix.md) 该缺口条目删除                                | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 设计决策

### 1. 判据按各后端的 DDL 规则各自实现，**不**抽公共层

本故事初稿首选「把判定抽到 `@aiao/rxdb`」，理由是「『同一份』靠单一实现保证」。**这个前提是错的**：
判据算的不是抽象契约，而是「**本后端的建表 DDL** 会把哪些列建成 NOT NULL 且拿不到默认值」，
而两个后端的 DDL 在两处确有分歧（源码实证）：

| 情形                                                        | sqlite-core DDL                                                                                                                                      | PGlite DDL                                                                                                                                                       | 契约结论                         |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `uuid` 主键                                                 | `PRIMARY KEY DEFAULT (lower(hex(randomblob(16))))` — [create_table_sql.ts](../../../packages/rxdb-adapter-sqlite-core/src/table/create_table_sql.ts) | `"id" uuid PRIMARY KEY`，**无任何默认值**（`getPropertyDefaultSql` 对函数型 default 返回 `undefined`，而 `EntityBase.id` 的 `default: () => uuid()` 正是函数型） | sqlite **豁免**；PGlite **必填** |
| 关系列 `onDelete/onUpdate: 'SET NULL'` 且 `nullable: false` | `mustBeNullable` → **不发** NOT NULL                                                                                                                 | 只看 `relation.nullable` → **照发** NOT NULL                                                                                                                     | sqlite **豁免**；PGlite **必填** |
| `integer` 主键                                              | `PRIMARY KEY AUTOINCREMENT`                                                                                                                          | `serial PRIMARY KEY`（隐含 `nextval()`）                                                                                                                         | 两侧都豁免，**理由不同**         |

抽到公共层只能取两者之一：跟 sqlite 豁免，则这两种缺列的行「过了校验」再被 PostgreSQL 拒掉，
诊断又被推回驱动错误里——正是本契约要消灭的东西；跟 PGlite 必填，则 sqlite 侧凭空多出两类误报。
US-022 的技术笔记已裁过同一条：「判据要按 PostgreSQL 的 DDL 规则重写而非照抄」。

> **裁决**：共享**契约语义与消息骨架**（由跨后端套件钉死），必填列判据各包实现，各自与自己的
> `create_table_sql.ts` 逐条对齐——**那两处必须同改**，两份文件的 TSDoc 都写明了这一点。

### 2. 错误类型：各包各自的类，`name` 相同

`RxDBQueryCacheRowContractError` 在 sqlite-core 侧继承 `RxDBAdapterSqliteError`。要让两个后端抛**同一个类**，
只能把它挪进 `@aiao/rxdb`——那会改掉已进 api-baseline 的导出的基类，现有
`catch (e instanceof RxDBAdapterSqliteError)` 会漏掉它，是破坏性变更。而 pglite 包不应依赖 sqlite-core。

> **裁决**：两个包各有自己的类，`name` 同为 `'RxDBQueryCacheRowContractError'`，消息骨架同形。
> 跨后端识别靠 `name`，AC#5 判的是「消息形态一致」而非「类型同一」。

### 3. 只移植判据 ①（缺非空列），**不**移植判据 ②（批内异构）

sqlite 的 `assertQueryCacheRowContract` 有两条判据。判据 ② 在那边存在，是因为它的
`dataColumns = Object.keys(data[0])` 会给后续行绑 `undefined` → 写成 NULL → 可空列被静默清空。
**PGlite 没有这个病**：`groupByColumnSet` 按列集分组，每组一条 INSERT，缺的键根本不出现在列清单里，
`upsert-many-sql.spec.ts` 的「异构行按各自的列集合分组，互不截断」正是固定这一行为的用例。
移植 ② 等于回收一个已交付能力并弄红一条现有用例。

### 4. `default: null` 的既有误豁免：PG 侧顺手排除，sqlite 侧不动

`default: null` 写在非空列上，两个后端的 DDL 都发 `DEFAULT NULL`——对 NOT NULL 毫无用处，
而 US-022 的判据「有 default 就放行」会让这一行过了校验再被拒。这是对称缺陷，与本故事的不对称主题无关。
PG 侧新判据把 `default === null` 排除在豁免之外（`hasUsableDefault` 的一行条件），sqlite 侧保持原状，
两侧的 TSDoc 各留一条注释指明这处不对称的由来。

### 5. 实现中发现并修掉的**误拒**：关系列的外键别名写法

落地路径对关系列接受**三种**键：关系名 `team`、物理列名 `team_id`，以及 `metadata.foreignKeyNames`
里的 `teamId`（`assertKnownKeys` 与 `transformEntityValueToSql` 都认它）。契约初版只认前两种，
于是一行带 `teamId` 的远端行会被判成「缺 team」——**而它原本能一字不差地落进 `team_id`**。
把能落的行拒掉比不判还糟。

这一条在 **sqlite-core 侧同样存在**，且两侧**同改**：留一侧窄一格，就等于保留本故事要消灭的那种
「同一行在两个本地后端得到不同结论」。修法是 `queryCacheRelationAliases` + `hasRelationAlias`
两个小函数，两个包各一份，跨后端套件加一条用例（`ownerId` 写法算带齐）锁住两侧一致。

## 技术笔记

- 判定的输入是 `EntityMetadata` 的 `propertyMap` + `relationMap` + 行的键集，不需要 pglite 特有信息；
  `relationMap?` / `propertyMap?` 都按可选读，与同目录 `resolveQueryCacheTarget` 同口径——这条路径
  也会收到只带部分字段的 metadata 替身。
- 校验放在 `this.transaction(...)` **之外**：`RxDBAdapterPGlite.upsertMany` 原先把
  `resolveQueryCacheTarget` 与 `buildQueryCacheUpsertStatements` 都放在事务回调里，那样「一行都没落地」
  只是靠回滚兑现的，数据库已经为一个注定失败的批次开过一次事务。两者上提出事务后，AC#2 用
  `vi.spyOn(adapter, 'transaction')` + `not.toHaveBeenCalled()` 把这个接缝变成可自证的断言。
- `EntityPropertyMetadata` 是按 `type` 区分的联合：`primary` 只挂在其中几支上，必须先按 `type` 收窄再读
  `primary`；而 `property.type` 本身是「枚举成员 | 同名字符串字面量」的联合，`hasUsableDefault` 的形参
  取 `EntityPropertyMetadata['type']` 而非 `PropertyType`，否则 `tsc` 报 TS2345（vitest 只转译不查类型，
  测试全绿也拦不住——本故事实现中实际踩到）。
- `columnName` 缺省等于属性名（`metadata-transition.ts`），所以 `EntityBase.createdAt` 的物理列名就是
  `createdAt` 而非 `created_at`：写 fixture 时照 snake_case 猜会直接被契约拦下。
- 契约装上之后，`EntityBase` 的子类**再也走不到** `ON CONFLICT DO NOTHING` 那一支（带齐必填列必然有可更新列），
  该分支的用例改用一个只有 uuid 主键、不继承 `EntityBase` 的实体来覆盖。

## 实现文件

| 文件                                                                                                                                                          | 说明                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [packages/rxdb-adapter-pglite/src/query-cache/query_cache_row_contract.ts](../../../packages/rxdb-adapter-pglite/src/query-cache/query_cache_row_contract.ts) | 新增：PG 判据 + 校验 + `RxDBQueryCacheRowContractError`            |
| [packages/rxdb-adapter-pglite/src/query-cache/upsert_many_sql.ts](../../../packages/rxdb-adapter-pglite/src/query-cache/upsert_many_sql.ts)                   | 生成任何语句之前整批调用校验                                       |
| [packages/rxdb-adapter-pglite/src/query-cache/query_cache_target.ts](../../../packages/rxdb-adapter-pglite/src/query-cache/query_cache_target.ts)             | `QueryCacheTarget` 增 `entityName`（错误消息要点名实体）           |
| [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts](../../../packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts)                                       | `upsertMany` 的目标解析与语句构建上提出 `transaction()`（AC#2）    |
| [packages/rxdb-adapter-pglite/src/index.ts](../../../packages/rxdb-adapter-pglite/src/index.ts)                                                               | 导出三个新符号                                                     |
| [requirements/api-baseline/rxdb-adapter-pglite.json](../../api-baseline/rxdb-adapter-pglite.json)                                                             | 新增导出进基线                                                     |
| [packages/rxdb-adapter-sqlite-core/src/query-cache-row-contract.ts](../../../packages/rxdb-adapter-sqlite-core/src/query-cache-row-contract.ts)               | 外键别名误拒的对称修复（设计决策 5）                               |
| [packages/rxdb-test/src/query-cache-contract/](../../../packages/rxdb-test/src/query-cache-contract/)                                                         | 新增：跨后端契约套件 + fixture，走 `./query-cache-contract` 子路径 |
| [website/docs/collaboration/sync.md](../../../website/docs/collaboration/sync.md)                                                                             | AC#6：「哪些列可以省略」按后端拆开                                 |
| [requirements/capability-matrix.md](../../capability-matrix.md)                                                                                               | AC#6：缺口条目删除                                                 |

## 交付记录

- 实现完成 2026-09-12，AC#1～#6 全部 ✅。
- 用例：`query-cache-row-contract.spec.ts`（跨后端套件 + PG 专属两条分歧 + `default: null`）、
  `query-cache-metadata.spec.ts` 的「远端行的列契约（US-024）」describe（AC#1/#2 真机）、
  `upsert-many-sql.spec.ts`（F3 回归闸：异构分组保持绿）。
- 验证：`pnpm nx run-many -t lint typecheck test build --projects=rxdb-test,rxdb-adapter-pglite,rxdb-adapter-sqlite-core,rxdb-adapter-electron,rxdb-adapter-supabase` 全绿。

## References

- [US-022 QueryCache 远端行的列契约与缺列诊断](US-022-querycache-remote-row-contract.md)
- [capability-matrix 已知的需求覆盖缺口](../../capability-matrix.md#已知的需求覆盖缺口)
