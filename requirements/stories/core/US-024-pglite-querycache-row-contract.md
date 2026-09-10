---
id: US-024
title: PGlite 侧 QueryCache 远端行的列契约
status: Backlog
priority: Medium
epic: epic-004-future-features
created: 2026-09-05
updated: 2026-09-05
tags: [core, querycache, pglite, contract]
---

<!--
INVEST 检查清单:
- [x] Independent: 只动 pglite 的 upsert 构建器，不依赖任何未关闭故事
- [x] Negotiable: 校验函数是复用 sqlite-core 的导出还是抽到 core 可议；「不做本地兜底」不可议（铁律）
- [x] Valuable: 今天 PGlite 后端缺列时抛的是 Postgres 的 `null value in column ... violates not-null constraint`，列名是本地表的，远端实现者对不上号
- [x] Estimable: 一处落地前校验 + 一条契约测试 + 一处文档
- [x] Small: 单次迭代内可完成
- [x] Testable: 断言错误类型与消息，并断言本地表未落半行
-->

# 用户故事：PGlite 侧 QueryCache 远端行的列契约

> [US-022](US-022-querycache-remote-row-contract.md) 在 sqlite-core 侧定义了「远端一行必须带哪些列」的契约与缺列诊断
> （`assertQueryCacheRowContract`）。PGlite 是 QueryCache 的另一个本地行缓存后端，走的是自己的
> [upsert_many_sql.ts](../../../packages/rxdb-adapter-pglite/src/query-cache/upsert_many_sql.ts)，**同一份契约在这条路上没有执行**。
> 本故事把它补齐；契约本身不改，见 US-022「设计决策」。

## 作为/我想要/以便

**作为** 用 PGlite 当 QueryCache 行缓存、对着协议文档实现远端的开发者
**我想要** 远端少给一列时，在落地前收到与 sqlite-core 同一种错误、同一份列清单
**以便** 不必从 Postgres 的 not-null 约束错误反推是哪一列、也不必按后端分别学两套诊断

## 问题现状

[upsert_many_sql.ts](../../../packages/rxdb-adapter-pglite/src/query-cache/upsert_many_sql.ts) 的 `buildQueryCacheUpsertStatements`
只做两件事：`assertKnownKeys` 拒绝**多出来**的列，再按归一化后的列集把行分组成多条 INSERT。它**不看**列是否
`nullable: false` 且无字面量 `default`——一行少了这样的列，只会让该组的列清单少一项，错误留给 Postgres 在执行时抛。
sqlite-core 侧同样的输入在 `RxDBAdapterSqliteBase.upsertMany` 落地前就被 `assertQueryCacheRowContract` 点名。
能力矢量在 [capability-matrix「已知的需求覆盖缺口」](../../capability-matrix.md#已知的需求覆盖缺口) 登记了这条不对称。

## 范围边界

### In Scope

- `buildQueryCacheUpsertStatements` 在生成任何 SQL 之前，对每一行执行与 sqlite-core **同一份**列契约判定
- 缺列时抛出与 US-022 同类型、同消息形态的错误，且**不落任何一行**（同批次整体拒绝，不做部分成功）
- 契约测试复用 US-022 的 fixture 形态，跑在真实 `RxDBAdapterPGlite` 上
- `website/docs` 的 QueryCache 行契约一节补一句「SQLite family 与 PGlite 判定一致」

### Out of Scope

- 改契约本身（可省略列的定义、binary 例外）——那是 US-022 的裁决
- 用实体 `default` 在本地补值（铁律：不做本地兜底）
- 远端未知列的处理（`assertKnownKeys` 已覆盖）

## 验收标准

| #   | 前置条件                                                           | 操作                                       | 预期结果                                                                                              | 状态 |
| --- | ------------------------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ---- |
| 1   | PGlite 作 QueryCache 本地端，实体含 `nullable: false` 无默认值的列 | 远端返回一行缺该列，触发 `upsertMany`      | 落地前抛 US-022 定义的契约错误，消息列出缺失列名与实体名；本地表行数不变                              | ⬜   |
| 2   | 同上                                                               | 同一批次里一行完整、一行缺列               | 整批拒绝，完整的那行也不落地                                                                          | ⬜   |
| 3   | 实体含带字面量 `default` 的列                                      | 远端行省略该列                             | 通过契约判定，行为与 US-022 在 sqlite-core 侧一致                                                     | ⬜   |
| 4   | 实体含 `binary` 列                                                 | 远端行省略该列                             | 按 US-022 的 binary 例外处理，与 sqlite-core 侧一致                                                   | ⬜   |
| 5   | sqlite-core 与 pglite 两个后端                                     | 跑同一份契约 fixture                       | 两个后端的错误类型与消息形态逐字一致（共享测试套件，不复制第二份断言）                                | ⬜   |
| 6   | —                                                                  | 读 `website/docs` 的 QueryCache 行契约一节 | 明示 SQLite family 与 PGlite 判定一致；[capability-matrix](../../capability-matrix.md) 该缺口条目删除 | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- 判定函数今天导出自 `@aiao/rxdb-adapter-sqlite-core`（`assertQueryCacheRowContract`）。pglite 包**不应**依赖 sqlite-core；
  两条路：把契约判定抽到 `@aiao/rxdb`（两个 adapter 都已依赖它），或在 pglite 包内按同一份规则实现并用 AC#5 的共享套件钉死一致。
  首选前者——「同一份」是靠单一实现保证，不是靠两份实现互相对齐。
- 判定的输入是实体 `EntityMetadata` 的 `propertyMap` + 归一化后的行键集，与 sqlite-core 侧相同，不需要 pglite 特有信息。
- 错误必须在 `transaction()` 开始之前抛出，避免开一个注定回滚的事务。

## 实现文件

- `packages/rxdb-adapter-pglite/src/query-cache/upsert_many_sql.ts` — 落地前调用契约判定
- `packages/rxdb/src/` 或 `packages/rxdb-adapter-sqlite-core/src/query-cache-row-contract.ts` — 判定函数的最终归属（见技术笔记）
- `packages/rxdb-test/` — 跨后端共享的契约 fixture
- `website/docs/` — QueryCache 行契约一节

## References

- [US-022 QueryCache 远端行的列契约与缺列诊断](US-022-querycache-remote-row-contract.md)
- [capability-matrix 已知的需求覆盖缺口](../../capability-matrix.md#已知的需求覆盖缺口)
