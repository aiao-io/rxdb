---
id: US-034
title: 分区实体的本地写入：本地增删改可撤销/重做，推送后锁定
status: Backlog
priority: High
epic: epic-015-identity-scoped-sync
created: 2026-11-25
updated: 2026-11-25
tags: [core, sync, push, undo-redo, bucket, supabase]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 不依赖 US-037 / US-229；只放开分区实体的本地写入，沿用现有的推送、回执与撤销机制
- [x] Negotiable (可协商): 访客写入口的处理、冲突提示的形式留待实现时定
- [x] Valuable (有价值): 商品今天只能由「模拟服务端变更」直写远端，本地改不了、也撤销不了
- [x] Estimable (可估算): 实体写权限 + 推送链路核对 + 商品面板的写入与撤销/重做 + 真栈与组件测试
- [x] Small (小): 一个 PR
- [x] Testable (可测试): 历史插件单测 + Supabase 真栈 + demo 组件单测
-->

# 用户故事：分区实体的本地写入

## 作为/我想要/以便

**作为** 在租户里管理商品的登录成员
**我想要** 在本地新建、编辑、删除商品，推送之前可以撤销、重做，推送之后这些修改就不能再撤销
**以便** 离线也能改、改错了能退回，推送到远端的修改成为团队共享的结果

## 现状

1. demo 的商品增删改全部绕开本地。[`catalog-remote.ts`](../../../apps/dev-rxdb-supabase/src/app/catalog/catalog-remote.ts) 直接用 supabase-js 写远端业务表：

   ```ts
   expectAffected(await client.from('catalog_items').update(changes).eq('id', id).select('id'), '编辑');
   ```

   本地库只经同步拉取落库，拉取写入时关闭本地触发器，所以本地没有这些修改的 `RxDBChange`，撤销/重做无从谈起。

2. 本地入口不允许写。[`CatalogItem`](../../../packages/rxdb-test/entities/CatalogItem.ts) 的三项写权限都只许系统写：

   ```ts
   permissions: { create: 'system', update: 'system', delete: 'system' },
   ```

3. 远端分区日志不带正文，这是有意的：[`rxdb_log_change_trigger`](../../../docker/sql/02-rxdb-sync-functions.sql) 对分区实体写 `CASE WHEN v_is_bucketed THEN NULL ELSE v_patch END`，`rxdb_strip_bucket_change_payload` 再兜底剥掉正文。依据见 [US-033 的试验记录](./US-033-bucket-log-spike.md)。本故事不改这条规则，远端的完整变更历史归 [US-229](../adapter/US-229-supabase-change-history.md)。

4. 推送分区实体的服务端一侧已经具备：[`rxdb_insert_changes`](../../../docker/sql/04-rxdb-utils-functions.sql) 按写后的行算区——「分区日志的 bucket 只认服务端状态，载荷里的 bucket 字段一律不认」；成员的写权限由 `catalog-demo.sql` 的 `catalog_items_member_insert` / `_update` / `_delete` 策略按 `tenantId` 判定。

5. 「推送后不能再撤销」已经成立：`SyncManager.push` 在 `pushed > 0` 时清空撤销历史；拉取到远端变更后，撤销历史同样失效（`historyInvalidated`）。

6. [US-033](./US-033-identity-scoped-read-sync.md) 把写入列为范围外，并预留了本故事编号：「推送时服务端按写后的行算区并记进对应区的日志、离线写、冲突，以及被移出某个区时本机未推送修改的处理」。

复验方式：第 1、2、4 点 grep 对应符号；第 3 点在 dev-rxdb-supabase 以 Alice 身份打开商品目录，用「模拟服务端变更」编辑一件商品，在 Studio 里看 `rxdb_change`：新行的 `bucket` 是 `tenant:xinghe`，`patch` / `inversePatch` / `beforeData` / `afterData` 都为空。第 5 点读 `SyncManager.push` 得出。

## 范围边界

### In Scope

- `CatalogItem` 允许本地新建、编辑、删除；写入产生带 `patch` / `inversePatch` 的 `RxDBChange`，可用 `versionManager.history(CatalogItem)` 撤销、重做。
- 推送：经现有的 `rxdb_mutations`，由服务端按写后的行算区并写进分区日志（不带正文）；被 RLS 拒绝时按 [US-218](../adapter/US-218-supabase-rls-push-integrity.md) 对齐本地，被拒清单可见。
- 推送后锁定：已推送的修改不能撤销；拉取到远端变更后撤销历史失效。
- 改 `visibility` / `tenantId` 导致换区：推送后，其他身份按各自能读的区收到写入或移除。
- 离线修改，恢复连接后推送。
- 与远端修改冲突：沿用拉取的冲突解决（默认 LWW）。
- 被移出租户时本机还有未推送的修改：推送被拒、本地对齐、被拒清单可见。
- demo：商品面板增加新建、编辑、删除、撤销、重做与推送；访客身份下写入口禁用；「模拟服务端变更」面板保留，用来演示远端直写。

### Out of Scope

