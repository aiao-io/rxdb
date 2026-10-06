---
id: US-030
title: 实体元数据层的声明式存储约束
status: Backlog
priority: Low
epic: epic-004-future-features
created: 2026-09-22
updated: 2026-10-06
tags: [core, schema, integrity]
---

# 用户故事：实体元数据层的声明式存储约束

## 作为/我想要/以便

**作为** 实体模型作者
**我想要** 在 `@Entity` 元数据里声明 CHECK、条件唯一、区间排他与生成列
**以便** 业务不变量落在存储层，而不是只活在仓储方法里

## 交付阶段

| 阶段 | 内容                                                           | 状态 |
| ---- | -------------------------------------------------------------- | ---- |
| A    | 属性级与实体级 CHECK 约束                                      | ⬜   |
| B    | 条件唯一索引（`where`）与表达式索引                            | ⬜   |
| C    | 区间排他约束：PG `EXCLUDE` + SQLite 触发器等价物，错误语义统一 | ⬜   |
| D    | 生成列（generated column）与索引方法（GIN / GiST）声明         | ⬜   |

## 范围边界

### In Scope

- `EntityMetadataOptions` 增 `checks`；`EntityIndexMetadataOptions` 增 `where` / `expression` / `method`
- 每项能力在 SQLite family 与 PGlite 上**要么都支持、要么显式声明不支持**，不做静默降级
- 无原生能力的后端（SQLite 的 `EXCLUDE`）用触发器补齐，且两侧抛同一个错误码
- 违约错误进 `RxDBError` 体系，携带冲突列与冲突值

### Out of Scope

- 插件自有的写入期触发器（图可达性这类跨行判定）——机制已有先例，见技术笔记
- 跨行聚合（位号计数、替代组概率合计、工序分摊合计、ECN 整批校验）——落在 BOM 头的 `draft → released` 发布转移上，见技术笔记
- 跨表断言（ASSERTION）与延迟约束
- 远端适配器（`supabase` / `http`）的约束下沉——那侧的 DDL 不由本仓掌控

## 验收标准

| #   | 前置条件                     | 操作                   | 预期结果                               | 状态 |
| --- | ---------------------------- | ---------------------- | -------------------------------------- | ---- |
| 1   | 属性声明 CHECK               | 写入越界值             | 两个后端均拒绝，错误码与消息骨架一致   | ⬜   |
| 2   | 实体级 CHECK「两字段二选一」 | 两字段同时给值         | 拒绝                                   | ⬜   |
| 3   | 索引声明 `where`             | 写入不满足条件的重复行 | 不被唯一约束误拒                       | ⬜   |
| 4   | 区间排他约束                 | 插入重叠区间           | 两个后端均拒绝，错误指出冲突区间       | ⬜   |
| 5   | 声明生成列 + GIN             | 按该列过滤             | 走索引；原字段的读写方式不变           | ⬜   |
| 6   | 后端不支持某项声明           | `init()`               | 建元数据期抛错，不静默降级为应用层校验 | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**当前 DSL 一项都没有。** [`EntityMetadataOptions`](../../../packages/rxdb/src/entity/entity-options.interface.ts) 的字段集是
`namespace` / `name` / `tableName` / `displayName` / `extends` / `repository` / `log` / `sync` / `abstract` /
`properties` / `computedProperties` / `relations` / `indexes` / `foreignKeys` / `features` / `permissions` / `manualOrder` —— 没有 CHECK 的落点。
[`EntityIndexMetadataOptions`](../../../packages/rxdb/src/entity/property-types.interface.ts) 的自有字段只有两项，
`unique` 来自它继承的 `IEntityObject`：

```ts
export interface EntityIndexMetadataOptions extends IEntityObject {
  properties?: string[];
  normalized?: boolean;
}
```

`normalized` 是本仓已经为「唯一约束在存储层拦不住」付过一次代价的证据——它解决的正是
「NULL 让唯一索引整条失效」与「大小写变体绕过重名校验」。本故事是同一类问题的通解。

**阶段 C 的双后端等价是最贵的一段。** PGlite 有 `daterange` + GiST `EXCLUDE`；SQLite 没有，
必须用触发器补。触发器生成在本仓有现成先例——FTS 按方言各有一份生成器：PGlite 的
[`fts/build-fts-triggers.ts`](../../../packages/rxdb-adapter-pglite/src/fts/build-fts-triggers.ts) 与 SQLite 共享层的
[`fts5/build-fts-triggers.ts`](../../../packages/rxdb-adapter-sqlite-core/src/fts5/build-fts-triggers.ts)。可复用的是**机制**，不是那份 SQL。

**插件自有触发器不在本故事内。** 图可达性这类判定要读整张边表，装不进声明式约束；
它按 FTS 的先例由插件自己发 DDL，归 [US-509](../plugin/US-509-bom-dag-cycle-detection.md)。
本故事只负责「元数据能表达的约束」这一层。

**跨行聚合也不是 CHECK 的消费方。** CHECK 只看单行；「位号数 = `qty`」「概率合计为 1」这类聚合若逐行校验，
第一条录入就必然失败，合法聚合永远建不出来。epic-009 把它们统一放在 `bom_header` 的 `draft → released` 状态转移上，
由插件触发器整组校验（[US-507](../plugin/US-507-bom-graph-skeleton.md) AC#5 / #10），与图可达性同属插件自有触发器，不进本故事。

## 价值待证

本故事**价值待证**：今天没有任何已交付故事因缺这四项能力而出缺陷——
`normalized` 已经单点解决了实际踩到的那一个。

消费方目前全部集中在 [epic-009](../../epics/epic-009-bom-domain-model.md)：
阶段 A 被 US-511 AC#7 / #12、US-513 AC#5、US-518 AC#4、US-509 AC#2 消费；
阶段 B、C 被 US-507 AC#9、US-508 AC#2、US-518 AC#5（日期 × 序列 × 批次的多维排他）与 US-524 AC#3 消费；
阶段 D 被 US-519 AC#3 / #7 消费——那里的 GIN 与生成列是按后端能力启用的**优化**，US-519 的查询契约不依赖它们，
后端缺某项索引能力时按 AC#6 显式声明不支持该索引，而不是让 SQLite 上整个扩展属性不可用。

**解锁条件比 epic-009 低一档**：任意一条需要「不变量在存储层成立」的故事即可解锁，
不限 BOM 场景。本故事单列的理由也在这里——它的价值不依赖 BOM，
把它埋在 BOM Epic 里会让这四项引擎缺口只能等 BOM 的驱动场景。

## 实现文件

- `packages/rxdb/src/entity/` — 元数据接口与校验
- `packages/rxdb-adapter-sqlite-core/` — SQLite family 的 DDL 与触发器等价物
- `packages/rxdb-adapter-pglite/` — PG 侧 DDL

## References

- [epic-004 未来功能](../../epics/epic-004-future-features.md)
- [epic-009 BOM 领域模型](../../epics/epic-009-bom-domain-model.md) — 当前全部消费方
- [`EntityIndexMetadataOptions`](../../../packages/rxdb/src/entity/property-types.interface.ts) — 现有索引声明面
