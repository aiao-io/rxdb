---
id: US-022
title: QueryCache 远端行的列契约与缺列诊断
status: Done
priority: Medium
epic: epic-004-future-features
created: 2026-08-27
updated: 2026-08-27
tags: [core, querycache, sqlite, contract, docs]
---

<!--
INVEST 检查清单:
- [x] Independent: 判定加在 `upsertMany` 落地之前，不依赖 US-021
- [x] Negotiable: 判定放在核心还是 sqlite-core、错误类型叫什么可议；「不做本地兜底」不可议（铁律）
- [x] Valuable: 今天的表现是一条指向后端从没听说过的列名的 SQLite 约束错误
- [x] Estimable: 一处列集校验 + 一个错误类型 + 两处文档
- [x] Small: 单次迭代内可完成
- [x] Testable: 断言错误类型与消息，并断言本地表未落半行
-->

# 用户故事：QueryCache 远端行的列契约与缺列诊断

## 作为/我想要/以便

**作为** 照着协议文档实现 QueryCache 远端（HTTP 后端、Supabase 视图、自研服务）的开发者
**我想要** 「一行要带哪些列」是白纸黑字的契约，缺了就在落地前被点名
**以便** 不必从 `NOT NULL constraint failed: public$recipes.createdAt` 反推——那列名在我的后端里根本不存在

## 问题现状

### 病灶：`upsertMany` 是裸 SQL 写，实体默认值不参与

QueryCache 的拉取落地走的是 `RxDBAdapterSqliteBase.upsertMany`
（[RxDBAdapterSqliteBase.ts](../../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts)），
文件里对这条路径已有自述注释：「`upsertMany` 是绕开仓储的裸 SQL 写（QueryCache 的拉取落地路径）」。

它的 INSERT 列清单是这么来的：

```ts
const dataColumns = Object.keys(data[0] as object);
```

**列清单取自远端行自己的键**。实体元数据在这条路径上一次都没被读过，于是
[entity-base.ts](../../../packages/rxdb/src/entity/entity-base.ts) 上的这条声明形同虚设：

```ts
{ name: 'createdAt', displayName: '创建时间', type: PropertyType.date, readonly: true, default: () => new Date() }
```

`default` 是**仓储层**的东西，裸 SQL 不经过仓储。而本地建表时 `createdAt` 没有 `nullable`，
建出来就是 NOT NULL。远端行不带 `createdAt` → INSERT 不含该列 → SQLite 拒绝。

### 病灶：文档的示例行本身就是会撞墙的那一种

[http-protocol.md](../../../website/docs/adapters/http-protocol.md) §2 明说返回「**完整行**」：

> **响应体**：数组，元素是**完整行**（含 `id`、`updatedAt` 及全部业务字段）。

而紧随其后的示例 JSON 是：

```json
[{ "id": "1111…", "title": "Pasta", "status": "published", "updatedAt": "2026-08-01T00:00:00.000Z" }]
```

**没有 `createdAt`**。「全部业务字段」这个措辞把基类的审计列排除在读者的理解之外了——
`createdAt` 不是业务字段，是框架列，而恰恰是它非空。照抄这个示例实现后端，第一次拉取就炸。

### 症状的诊断成本

错误从 SQLite 驱动冒出来，形如 `NOT NULL constraint failed: public$recipes.createdAt`。
它同时具备三个误导性：表名是加了命名空间前缀的**本地**表名、列名在**远端**的 schema 里不存在、
调用栈落在适配器内部而不是那次 `find()`。读者第一反应是「本地表建错了」。

### 复验方式

