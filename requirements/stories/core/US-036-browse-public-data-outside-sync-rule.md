---
id: US-036
title: 规则之外的公开数据：在线浏览走只读浏览实体，不进同步子集
status: Done
priority: High
epic: epic-015-identity-scoped-sync
created: 2026-11-19
updated: 2026-11-24
tags: [core, querycache, sync, supabase, public-data]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 浏览实体走现有的 QueryCache，不依赖分区同步（US-033）；只有 AC#5 的组合用例以 US-033 阶段 B 为前置，登记为候选
- [x] Negotiable (可协商): 公开视图的写法、是否提供建视图的辅助函数、自检怎么认视图由实现决定
- [x] Valuable (有价值): epic 的立项目标「没登录的用户能看到全部公开数据」没有任何故事覆盖
- [x] Estimable (可估算): 公开视图的夹具与授权 + 连接自检对视图的处理 + 真栈契约测试 + 文档
- [x] Small (小): 一个 PR
- [x] Testable (可测试): 真栈契约测试以 anon 与一个登录用户验证
-->

# 用户故事：规则之外的公开数据在线浏览

## 作为/我想要/以便

**作为** 用 RxDB + Supabase 做本地优先应用的开发者
**我想要** 公开数据里只有一部分同步到本机，其余的仍然能在线分页、筛选
**以便** 没登录的访客能看到全部公开数据，离线时还有选中的那一部分可用

## 现状（`26521c24`）

- **一个实体只有一个同步类型。** [`RepositorySyncType`](../../../packages/rxdb/src/sync-contract/sync-type-utils.ts) 是单值，[`resolveType`](../../../packages/rxdb/src/sync-contract/entity-sync-resolver.ts) 对一个实体只返回一个。同步子集用的是 `filter`，在线浏览用的是 `querycache`，不能同时配在一个实体上。
- **两条路径写同一张本地表会互相删行。** [US-033](US-033-identity-scoped-read-sync.md) 在规则被改写时删掉「本地不在快照里的行」，浏览时缓存下来的行正好不在快照里。
- **实体只有一个表名。** 本地表与远端表同名，两个实体不能映射同一张远端表而各用各的本地表。
- **在线浏览的能力已经有了。** `SyncType.QueryCache` 以调用者身份直接读远端，授权与 RLS 照常生效；anon 也能用，[US-225](../adapter/US-225-supabase-sync-protocol-access-baseline.md) 只收回了日志协议，没有收回业务表的读取。它的约束写在[同步文档](../../../website/docs/collaboration/sync.md)里：同步粒度是整个 `where`，要靠 `where` 收窄，靠 `limit` 收窄会造成拉取放大。
- **连接自检不认视图。** [`rxdb_check_rls`](../../../docker/sql/04-rxdb-utils-functions.sql) 只查 `relkind IN ('r', 'p')`，映射到视图的实体会被报成表不存在；自检设成 `failureMode: 'throw'` 时连接失败。

## 范围边界

### In Scope

- **只读浏览实体**：应用为公开数据另声明一个实体，同步类型为 `QueryCache`，映射到服务端的一个公开视图（只含公开行与可以公开的列）。它与同步子集的实体是两个实体、两张本地表，互不干扰。
- **只读**：浏览实体的三项写权限都声明为只许系统写（[US-027](US-027-entity-permission-model.md)），对它的创建、修改、删除在本地入口被拒。
- **公开视图**：参考 SQL 给出视图的写法与授权，anon 可读。两种写法的取舍写进文档：只选公开区的视图不依赖业务表的 RLS；`security_invoker` 的视图沿用业务表的 RLS。测试夹具用 `security_invoker`（实现时改定）：定义者权限的视图绕过业务表的 RLS 与列权限，Supabase Advisor 报 `security_definer_view`（ERROR）；成本列靠业务表对 anon 的列权限与视图的列清单两道收住。
- **连接自检认视图**：浏览实体映射到视图时，自检不把它报成缺表或未开 RLS。
- **文档**：什么数据走同步子集、什么数据走浏览实体；浏览要按有界条件查；怎么把浏览到的内容变成离线可用（把它加进同步规则）。

