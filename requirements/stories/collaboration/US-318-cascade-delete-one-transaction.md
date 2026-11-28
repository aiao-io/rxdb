---
id: US-318
title: 本地外键级联删除与源删除记进同一个事务：一次撤销整组恢复，互相引用的也撤得回来
status: Done
priority: High
epic: epic-016-local-change-workbench
created: 2026-11-26
updated: 2026-11-27
tags: [collaboration, history, undo-redo, sqlite, bug]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只改删除时变更的事务归属；撤销 / 重做的应用逻辑、推送压缩不变
- [x] Negotiable (可协商): 在删除入口开事务，还是在适配器里给级联写入补事务号，留待实现时定
- [x] Valuable (有价值): 删掉一位带证件的客户之后撤销直接报错、撤销栈卡死；不带证件的也要撤好几次
- [x] Estimable (可估算): 删除入口的事务包装 + 各本地适配器的一致性用例 + 历史插件单测
- [x] Small (小): 一个 PR
- [x] Testable (可测试): 适配器一致性套件 + 插件单测
-->

# 用户故事：级联删除记进同一个事务

## 作为/我想要/以便

**作为** 删除一条带子记录的数据、又想撤回的用户
**我想要** 删除父记录时，本地外键级联删掉（或置空）的子记录与它记在同一个事务里
**以便** 点一次撤销就把整组按删除前的样子恢复，不会撤到一半报错、也不用连点好几次

## 背景（改动之前）

1. 变更由 SQLite 触发器记录，事务号在生成触发器时写进去（[`generate_table_trigger_sql`](../../../packages/rxdb-adapter-sqlite-core/src/table/trigger_sql.ts) 的 `transactionId` 选项）。单条删除不在事务里，外键级联在子表上触发的删除也就各记各的，没有事务号。
2. 删除客户之后的历史（dev 栈访客的订单页：客户带证件、一张订单、一条订单项、订单项挂一个分类），`history().histories$` 最新在前：

   ```text
   DELETE DemoCustomer                (no tx)
   DELETE DemoOrder                   (no tx)
   DELETE DemoOrderItem               (no tx)
   DELETE DemoCategory_DemoOrderItem  (no tx)
   DELETE DemoIdCard                  (no tx)
   ```

   一次用户操作变成五个历史项，源删除排在最后、最先被撤销。

3. 撤销第一步就失败，而且卡死：插回的客户还带着 `idCardId`，那张证件要到第五步才回来，提交时外键检查不过：

   ```text
   RxDBAdapterSqliteError: switch branch main failed
     cause: wa-sqlite execute() failed for SQL "COMMIT;": FOREIGN KEY constraint failed
   ```

   可撤销数不变，再点还是这一步。`undo(5)` 一次撤五步时五条逆变更在同一个事务里，提交时外键满足，整组恢复——印证问题在事务归属，不在逆变更本身。

复验方式：dev 栈以访客打开订单页（访客的订单只存本机，不碰远端），按上面建数据后删除客户；读 `rxdb.versionManager.history().histories$`，调 `history().undo()` 看报错与 cause，再调 `history().undo(5)` 看恢复。

## 范围边界

### In Scope

- 删除会级联（`CASCADE`）或置空（`SET NULL`）子记录时，源删除与子记录的变更记在同一个事务里，历史里是一个事务项。
- `remove()` 与 `removeMany()` 都覆盖；本来就在事务里的删除不受影响。
- 撤销一次恢复整组；重做一次再整组删掉；推送时远端收到的删除与现在一致（US-224 的远端级联语义不变）。
- 各本地适配器（wa-sqlite、sqlite-wasm、node SQLite，PGlite 若同样按外键级联）跑同一组一致性用例。

### Out of Scope

- 让撤销自动把跨步骤的外键依赖排好序：事务归属对了就不需要。
- 远端的级联删除日志：US-224 已覆盖。

## 验收标准

