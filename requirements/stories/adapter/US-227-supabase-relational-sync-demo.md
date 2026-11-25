---
id: US-227
title: dev-rxdb-supabase 关系数据的推拉同步演示与端到端验收
status: Backlog
priority: Medium
epic: epic-004-future-features
created: 2026-11-25
updated: 2026-11-25
tags: [adapter, supabase, sync, relationship, demo, e2e]
candidate_acs: [8]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只动 dev-rxdb-supabase、它的 e2e 与参考 SQL 的同步登记；前置 US-037，候选 AC#8 另以 US-038 为前置
- [x] Negotiable (可协商): 演示实体放 `@aiao/rxdb-test` 还是 demo 内、访客能否进入订单页，留待实现前定
- [x] Valuable (有价值): demo 里今天没有任何关系数据，关系同步只在适配器用例里验过，接入方看不到，e2e 也守不住
- [x] Estimable (可估算): 一个 Angular 页面 + 一组映射 shop 表的实体 + 两身份远端 e2e + 中间表同步登记
- [x] Small (小): 一个 PR
- [x] Testable (可测试): 两个登录身份的远端 e2e
-->

# 用户故事：dev-rxdb-supabase 关系数据的推拉同步演示

## 作为/我想要/以便

**作为** 评估或接入 RxDB + Supabase 的开发者
**我想要** 在 dev-rxdb-supabase 里操作一组有外键关系的数据——订单与订单项（一对多）、订单与用户（多对一）、订单项与分类（多对多），在两个浏览器之间推拉，并看到级联删除与外键被拒的结果
**以便** 在真实 Supabase 栈上确认关系同步可用，并有一条端到端门禁守住 US-037（候选阶段再守 US-038）

## 现状

- demo 注册的实体都没有关系。[`setup_rxdb_wa-sqlite.ts`](../../../apps/dev-rxdb-supabase/src/app/setup_rxdb_wa-sqlite.ts) 里是 `entities: [Todo, CatalogItem, PublicCatalogItem]`，三个 `@Entity` 都没有 `relations`；[`CatalogItem`](../../../packages/rxdb-test/entities/CatalogItem.ts) 的 `tenantId` 是普通字符串列。demo 演示的是按权限分区同步（US-033 / US-036），不是外键关系。
- 关系相关的验证只在适配器用例里：`cascade-delete-sync.spec.ts` 验 `menu_large` 自引用的级联删除日志（US-224）；`test-shop.spec.ts`、`test-many-to-many.spec.ts` 是 `SyncType.None`，直接读写远端，不走推拉。
- 远端已有关系表：shop schema 的 `user`、`"order"`、`order_item`、`category` 与中间表 `"Category_OrderItem"`，外键与 `ON DELETE` 齐全（订单项随订单 `CASCADE`，中间表两侧都 `CASCADE`），测试栈里这些表关了 RLS 并已授权，见 [`03-business-tables.sql`](../../../docker/sql/03-business-tables.sql)。
- 同一份 SQL 的 `rxdb_enable_sync_for_table` 只登记了 shop 的十张业务表，两张中间表都没登记。US-224 的级联删除捕获靠同步触发器，所以删除订单项时，中间表行的隐式删除日志很可能写不出来（**推断**，未实测）。
- 直接注册 shop 夹具会撞上两处缺陷，都已在真栈上复现：注册全部 shop 实体时推拉整体失败（US-038）；子实体声明在前时，全量推送会被拒并删掉本地行（US-037）。

## 范围边界

### In Scope

- 新的订单页（例如 `/orders`），路由走 `supabaseSyncResolver`，侧栏与 Todo、商品目录并列。
- 实体：映射到 shop 现有表的演示实体（用户、订单、订单项、分类，订单项—分类多对多），只声明演示需要的关系，不含身份证；刻意按「子在前」声明，让 e2e 守住 US-037。
- 页面操作：新建用户、订单与它的订单项（同批新建，一次推送）；给订单项挂上或摘掉分类；删除订单（服务端级联删除订单项与中间表行）；推送、拉取按钮与待推、待拉计数；被拒清单沿用 `sync-rejections-panel`。
- 参考 SQL：在 `03-business-tables.sql` 里给 `"Category_OrderItem"` 登记同步。
- e2e：两个登录身份（Alice、Bob）的远端用例，加进 `dev-rxdb-supabase-e2e` 的 `e2e-remote`；每轮用唯一的单号与名称，结束时按这些标识清理。
- README 补演示步骤。