### Out of Scope

- **一个实体既同步又在线浏览**：一个实体、一张本地表、一个查询入口。要改核心读路径与三端绑定，见技术笔记的候选二；界面必须是同一个列表时另立故事。
- **浏览缓存的淘汰**：缓存多久清、清多少。
- **租户数据的在线浏览**：登录用户浏览自己租户里规则之外的行。做法相同，视图换成 `security_invoker`；本故事只验收公开数据。
- **搜索**：全文索引与相关度排序。

### 候选范围（已解除）

AC#5 验证浏览实体与分区同步的实体同时工作，以 [US-033](US-033-identity-scoped-read-sync.md) 阶段 B 合入为准入条件。US-033 已完成，AC#5 随本故事一起验收。

## 验收标准

| #   | 前置条件                                                                                 | 操作                                                  | 预期结果                                                                                                       | 状态 |
| --- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 远端有分属多个分类的公开行，另有租户私有行；公开视图不含成本列                           | anon 与登录用户 A 各自经浏览实体按分类分页查询        | 两者都得到该分类下全部公开行，分页与排序正确；读不到租户私有行与成本列；anon 不需要登录或匿名账号              | ✅   |
| 2   | anon 浏览缓存过某一行；远端把它改成私有，另把一行删除                                    | anon 再查包含这两行的分类                             | 两行都从本地浏览缓存里消失                                                                                     | ✅   |
| 3   | 浏览实体                                                                                 | 调用创建、修改、删除                                  | 本地入口拒绝，不发远端请求                                                                                     | ✅   |
| 4   | 浏览实体映射到公开视图                                                                   | 连接两次：自检用默认模式，以及 `failureMode: 'throw'` | 两次都连接成功；自检不把视图报成缺表或未开 RLS                                                                 | ✅   |
| 5   | US-033 阶段 B 已合入；同一批公开行，同步实体按规则同步了一个分类，浏览实体查过另一个分类 | 改写同步规则触发重新对账，再各做一次同步与一次浏览    | 同步实体的本地行等于它的对照基准；浏览缓存的行没有被同步的清理删掉；浏览没有改变同步子集                       | ✅   |
| 6   | `website/docs`                                                                           | 阅读                                                  | 写明：同步子集与浏览实体各自适用的数据；浏览要按有界条件查；公开视图的两种写法；怎么把浏览到的内容加进同步规则 | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：

| AC     | 证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1～#5 | 真栈契约测试 [public-catalog-browse.spec.ts](../../../packages/rxdb-adapter-supabase/src/__tests__/public-catalog-browse.spec.ts)：AC#1 以 anon（只有 anon key、没有会话）与签发令牌的用户 A 各自按分类分页浏览，另断言视图按列名查 `cost` 被 PostgREST 拒绝；AC#2 经 service_role 把缓存过的行改成私有、删掉另一行后再查，本地浏览缓存只剩第三行；AC#3 三个写入口都抛 `PermissionDeniedError`，经客户端的 `fetch` 记录没有任何写请求；AC#4 默认模式与 `throw` 模式各连接一次，没有任何 RLS 告警；AC#5 改写同步规则后同步实体等于以同一身份直查业务表的基准，浏览缓存原样还在，浏览没有改变同步子集 |
| #4     | 实现时暴露适配器自检把同步插件的本地系统表（`rxdb_migration`、`rxdb_sync`、`rxdb_sync_bucket_*`）也拿去远端查，`throw` 模式下装了同步插件就连不上：自检改为只查日志表、分支表与经远端同步的实体，单测 [rls-check-tables.spec.ts](../../../packages/rxdb-adapter-supabase/src/__tests__/rls-check-tables.spec.ts)。参考部署里 `rxdb_branch` 未开 RLS 也会让 `throw` 模式失败，生产权限脚本改为给分支表与远端身份表开 RLS、只建读取策略（SQL 回归 `production-change-grants` 第 8、9 条）                                                                                                             |
| #6     | [`website/docs/adapters/supabase.md`](../../../website/docs/adapters/supabase.md#规则之外的公开数据在线浏览) 的「规则之外的公开数据：在线浏览」与「RLS 自检」                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 演示   | `dev-rxdb-supabase` 的 `/catalog`：访客在线浏览规则之外的公开商品、按名称筛选、一键把分类加进同步规则；远端 e2e [catalog-sync.spec.ts](../../../apps/dev-rxdb-supabase-e2e/src/catalog-sync.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                                |

