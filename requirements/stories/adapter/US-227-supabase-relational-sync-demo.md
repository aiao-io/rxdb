---
id: US-227
title: dev-rxdb-supabase 关系数据的推拉同步演示与端到端验收
status: Backlog
priority: Medium
epic: epic-004-future-features
created: 2026-11-25
updated: 2026-11-25
tags: [adapter, supabase, sync, relationship, demo, e2e]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只动 dev-rxdb-supabase、它的 e2e 与 demo 自有的 SQL；三个阶段分别以 US-037、US-228、US-038 为前置
- [x] Negotiable (可协商): 页面布局与交互细节留待实现时定；数据表与实体放置已定
- [x] Valuable (有价值): demo 里今天没有任何关系数据，关系同步只在适配器用例里验过，接入方看不到，e2e 也守不住
- [x] Estimable (可估算): demo 自有 SQL + demo 内实体 + 订单页 + 两身份远端 e2e；三个阶段各一个 PR
- [ ] Small (小): 三个阶段各自等前置故事落地
- [x] Testable (可测试): 两个登录身份的远端 e2e
-->

# 用户故事：dev-rxdb-supabase 关系数据的推拉同步演示

## 作为/我想要/以便

**作为** 评估或接入 RxDB + Supabase 的开发者
**我想要** 在 dev-rxdb-supabase 里操作一组有外键关系的数据——客户与订单（一对多）、订单与订单项（一对多、级联删除）、订单项与分类（多对多）、客户与证件（双向一对一）——在两个浏览器之间推拉，看到级联删除与外键被拒的结果
**以便** 在真实 Supabase 栈上确认关系同步可用，并有一条端到端门禁守住 US-037、US-228 与 US-038

## 现状

- demo 注册的实体都没有关系。[`setup_rxdb_wa-sqlite.ts`](../../../apps/dev-rxdb-supabase/src/app/setup_rxdb_wa-sqlite.ts) 里是 `entities: [Todo, CatalogItem, PublicCatalogItem]`，三个 `@Entity` 都没有 `relations`。demo 演示的是按权限分区同步（US-033 / US-036），不是外键关系。
- 关系相关的验证只在适配器用例里：`cascade-delete-sync.spec.ts` 验 `menu_large` 自引用的级联删除日志（US-224）；`test-shop.spec.ts`、`test-many-to-many.spec.ts` 是 `SyncType.None`，直接读写远端。
- shop 夹具不适合直接拿来演示：
  - 生成器要求关系的两端在同一组里，用其中一个实体就会带进整张关系图，包括 User ↔ IdCard 的环（US-038）；
  - 中间表没有 `id` 列，推不上去（US-228）；
  - `test-shop.spec.ts` 的 `afterAll` 会清空全部 shop 数据，演示数据随时会丢。
- `@aiao/rxdb-test/entities` 一组的 `ENTITIES` 会被三个 demo 应用与 `published-model-invariants.spec.ts` 一起消费，往里加演示实体会与 shop 组撞名、改动固定计数。

复验方式：grep 上述符号；`packages/rxdb-test/rxdb.config.ts` 是生成器的分组配置。

## 交付阶段

| 阶段 | 状态 | 交付                                                                                              | 必过 AC   | 门禁                                        |
| ---- | ---- | ------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------- |
| A    | ⬜   | demo 自有表与实体（客户、订单、订单项）；订单页；一对多、多对一、级联删除、外键被拒；访客只存本地 | AC#1～6   | 前置 US-037 已合入；`e2e-remote` 新用例通过 |
| B    | ⬜   | 分类与订单项—分类多对多；挂上、摘掉分类；并发关联同一对                                           | AC#7～9   | 前置 US-228 已合入                          |
| C    | ⬜   | 证件与客户的双向一对一；同批新建、一次推送；删除证件后两端一致                                    | AC#10～11 | 前置 US-038 已合入                          |

## 范围边界

### In Scope

- **demo 自有表**：新建 `apps/dev-rxdb-supabase/supabase/orders-demo.sql`，表在 `public` schema，按阶段增补：
  - `demo_customers`、`demo_orders`、`demo_order_items`（阶段 A）；
  - `demo_categories` 与中间表 `"DemoCategory_DemoOrderItem"`（阶段 B，按 US-228 的契约建表）；
  - `demo_id_cards`（阶段 C）。
    开 RLS，策略为 `FOR ALL TO authenticated USING (true) WITH CHECK (true)`（Alice 与 Bob 共享数据）；照 `catalog-demo.sql` 先 `REVOKE ALL ... FROM anon, authenticated` 再授权给 authenticated；每张表登记同步。
