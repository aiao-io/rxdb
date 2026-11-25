---
id: US-038
title: 双向一对一的实体能开同步：外键成环时推拉不再整体失败
status: Backlog
priority: Medium
epic: epic-004-future-features
created: 2026-11-25
updated: 2026-11-25
tags: [core, sync, relationship, one-to-one]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只动依赖图、拓扑排序与推拉顺序；前置 US-037（两者都改跨仓推送的排序，先收敛成一次全量级联，再在上面加回填相位）
- [x] Negotiable (可协商): 用可空外键断环还是让一对一的一侧只做导航、回填相位放在哪，留待实现前定
- [x] Valuable (有价值): 注册了一对双向一对一实体的库，今天所有仓库都推不上、拉不下
- [x] Estimable (可估算): 依赖边带可空标记 + 排序断环 + 推送加外键回填相位 + 环上没有可空边时的报错
- [ ] Small (小): 推送与拉取两条路径都要改，一个 PR 偏大
- [x] Testable (可测试): shop 夹具在真栈上可复现（见「现状」）
-->

# 用户故事：双向一对一的实体能开同步

## 作为/我想要/以便

**作为** 用关系模型做推拉同步的应用开发者
**我想要** 两个实体互相持有外键（双向一对一，例如 shop 夹具的 `User.idCard` ↔ `IdCard.owner`）时照样能推拉
**以便** 不必为了能同步把模型改成单向，也不会因为一处环让整个库的推拉全部失败

## 现状

1. [`buildDependencyGraph`](../../../packages/rxdb-plugin-sync/src/dependency-graph.ts) 认为一对一与多对一的外键都在声明的一侧，两侧都声明的一对一就成了两条方向相反的依赖边：

   ```ts
   // MANY_TO_ONE 和 ONE_TO_ONE 关系中，外键存储在当前实体侧
   if (relation.kind === RelationKind.MANY_TO_ONE || relation.kind === RelationKind.ONE_TO_ONE) {
   ```

   随后 [`detectCycles`](../../../packages/rxdb-plugin-sync/src/dependency-graph.ts) 抛 `Circular dependency detected`。它只跳过自引用（树），两个实体互指的环照抛。

2. 推送时每个仓库的级联都建全量依赖图（`pushWithCascade`），批量拉取（[`pullBatch`](../../../packages/rxdb-plugin-sync/src/pull-batch.ts)）与单仓拉取（`pullRepository`）也一样。所以库里只要注册了这样一对实体，所有仓库的推拉都会失败，与这对实体有没有数据无关。只有 `includeRelated: false` 的单仓推送不建依赖图（读代码得出，未实测）。

3. shop 夹具就是这种模型，远端两侧也都有外键（[`03-business-tables.sql`](../../../docker/sql/03-business-tables.sql)）：

   ```sql
   FOREIGN KEY ("ownerId") REFERENCES shop."user"(id) ON DELETE CASCADE      -- id_card_ownerId_fkey
   FOREIGN KEY ("idCardId") REFERENCES shop.id_card(id) ON DELETE SET NULL   -- user_idCardId_fkey
   ```

   另有复合外键 `user_id_card_owner_consistency_fkey`（`("idCardId", id)` → `id_card(id, "ownerId")`）。`User.idCardId` 可空、`IdCard.ownerId` 非空，所以存在合法的写入顺序：先写 User（`idCardId` 为空），再写 IdCard，最后补写 `User.idCardId`。shop 现有的适配器用例（`test-shop.spec.ts`、`test-many-to-many.spec.ts`）都是 `SyncType.None`，没有走过推拉。

复验方式（实测，用例未入库）：在本 checkout 的 Supabase 测试栈上注册 `@aiao/rxdb-test/shop` 的 `ENTITIES`、`SyncType.Full`，本地新建一个 User 后调 `push()`：结果的 `failures` 覆盖全部仓库（含系统表与两张中间表），错误都是 `Circular dependency detected: shop:IdCard -> shop:User -> shop:IdCard`，远端一行未写。再调 `pull()`，直接抛同一个错误。

## 范围边界

### In Scope