| #   | 前置条件                                             | 操作                     | 预期结果                                                           | 状态 |
| --- | ---------------------------------------------------- | ------------------------ | ------------------------------------------------------------------ | ---- |
| 1   | 客户有证件、一张订单、一条订单项、订单项挂了一个分类 | 删除客户                 | 历史里是一个事务项，含客户、订单、订单项、关联行与证件的删除       | ✅   |
| 2   | 同上                                                 | `undo()` 一次            | 五行全部按删除前的样子回来，没有外键错误                           | ✅   |
| 3   | 撤销之后                                             | `redo()` 一次            | 五行再一起删掉                                                     | ✅   |
| 4   | 客户有证件                                           | 只删证件，再撤销         | 证件删除与客户证件引用的置空在同一个事务里；撤销后两边都恢复       | ✅   |
| 5   | 登录身份删客户后推送                                 | 另一个浏览器拉取         | 远端与对端的结果与现在相同：客户、订单、订单项、证件、关联行都不在 | ✅   |
| 6   | —                                                    | 各本地适配器的一致性套件 | 通过                                                               | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：

- AC#1～#4、#6：`packages/rxdb-adapter-sqlite-core/src/__tests__/shared-cascade-mutation.suite.ts` 的「级联写入与源删除记成一个事务（US-318）」，各 SQLite 适配器入口复用（`pnpm nx run-many -t test --projects=rxdb-adapter-sqlite-core,rxdb-adapter-wa-sqlite,rxdb-adapter-sqlite-wasm,rxdb-adapter-sqlite,rxdb-adapter-sqliteai,rxdb-adapter-electron`）；PGlite 的同一组断言在 `packages/rxdb-adapter-pglite/src/__tests__/cascade-delete-transaction.spec.ts`；`packages/rxdb/src/__tests__/schema/SchemaManager.spec.ts` 守 `isReferenced`。
- AC#1、#2：真栈上 `apps/dev-rxdb-supabase-e2e/src/orders-sync.spec.ts` 的「US-231 AC#12～#14」用例——删掉有证件、订单、订单项与分类关联的客户，点一次撤销全部回来。
- AC#5：同一用例再删一次并推送，Bob 拉取后客户、订单、订单项与关联都不在了、分类还在；按 README 起栈后 `pnpm nx run dev-rxdb-supabase-e2e:e2e-remote`。

## 技术笔记

- 两条路：删除入口检测到实体有 `CASCADE` / `SET NULL` 的子关系时开一个事务再删（触发器随事务带上事务号，与 `saveMany` 同一机制）；或者所有删除都走事务。前者改动面小，后者口径简单，实现前比一下单条删除的开销再定。
- 级联由数据库执行，RxDB 不知道删掉了哪些子行——不改成在 JS 里逐个删子行，那会和数据库的外键动作重复。
- 推送压缩已经按事务处理（`saveMany` 的路径），归进事务之后推送载荷的形状不变；US-037 的子在前删除排序照旧。

## 实现文件

- `packages/rxdb/src/entity/` — 删除入口的事务包装（`remove` / `removeMany`）
- `packages/rxdb-adapter-sqlite-core/src/` — 如需在适配器侧补事务号
- `packages/rxdb-adapter-sqlite-core/src/__tests__/shared-cascade-mutation.suite.ts` — 一致性用例
- `packages/rxdb-plugin-history/src/__tests__/` — 撤销用例

## References

- 使用方：[US-231](../adapter/US-231-supabase-unified-undo-history.md) 阶段 B 的订单撤销；整体方案见 [epic-016](../../epics/epic-016-local-change-workbench.md)
- [US-224 远端级联删除的变更日志](../adapter/US-224-supabase-cascade-delete-change-log.md)、[US-038 双向一对一](../core/US-038-bidirectional-one-to-one-sync.md)、[US-302 撤销/重做](US-302-undo-redo.md)