- **SQL 加载**：在 `docker/init-db.sh`、`.github/actions/supabase/action.yml`、`scripts/docker-supabase-scripts.spec.mjs` 三处加载这个文件。
- **实体**：放在 demo 内（`apps/dev-rxdb-supabase/src/app/orders/order-entities.ts`），不走代码生成；名字带 `Demo` 前缀（`DemoCustomer`、`DemoOrder`……），表名避开保留字 `order`。服务端级联删除的关系在本地显式声明 `onDelete: CASCADE`。在 `setup_rxdb_wa-sqlite.ts` 里**按子在前**声明，让 demo 顺带守住 US-037。
- **访客**：抽出 `demo-sync-overrides.ts`（带 spec），访客身份下这些实体设为 `SyncType.None` + local（与 Todo 同口径，US-225）。阶段 A 不声明多对多：在 US-228 之前，自动生成的中间表不会跟随两端，会对访客开同步。
- **页面**：订单页（`/orders`，路由走 `supabaseSyncResolver`），侧栏菜单项；新建客户、订单与订单项，删除订单，推送、拉取与待推、待拉计数；被拒清单复用 `SyncRejectionsPanel`。
- **RLS 自检**：`DEMO_RLS_CHECK` 加入新表，同步改 `supabase-rls-check.spec.ts` 的精确断言。
- **e2e**：`apps/dev-rxdb-supabase-e2e/src/orders-sync.spec.ts`，Alice 与 Bob 各开一个浏览器上下文；把这个文件加进 `project.json` 里 `e2e-remote` 的文件清单。
- README 新开「关系数据」一节。

### Out of Scope

- 租户分区与按成员授权：商品目录已经演示过（epic-015）。
- React / Vue demo：dev-rxdb-supabase 只有 Angular 端，本故事不新增绑定包 API。
- 冲突解决界面。
- 适配器层面的关系同步能力本身：分别归 US-037、US-228、US-038。

## 验收标准

### 阶段 A：一对多、多对一、级联删除与外键被拒

| #   | 前置条件                                 | 操作                               | 预期结果                                                                   | 状态 |
| --- | ---------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------- | ---- |
| 1   | Alice 登录，打开订单页；实体按子在前声明 | 新建客户、订单与两条订单项，点推送 | 远端三张表都有对应行且外键一致；被拒清单为空                               | ⬜   |
| 2   | AC#1 已推送；Bob 在另一个浏览器登录      | 点拉取                             | Bob 看到同一客户、订单与两条订单项                                         | ⬜   |
| 3   | AC#2 完成                                | Alice 删除订单并推送，Bob 拉取     | 远端订单项被级联删除；Bob 本地的订单与订单项都消失                         | ⬜   |
| 4   | Bob 已在远端删除某个客户，Alice 尚未拉取 | Alice 给这个客户新建订单并推送     | 被拒清单显示这条订单，原因是依赖，指向被删的客户；Alice 本地按 US-218 对齐 | ⬜   |
| 5   | 访客（未登录）打开订单页                 | 新建订单                           | 只存本地，不发 `rxdb_mutations` 请求                                       | ⬜   |
| 6   | `orders-demo.sql` 已加载                 | 运行 demo 的 RLS 自检              | 新表都开了 RLS，anon 没有表权限                                            | ⬜   |

### 阶段 B：多对多

| #   | 前置条件                          | 操作                                              | 预期结果                                       | 状态 |
| --- | --------------------------------- | ------------------------------------------------- | ---------------------------------------------- | ---- |
| 7   | Alice 与 Bob 都同步了 AC#1 的订单 | Alice 给一条订单项挂两个分类并推送，Bob 拉取      | 远端中间表两行；Bob 的这条订单项显示两个分类   | ⬜   |
| 8   | AC#7 完成                         | Alice 摘掉一个分类并推送，Bob 拉取                | 远端中间表剩一行；Bob 只看到一个分类           | ⬜   |
| 9   | 同 AC#7 的前置                    | Alice 与 Bob 给同一条订单项挂同一个分类，各自推送 | 远端只有一行，两人都看到这个分类，没有推送失败 | ⬜   |