- 依赖图能断开环：环上至少有一条可空外键边时，断开这条边再排序，推送与拉取都不再抛错。
- 推送：同批新建互相引用的两行时，可空外键先置空写入，其余行落库后再补写这一列（例如 INSERT User → INSERT IdCard → UPDATE `User.idCardId`）。本地压缩已经把 INSERT 与后续 UPDATE 合成一条时，发送前照样拆开，不改本地变更日志。
- 拉取：同一事务内落库，事务结束时两侧引用一致。
- 删除：`ON DELETE SET NULL` 与 `CASCADE` 组合下，删除任意一侧都不被拒，两端结果一致。
- 环上没有可空外键（排不出顺序）时，报错指明环上的实体与关系，并提示把一侧改为可空；不在环上的仓库照常推拉。

### Out of Scope

- 声明顺序导致的跨仓推送顺序问题：归 [US-037](./US-037-push-order-by-foreign-key.md)。
- 要求部署方把约束改成 `DEFERRABLE`：不作为前提，见技术笔记。
- 三个及以上实体组成的环：机制相同，AC 只用两实体环验收。

## 验收标准

| #   | 前置条件                                | 操作                         | 预期结果                                                                       | 状态 |
| --- | --------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------ | ---- |
| 1   | 注册 shop 夹具全部实体，`SyncType.Full` | `push()` 与 `pull()`         | 都不抛 `Circular dependency`；没有变更的仓库正常返回                           | ⬜   |
| 2   | 本地同批新建互相引用的 User 与 IdCard   | `push()`                     | 远端两行都在，互相引用一致（含 `user_id_card_owner_consistency_fkey`），无被拒 | ⬜   |
| 3   | 客户端 A 完成 AC#2                      | 客户端 B `pull()`            | B 本地两行都在，互相引用一致                                                   | ⬜   |
| 4   | 两端都有 AC#2 的数据                    | A 删除 IdCard 并推送，B 拉取 | 远端与 B 本地的 `User.idCardId` 都为空，无被拒                                 | ⬜   |
| 5   | 两端都有 AC#2 的数据                    | A 删除 User 并推送，B 拉取   | 远端与 B 本地的 IdCard 一并消失                                                | ⬜   |
| 6   | 两个实体互相持有非空外键                | 首次 `push()`                | 报错指明环上的实体与关系；环外的仓库照常推送                                   | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：待实现。AC#1、#6 由 `rxdb-plugin-sync` 单测覆盖；AC#2～#5 由 `rxdb-adapter-supabase` 真栈用例在 shop 表上覆盖。

## 技术笔记

- 候选：依赖边带上「可空」标记（取自关系声明的 `nullable`）；拓扑排序遇到环时只断可空边；推送在 INSERT/UPDATE 相位之后追加一个外键回填相位，用 UPDATE 写回被断开的那一列。回填相位的依赖闸门同样随相位确定。
- 回填的 UPDATE 被拒（例如对端已删掉被引用的行）时，按 US-218 对齐。
- 备选：服务端把这类约束改成 `DEFERRABLE INITIALLY DEFERRED`。一次 `rxdb_mutations` 是一个事务，约束会延迟到提交时检查；但推送按仓库分多次调用 RPC，跨调用不在同一个事务里，还要求部署方改 DDL，不作首选。
- 另一条出路：让一对一的一侧只做导航、不持有外键。这会改实体模型与已有表结构，需要单独评审。
- 待核对：拉取在一个本地事务里落库，要确认 wa-sqlite / sqlite-wasm / PGlite 的本地表是否建了外键、在语句级还是提交时检查，这决定拉取侧要不要同样分步写入。

## 实现文件

- `packages/rxdb-plugin-sync/src/dependency-graph.ts`、`topological-sort.ts` — 依赖边的可空标记与断环
- `packages/rxdb-plugin-sync/src/push-repository.ts` — 外键回填相位
- `packages/rxdb-plugin-sync/src/pull-batch.ts`、`pull-repository.ts` — 拉取顺序
- `packages/rxdb-adapter-supabase/src/__tests__/` — shop 夹具真栈用例

## References

- [US-005 关系映射](./US-005-relationship-mapping.md) — 一对一、多对一的外键列来由
- [US-037 全量推送按外键依赖排序](./US-037-push-order-by-foreign-key.md) — 前置
- [US-227 dev-rxdb-supabase 关系数据的推拉同步演示](../adapter/US-227-supabase-relational-sync-demo.md) — 候选 AC#8 依赖本故事