复验命令：先 `pnpm nx run rxdb-adapter-supabase:test-env`，再 `pnpm nx test rxdb-adapter-supabase -- --run public-catalog-browse rls-check-tables`；SQL 回归 `pnpm nx run rxdb-adapter-supabase:sql-security-regressions`。

## 技术笔记

三个候选的取舍：

| 候选                   | 做法                                                                      | 代价                                                                                        | 结论                                           |
| ---------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 一：两个实体           | 同步子集一个实体，在线浏览另一个只读实体，后者走 QueryCache、映射公开视图 | 界面上是两个列表（离线可用的、在线浏览的），要合成一个列表得应用自己按 id 合并              | 本故事采用：不改核心，现有 QueryCache 能力够用 |
| 二：一个实体双模式     | 同一个实体既有同步下来的子集，又能按需向远端查询并缓存进同一张本地表      | 核心读路径、QueryCache 的孤儿清理、同步的规则清理都要认行的来源；三端绑定要加同一个查询选项 | 不在本故事；界面必须是同一个列表时另立故事     |
| 三：浏览就是改同步规则 | 浏览到哪个分类，就把它加进同步规则                                        | 每次浏览都重新对账一次；不适合翻页与筛选                                                    | 只用于「把浏览到的内容变成离线可用」           |

- **为什么先做候选一**：它交付的是 epic 立项目标里缺的那一半，而且只动参考 SQL、适配器的自检与文档。候选二的难点是两条路径共用一张本地表时谁能删谁的行，要等 US-033 的落库规则（来源区与版本号）落地之后才有地方记「这一行是浏览缓存下来的」。
- **浏览要按有界条件查**：QueryCache 每次同步都取该 `where` 命中的全部 `{ id, updatedAt }`。按分类、时间段这类有界条件查没有问题；无条件列出全部公开行，每次都要拉回全部元数据。
- **视图要带上 QueryCache 需要的列**：`id` 与 `updatedAt`。
- **同一行可能存两份**：一行既被同步、又被浏览到，会在两张本地表里各有一份，以各自的路径保持新鲜。

## 实现文件

- `docker/sql/03-business-tables.sql` — 测试夹具：分区商品表 `catalog_items`（按区 RLS、anon 不可读成本列）与公开视图 `catalog_items_public`（`security_invoker`）
- `docker/sql/04-rxdb-utils-functions.sql` — `rxdb_check_rls` 认视图
- `docker/sql/production/rxdb-change-grants.sql` — 分支表与远端身份表开 RLS、只建读取策略（`throw` 模式的自检能通过）
- `packages/rxdb-test/entities/` — `CatalogItem`（分区同步）与 `PublicCatalogItem`（只读浏览）
- `packages/rxdb-adapter-supabase/` — 连接自检只查经远端同步的表、认视图；真栈契约测试
- `apps/dev-rxdb-supabase/` — 商品目录演示（`/catalog`）与演示 SQL `supabase/catalog-demo.sql`
- `website/docs/` — 公开数据的同步子集与在线浏览

## References

- [epic-015 按身份授权的同步与本机数据隔离](../../epics/epic-015-identity-scoped-sync.md)
- [US-033 按授权分区同步（只读）](US-033-identity-scoped-read-sync.md)
- [US-020 QueryCache 仓储](US-020-querycache-repository.md)
- [US-225 Supabase 日志同步的访问底线](../adapter/US-225-supabase-sync-protocol-access-baseline.md)