### 阶段 C：双向一对一

| #   | 前置条件   | 操作                                           | 预期结果                                 | 状态 |
| --- | ---------- | ---------------------------------------------- | ---------------------------------------- | ---- |
| 10  | Alice 登录 | 同批新建互相引用的客户与证件，点推送，Bob 拉取 | 两端两行都在，互相引用一致，被拒清单为空 | ⬜   |
| 11  | AC#10 完成 | Alice 删除证件并推送，Bob 拉取                 | 两端的客户都还在，证件引用都为空         | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：待实现。AC#1～5、#7～11 由 `dev-rxdb-supabase-e2e` 的远端用例（`e2e-remote`）覆盖；AC#6 由 `supabase-rls-check.spec.ts` 与 demo 的 RLS 自检覆盖。

## 技术笔记

- **表与实体命名**：`DemoCustomer` / `demo_customers`、`DemoOrder` / `demo_orders`、`DemoOrderItem` / `demo_order_items`、`DemoCategory` / `demo_categories`、`DemoIdCard` / `demo_id_cards`。中间表名由排序后的实体名拼成，为 `DemoCategory_DemoOrderItem`，SQL 里要加引号。
- **一对一**：`DemoCustomer.idCard` 可空并声明 `onDelete: SET_NULL`，`DemoIdCard.owner` 非空并声明 `onDelete: CASCADE`，与远端 DDL 一致。
- **RLS**：策略也覆盖 UPDATE，US-038 的延迟列补写需要它。anon 不开表权限：生产授权已收回 anon 的推送与未分区日志读取，访客这些实体只存本地。
- **登记同步**：`rxdb_enable_sync_for_table` 会顺带装上 `updatedAt` 触发器，不用另写。
- **e2e**：
  - 把 `switchIdentity` 从 `catalog-sync.spec.ts` 抽到共享支持文件；
  - 单号、名称每轮唯一，结束时删除创建的客户来清理（订单与订单项随之级联删除）；
  - AC#5 拦截 `rpc/rxdb_mutations` 断言请求数为 0；
  - 推送完成以远端可见为准，不只数请求数。
- **共用栈**：这个栈也给适配器测试用，跑适配器测试会清掉 `rxdb_change`；演示表的数据不受影响，但同步日志可能被清掉，e2e 不依赖库里已有的数据。

## 实现文件

| 阶段 | 路径                                                                                                               | 说明                             |
| ---- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| A～C | `apps/dev-rxdb-supabase/supabase/orders-demo.sql`                                                                  | demo 自有表、RLS、授权、登记同步 |
| A    | `docker/init-db.sh`、`.github/actions/supabase/action.yml`、`scripts/docker-supabase-scripts.spec.mjs`             | 加载链                           |
| A～C | `apps/dev-rxdb-supabase/src/app/orders/`                                                                           | 实体、订单页与交互逻辑           |
| A    | `apps/dev-rxdb-supabase/src/app/demo-sync-overrides.ts`、`setup_rxdb_wa-sqlite.ts`、`app.routes.ts`、`app-menu.ts` | 同步覆盖、注册实体、路由与菜单   |
| A    | `apps/dev-rxdb-supabase/src/app/supabase-rls-check.ts`                                                             | RLS 自检                         |
| A～C | `apps/dev-rxdb-supabase-e2e/src/orders-sync.spec.ts`、`project.json`                                               | 两身份远端用例                   |
| A    | `apps/dev-rxdb-supabase/README.md`                                                                                 | 「关系数据」一节                 |

## References

- [US-037 全量推送按外键依赖排序](../core/US-037-push-order-by-foreign-key.md) — 阶段 A 前置
- [US-228 多对多关联在 Supabase 上可同步](./US-228-supabase-many-to-many-sync.md) — 阶段 B 前置
- [US-038 双向一对一的实体能开同步](../core/US-038-bidirectional-one-to-one-sync.md) — 阶段 C 前置
- [US-224 Supabase 推送路径上级联删除的子行不写变更日志](./US-224-supabase-cascade-delete-change-log.md) — 级联删除的隐式日志
- [US-225 Supabase 日志同步只对已登录身份开放](./US-225-supabase-sync-protocol-access-baseline.md) — 访客只存本地的来由