源码实证：`upsertMany` 的 `dataColumns` 取值、`EntityBase` 的 `createdAt` 声明、
`http-protocol.md` §2 的示例三处互相印证。现场佐证见
[US-214 落地发现](../adapter/US-214-http-browser-demo.md#落地发现)——该 demo 的后端因此必须
在种子数据里显式带 `createdAt`。

## 范围边界

### In Scope

- QueryCache 拉取落地前校验远端行的列集，缺非空列时抛可诊断错误
- 校验覆盖**整批**行，不止 `data[0]`
- `http-protocol.md` 的「完整行」定义与示例补齐基类列
- [sync.md](../../../website/docs/collaboration/sync.md) 的 QueryCache 一节写明这条契约——
  它对所有 QueryCache 远端成立，不是 HTTP 专属（见 D3）

### Out of Scope

- **不给缺列做本地兜底**（铁律「无 fallback 兜底」）。就地 `new Date()` 补一个 `createdAt`
  等于把本地时钟伪造成远端的权威值，两台机器拉同一行会得到不同的 `createdAt`
- **不改 `EntityBase` 的字段声明**——把 `createdAt` 改成 nullable 会波及所有非 QueryCache 场景
- 不做列**类型**校验（数字列收到字符串之类），本故事只判「缺不缺」
- 不改 `upsertMany` 的 upsert 语义与批量分片逻辑

## 设计决策

### D1 — fail-fast，不补默认值

三个候选：本地 `default` 补齐 / 落地前 fail-fast / 允许实体把基类列改成 nullable。

选二。理由不是「铁律禁止兜底」这一句话本身，而是它在这儿的具体后果：`createdAt` 补出来的是
**本机拉取的时刻**，不是记录被创建的时刻；不同设备、同一行会拿到不同的值，而这个值还会随
下一次 upsert 被覆盖或不被覆盖（取决于 upsert 子句是否包含该列）。这是一个会长期沉默、
在跨设备对比时才暴露的数据污染。

候选三（实体可把基类非空列声明为 nullable）不是本故事的替代方案，而是**它的后续**：
当远端确实没有这一列时，用户需要一条出路。这条出路是否可行、`@Property` 能否覆盖基类字段元数据，
**由实现阶段回答并记入技术笔记**；如果不可行，另开故事。

### D2 — 判在落地前，不靠捕获 SQLite 错误再翻译

翻译错误消息要靠匹配驱动的字符串（`NOT NULL constraint failed: <table>.<column>`），
而 wa-sqlite / sqlite-wasm / node:sqlite / PGlite 的措辞各不相同——那是一张要跟着五个驱动版本
一起维护的正则表。落地前按元数据算出「必须有哪些列」再比对，与驱动无关。

### D3 — 契约文档归 `sync.md`，协议文档只做引用

这条约束由 QueryCache 的落地路径产生，Supabase 远端走同一个 `upsertMany`，同样成立。
写死在 `http-protocol.md` 里会让 Supabase 用户读不到，也会在将来新增远端时被漏掉。
`http-protocol.md` 保留示例修正与一句指回 `sync.md` 的链接。

## 验收标准

| #   | 前置条件                                                       | 操作                           | 预期结果                                                                                                     | 状态 |
| --- | -------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | QueryCache 实体，远端返回的行缺 `createdAt`                    | 触发一次拉取                   | 抛出点名实体、缺失列名、以及「该列由 `EntityBase` 声明且非空」的错误；**不是** SQLite 的约束错误             | ✅   |
| 2   | 同 AC#1                                                        | 检查本地表                     | 这一批一行都没落地，不留半批脏数据                                                                           | ✅   |
| 3   | 远端行**多带**了本地没有的列                                   | 触发一次拉取                   | 行为与本故事之前一致（多余列按既有逻辑处理），不因新校验而报错                                               | ✅   |
| 4   | 远端返回**异构行集**：第 1 行带 `tag`，第 2 行不带             | 触发一次拉取                   | 被判定为缺列并报错，不因 `Object.keys(data[0])` 只看首行而漏过                                               | ✅   |
| 5   | 远端行列集完整                                                 | 触发一次拉取                   | 落地成功；行为与本故事之前逐值一致                                                                           | ✅   |
| 6   | 文档                                                           | 读 `sync.md` QueryCache 节     | 写明「远端行必须带齐本地表的全部非空列，含 `EntityBase` 的 `createdAt` / `updatedAt`」，并说明为何不补默认值 | ✅   |
| 7   | 文档                                                           | 读 `http-protocol.md` §2/§3/§4 | 「完整行」的定义不再只说「全部业务字段」；示例 JSON 含 `createdAt`；有一句指回 `sync.md`                     | ✅   |
| 8   | [dev-rxdb-supabase](../../../apps/dev-rxdb-supabase/) 既有用例 | 跑其测试                       | 不回退——Supabase 远端走同一条落地路径，本校验不得误伤                                                        | ✅   |
| 9   | 实现完成                                                       | 跑门禁                         | 受影响包覆盖率不回退；新增导出（错误类型）补 TSDoc 并进 api-baseline                                         | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

AC#1/#2/#4/#5 由 [RxDBAdapterSqliteBase.spec.ts](../../../packages/rxdb-adapter-sqlite-core/src/__tests__/RxDBAdapterSqliteBase.spec.ts)
里走真 `upsertMany` 的三条用例证实（AC#2 断言客户端一条 `INSERT INTO` 与一条 `BEGIN` 都没收到）；
判据本身另有 18 条纯函数用例。AC#8 跑的是
`rxdb-adapter-{wa-sqlite,sqlite-wasm,sqliteai,electron,tauri,supabase,pglite}` 与 `dev-rxdb-supabase`
共 8 个项目，全绿（`Tests 685 / 767 / 35 / 659 / 568 / 47 / 1011 / 6` 全过）。
AC#9 的门禁：`lint typecheck test build` 全绿，`Tests 1067 passed (47 files)`，
覆盖率 96.3% stmts / 91.49% branches / 96.09% funcs / 97.22% lines。

## 技术笔记

- 「必须有哪些列」的判据是**本地表**的非空列集，不是实体的全部字段：可空列缺了没事。
  实现时注意 `columnNames`（字段名 → 列名映射）已在 `#resolveQueryCacheTarget` 里拿到。
- AC#4 的异构行集今天的表现是**绑 `undefined`** 而不是报错——`data[0]` 定了列清单，
  后续行按同一批键取值，取不到就是 `undefined`。落到 SQLite 上是 NULL，可空列因此被静默清空。
  这是同一处代码的相邻风险，一并收口（此段为源码推演，**推断**，实现时以用例证实）。
- 判定放核心包还是 `rxdb-adapter-sqlite-core`：契约是 QueryCache 的（核心概念），
  但可执行的判据（本地表的非空列集）在 sqlite-core 手里。倾向后者，实现时定。
- 别把这条校验塞进 `metadata-validate`：远端行的形状是运行期才知道的，不是元数据（对照 US-021 D1）。

### 设计结论

- **判定落在 `rxdb-adapter-sqlite-core`**（D1 遗留的取舍，此处定案）。契约本身是 QueryCache 的
  概念，但可执行的判据是「`create_table_sql.ts` 会把哪些列建成 NOT NULL 且不给 DEFAULT」——
  那是各后端各自的规则（PGlite 的 DDL 就不同）。判据逐条对齐
  `create_table_column_sql`，模块 TSDoc 里写明两处必须同改。
- **D1 留的那条出路可行**：子类重声明基类属性即可覆盖。`metadata-transition.ts:158-166` 按
  「最远祖先在前、自身在最后」遍历后 `propertyMap.set(cloned.name, cloned)`——同名属性是
  **整条替换**而非逐字段合并。于是 `{ name: 'createdAt', type: date, nullable: true }` 写在子类上，
  本地表就建成可空，本校验也随之豁免（判据只读 `propertyMap`，与 DDL 同源）。
  **代价**：整条替换意味着基类的 `readonly: true` 与 `default: () => new Date()` 一并消失，
  抄漏了不会有任何提示。已用例固定这两点。要把它变成一条**推荐**给用户的出路，
  还需要文档与「覆盖时保留哪些字段」的守卫，另开故事。
- `EntityPropertyMetadata` 是按 `type` 区分的联合，`primary` 只挂在其中几支上：必须先按 `type`
  收窄再读 `primary`，反过来写 `tsc` 直接报 TS2339（vitest 只转译不查类型，测试全绿也拦不住）。
- **PGlite 侧仍有同族缺口**：`query-cache/upsert_many_sql.ts` 已处理批内异构（`groupByColumnSet`）
  与未知键（`assertKnownKeys`），但**不**检查缺非空列。本故事的实现文件表只列 sqlite-core，
  故未一并改；补齐宜另开故事，判据要按 PostgreSQL 的 DDL 规则重写而非照抄。
- 校验放在 `this.transaction(...)` **之外**：事务体里抛错要靠 ROLLBACK 才回到干净状态，
  而这一批本来一行都不该被尝试写入。判据只要元数据与行的键集，是同步的，不必进事务。

## 实现文件

| 文件                                                                                                                                            | 说明                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [packages/rxdb-adapter-sqlite-core/src/query-cache-row-contract.ts](../../../packages/rxdb-adapter-sqlite-core/src/query-cache-row-contract.ts) | 新增：必需列判据 + 校验 + `RxDBQueryCacheRowContractError` |
| [packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts](../../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts)       | `upsertMany` 落地前调用校验；目标解析上提出事务            |
| [packages/rxdb-adapter-sqlite-core/src/index.ts](../../../packages/rxdb-adapter-sqlite-core/src/index.ts)                                       | 导出三个新符号                                             |
| [requirements/api-baseline/rxdb-adapter-sqlite-core.json](../../api-baseline/rxdb-adapter-sqlite-core.json)                                     | AC#9：新增导出进基线                                       |
| [website/docs/collaboration/sync.md](../../../website/docs/collaboration/sync.md)                                                               | AC#6：契约正文                                             |
| [website/docs/adapters/http-protocol.md](../../../website/docs/adapters/http-protocol.md)                                                       | AC#7：示例修正 + 指回 `sync.md`                            |

## References

- [US-020 将 QueryCache 接入统一 Repository](./US-020-querycache-repository.md) — 落地路径的来历
- [US-214 HTTP 适配器浏览器端到端 demo](../adapter/US-214-http-browser-demo.md) — 本条在该 demo 开发中被踩中，见其产物缺陷记录
- [US-021 QueryCache 远端适配器缺席时配置期 fail-fast](./US-021-querycache-adapter-fail-fast.md) — 同一批出自 US-214 的核心侧诊断缺口