### Out of Scope

- 租户分区与按成员授权：商品目录已经演示过（epic-015）；shop 表在测试栈里没有 RLS，生产权限不在本故事。
- React / Vue demo：dev-rxdb-supabase 只有 Angular 端，本故事不新增绑定包 API，不涉及三端对称。
- 冲突解决界面。
- 候选：双向一对一（用户—身份证，AC#8）。准入条件是 US-038 Done；在那之前不参与本故事的关闭，AC#8 保持 ⬜。

## 验收标准

| #   | 前置条件                                                          | 操作                                         | 预期结果                                                                   | 状态 |
| --- | ----------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------- | ---- |
| 1   | Alice 登录，打开订单页                                            | 新建用户、订单与两条订单项，点推送           | 远端 user、order、order_item 都有对应行且外键一致；被拒清单为空            | ⬜   |
| 2   | AC#1 已推送；Bob 在另一个浏览器登录                               | 点拉取                                       | Bob 看到同一订单与两条订单项                                               | ⬜   |
| 3   | AC#2 完成                                                         | Alice 给一条订单项挂两个分类并推送，Bob 拉取 | 远端中间表两行；Bob 的这条订单项显示两个分类                               | ⬜   |
| 4   | AC#3 完成                                                         | Alice 摘掉一个分类并推送，Bob 拉取           | 远端中间表剩一行；Bob 只看到一个分类                                       | ⬜   |
| 5   | AC#3 完成                                                         | Alice 删除订单并推送，Bob 拉取               | 远端的订单项与中间表行被级联删除；Bob 本地的订单、订单项与分类关联都消失   | ⬜   |
| 6   | Bob 已在远端删除某个用户，Alice 尚未拉取                          | Alice 给这个用户新建订单并推送               | 被拒清单显示这条订单，原因是依赖，指向被删的用户；Alice 本地按 US-218 对齐 | ⬜   |
| 7   | 访客（未登录）打开订单页                                          | 新建订单                                     | 只存本地，不发远端请求（与 Todo 同口径，US-225）                           | ⬜   |
| 8   | 候选阶段获准（US-038 Done）；Alice 同批新建互相引用的用户与身份证 | 推送，Bob 拉取                               | 两端两行都在、互相引用一致；US-038 Done 前不参与本故事关闭                 | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：待实现。AC#1～#7 由 `dev-rxdb-supabase-e2e` 的远端用例（`e2e-remote`）覆盖。

## 技术笔记

- 待澄清：演示实体放 `@aiao/rxdb-test`（与 `CatalogItem` 同处）还是放在 demo 内。只映射 shop 现有表，不新建业务表。
- 待澄清：访客能否进入订单页。AC#7 按「与 Todo 一样只存本地」写；若改成只对登录身份开放，相应改写 AC#7。
- shop 表没有按身份隔离，e2e 不能依赖库里已有的数据。这个栈同时给适配器测试用，跑适配器测试会清掉 `rxdb_change`，演示数据的同步日志可能随之丢失。
- 前置 US-037：演示实体按「子在前」声明才守得住它；若先于 US-037 开工，只能按「父在前」声明，e2e 就守不住 US-037。

## 实现文件

- `apps/dev-rxdb-supabase/src/app/` — 订单页、路由与侧栏、同步覆盖
- `packages/rxdb-test/` 或 demo 内 — 演示实体（待澄清）
- `docker/sql/03-business-tables.sql` — 中间表同步登记
- `apps/dev-rxdb-supabase-e2e/src/` — 两身份远端用例
- `apps/dev-rxdb-supabase/README.md` — 演示步骤

## References

- [US-037 全量推送按外键依赖排序](../core/US-037-push-order-by-foreign-key.md) — 前置
- [US-038 双向一对一的实体能开同步](../core/US-038-bidirectional-one-to-one-sync.md) — 候选 AC#8 的前置
- [US-224 Supabase 推送路径上级联删除的子行不写变更日志](./US-224-supabase-cascade-delete-change-log.md) — 级联删除的隐式日志
- [US-225 Supabase 日志同步只对已登录身份开放](./US-225-supabase-sync-protocol-access-baseline.md) — 访客只存本地的来由