- 远端完整变更历史：归 [US-229](../adapter/US-229-supabase-change-history.md)。
- 「只读」与「仅经 PR」两种写入模式（epic-015「写入模式」目标的其余部分）。
- 本地预判列级写权限：没有列权限的修改由服务端拒绝，本地不提前隐藏。
- React / Vue demo：dev-rxdb-supabase 只有 Angular 端，本故事不新增绑定包 API。

## 验收标准

| #   | 前置条件                                                  | 操作                                          | 预期结果                                                                                         | 状态 |
| --- | --------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---- |
| 1   | Alice 登录，是星河零售成员                                 | 在本地新建一件星河零售的商品                  | 本地出现这件商品与一条带 `patch` 的 INSERT 变更；待推数加 1                                       | ⬜   |
| 2   | AC#1 的商品未推送                                         | 改售价，撤销，再重做                          | 撤销后售价回到原值，重做后是新值；变更都带 `patch` / `inversePatch`                              | ⬜   |
| 3   | 一件已同步的星河零售商品                                  | 本地删除后撤销                                | 商品恢复，字段与删除前一致                                                                       | ⬜   |
| 4   | Alice 有未推送的修改                                      | 推送                                          | 远端业务行更新；分区日志落在 `tenant:xinghe`，正文为空；撤销栈清空，已推送的修改不能撤销         | ⬜   |
| 5   | Alice 把一件公开商品改成租户可见并推送                    | 访客同步                                      | 访客本地这件商品被移除                                                                           | ⬜   |
| 6   | Alice 离线修改两件商品                                    | 恢复连接后推送                                | 两条修改都被接受，远端一致                                                                       | ⬜   |
| 7   | 远端与 Alice 本地都改了同一件商品的售价，Alice 的未推送   | Alice 先同步再推送                            | 按冲突解决的结果收敛，本地与远端一致，没有半截数据                                               | ⬜   |
| 8   | Alice 有一条未推送的修改，随后退出星河零售                | 推送                                          | 以 `denied` 被拒；本地按 US-218 对齐；被拒清单显示这件商品                                       | ⬜   |
| 9   | Alice 有未推送的修改                                      | 同步拉到别人的修改                            | 撤销历史失效，不能跨过远端修改撤销                                                               | ⬜   |
| 10  | 访客打开商品目录                                          | 查看商品面板                                  | 新建、编辑、删除入口禁用；没有 `rxdb_mutations` 请求                                             | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：待实现。AC#1～3、#9 由历史插件与 `rxdb-adapter-pglite` 的 `ScriptedRemote` 用例覆盖；AC#4～8 由 `rxdb-adapter-supabase` 真栈用例覆盖；AC#10 由 dev-rxdb-supabase 组件单测与 `dev-rxdb-supabase-e2e` 覆盖。

## 技术笔记

- **写权限**：`CatalogItem` 的三项权限改为 `both`，`PublicCatalogItem` 保持 `system`（在线浏览实体只读）。断言 CatalogItem 只读的既有用例、`published-model-invariants.spec.ts` 要同步改。
- **访客**：实体权限是静态元数据，不能按身份区分（按角色的写授权见 US-029，仍是价值待证）。访客的写入口在 demo 里禁用；访客即使在本地写了，也推不上去（US-225：anon 没有推送权限）。
- **列权限**：成员推送的载荷包含 `cost` 等列，核对 `authenticated` 对 `catalog_items` 各列的写权限；缺什么在参考 SQL 里补，不新增协议。
- **换区**：`tenantId` / `visibility` 改变时，服务端按写后的行算区；旧区成员下次拉取收到「移除」，由现有的分区拉取处理。
- **未推送的行与清理**：被移出区时，`bucketed-scope-cleanup` 清理本地投影会跳过未推送的行；这些行随后推送被拒，按 US-218 对齐。
- **撤销/重做**：写法同 Todo 页——`rxdb.versionManager.history(CatalogItem)`；推送用 `syncManager.pushRepository('public', 'CatalogItem')`。

## 实现文件

- `packages/rxdb-test/entities/CatalogItem.ts` — 写权限
- `apps/dev-rxdb-supabase/src/app/catalog/` — 商品面板的写入、撤销/重做、推送与待推数
- `apps/dev-rxdb-supabase/supabase/catalog-demo.sql`、`docker/sql/03-business-tables.sql` — 列权限核对
- `packages/rxdb-adapter-supabase/src/__tests__/` — 分区实体推送真栈用例
- `packages/rxdb-adapter-pglite/src/__tests__/`、`packages/rxdb-plugin-history/src/__tests__/` — 撤销/重做与推送后锁定
- `apps/dev-rxdb-supabase/README.md` — 试用步骤

## References

- [US-033 按授权分区同步（只读）](./US-033-identity-scoped-read-sync.md) — 预留本故事的范围
- [US-033 的试验记录](./US-033-bucket-log-spike.md) — 分区日志不带正文的依据
- [US-218 Supabase 远端启用 RLS 时的推送完整性](../adapter/US-218-supabase-rls-push-integrity.md) — 被拒回执与本地对齐
- [US-225 Supabase 日志同步只对已登录身份开放](../adapter/US-225-supabase-sync-protocol-access-baseline.md) — 访客不能推送
- [US-229 Supabase 远端变更历史](../adapter/US-229-supabase-change-history.md)
