---
id: US-234
title: Supabase 租户内成员权限：管理员能改、员工只能看，dev-rxdb-supabase 完整演示
status: In Review
priority: High
epic: epic-015-identity-scoped-sync
created: 2026-11-26
updated: 2026-11-28
tags: [adapter, supabase, permission, rls, demo]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 阶段 A 的服务端部分只依赖分支上已有的 US-033 / US-034 / US-229 / US-218；演示部分建在 epic-016 的页面骨架上（US-230 阶段 A、US-231 阶段 A、US-232），排在它们之后，免得两条故事同时改商品页；阶段 B 依赖 US-029 阶段 C
- [x] Negotiable (可协商): 函数与 RPC 的名字、面板文案、两个预设以外的权限组合怎么显示可协商；权限存成员表、写策略与历史可见性同口径、自助加入只得 read 已定
- [x] Valuable (有价值): owner 授权（见「立项」）；今天同一租户的成员都能改商品，分不出管理员与员工
- [x] Estimable (可估算): 一份演示 SQL 加一个平台默认函数；真栈用例；商品页三处界面与抽屉里一个面板；一个新的远端 e2e 文件
- [x] Small (小): 阶段 A 一个 PR；阶段 B 在 US-029 阶段 C 之后一个 PR
- [x] Testable (可测试): 服务端 AC 在真实 Supabase 栈上以普通 authenticated 身份验收，不用 mock；演示 AC 由远端 e2e 验收
-->

# 用户故事：Supabase 租户内成员权限：管理员能改、员工只能看

## 作为/我想要/以便

**作为** 用 Supabase 做多租户 local-first 应用的开发者
**我想要** 同一个租户里分出管理员和员工：员工能同步、浏览本租户的全部商品，但不能新建、修改、删除，也看不到远端变更历史；管理员能改商品，还能调整成员的权限
**以便** 权限只由服务端 RLS 裁决：员工绕过界面直接写远端会被拒，降权之前在本机改下的修改推送时被拒并在本机对齐；`dev-rxdb-supabase` 把这一整条路径演示出来，接入方照着写自己的成员表与策略

## 立项

2026-11-26 owner 授权，并定下：

- 走 [epic-015](../../epics/epic-015-identity-scoped-sync.md) 已拍板的成员权限（read 对应查看，edit 对应增删改），不做全局角色。管理员 = `read + edit + manage`，员工 = `read`；界面按这两个预设显示，数据按权限集合存。
- 员工看不到远端变更历史，与 edit 同口径。员工能看成本价：列权限按数据库角色授予，员工与管理员都是 `authenticated`，分不出人；按人隐藏列不在本故事。
- 本地写入口的快速拒绝与三端界面按行派生由 [US-029](../core/US-029-rbac-owner-role-permission.md) 交付；本故事阶段 B 把演示接到它上面。

## 现状

1. **成员表没有权限。** [`catalog-demo.sql`](../../../apps/dev-rxdb-supabase/supabase/catalog-demo.sql) 的 `demo_tenant_members` 只有 `user_id`、`tenant_id`、`createdAt` 三列。
2. **写策略只看是不是成员。** 同一文件的 [`catalog_items_member_update`](../../../apps/dev-rxdb-supabase/supabase/catalog-demo.sql) 等三条商品写策略判的都是「行所属租户在调用者的区里」：

   ```sql
   USING (('tenant:' || "tenantId") = ANY((SELECT public.rxdb_caller_buckets())::text[]))
   ```

   所以租户里每个成员都能增删改本租户的商品，Bob（极光百货）实际就是管理员，演示里没有员工。远端变更历史的可见性 [`rxdb_caller_can_edit`](../../../apps/dev-rxdb-supabase/supabase/catalog-demo.sql) 在商品分支上同样只判成员资格。

3. **成员表整表可插入。** 自助加入靠 [`demo_tenant_members_join`](../../../apps/dev-rxdb-supabase/supabase/catalog-demo.sql) 策略（`WITH CHECK (user_id = (SELECT auth.uid()))`）与整表授权：

   ```sql
   GRANT SELECT, INSERT, DELETE ON public.demo_tenant_members TO authenticated;
   ```

   直接给这张表加一列权限，任何人都能插一行带 `edit` 的成员关系，把自己升成管理员。

4. **前端只判成员资格。** 立项时 [`CatalogLocalWrites.canEdit()`](../../../apps/dev-rxdb-supabase/src/app/catalog/catalog-local-writes.ts) 是 `this.$canWrite() && this.#remote.$myTenantIds().includes(item.tenantId)`，所在的租户直接读 `demo_tenant_members` 的 `tenant_id`；「历史」按钮也挂在 `canEdit` 上。
5. **引擎分不出身份。** 实体的 [`EntityOperationPermission`](../../../packages/rxdb/src/entity/entity-options.interface.ts) 只有 `'both' | 'system'`（US-027），是静态元数据，[US-034](../core/US-034-bucketed-entity-local-writes.md) 的技术笔记写明了这一点。
6. **被拒的处理已经有了。** 推送路径上 UPDATE 改到零行而行还在时报 42501，`04-rxdb-utils-functions.sql` 里 `rxdb_batch_update` 的注释写明「行仍存在 → 42501（reason=denied）」；DELETE 少删时用 [`rxdb_existing_ids`](../../../docker/sql/04-rxdb-utils-functions.sql) 探针区分被拒与已不存在。回执经 [US-218](US-218-supabase-rls-push-integrity.md) 落到本机对齐与「被拒的推送」，README 里「退出星河零售后再推送」走的就是这条路径。
7. **成员权限的取值有先例。** epic-015 说的「六项权限」定义在 admin-template 分支的协作模型里（`git show origin/admin-template:rxdb-admin-template/packages/collaboration/src/model.ts`）：

   ```ts
   export const permissions = ['read', 'edit', 'comment', 'review', 'merge', 'manage'] as const;
   ```

   同分支的 `src/server/membership.ts` 要求有效成员必须有 `read`，也不允许撤掉最后一个有 `manage` 的成员。

## 方案

### 服务端：唯一的安全边界

- **成员权限存在成员表。** `demo_tenant_members` 加权限集合列，缺省 `read`；取值限于上面六项，且必须含 `read`。
- **一个函数说清调用者在各作用域上的权限。** 平台在 `04-rxdb-utils-functions.sql` 增加 `rxdb_caller_grants()`：每个作用域一行，作用域键加权限数组。平台默认：anon 为空；登录用户只有自己的 `user:<auth.uid()>`，权限 `read + edit`，与 `rxdb_caller_can_edit_default`「分区实体只认调用者自己的 user 区」同口径。覆盖方式与 `rxdb_caller_buckets()` 相同，部署方 `CREATE OR REPLACE`；演示覆盖它，按成员关系补上 `tenant:<租户 id>`。
- **写策略、历史可见性与 `rxdb_caller_grants()` 出自同一个成员权限函数。** 三条商品写策略从「是成员」收紧为「在该租户有 `edit`」，`rxdb_caller_can_edit` 的商品分支同样改判 `edit`。写法沿用文档「配置 caller buckets」的语句级求值（`= ANY((SELECT …)::text[])`），不按行重复查成员表。
- **读不变。** 员工仍是成员，`rxdb_caller_buckets()` 照样返回 `tenant:<租户 id>`，本租户的内部商品照常同步。
- **防自我提权。** 成员表收回整表 INSERT，只按列授予 `tenant_id`，不授予 UPDATE，自助加入永远只拿到 `read`。改权限只走 `SECURITY DEFINER` 的 RPC：函数里校验调用者在该租户有 `manage`，拒绝撤掉最后一个管理员的 `manage`。管理员另经 RPC 列出本租户成员（含邮箱，匿名用户显示为匿名）。
- **初始管理员由服务端预置。** 演示账号加入各自的默认租户时由服务端授予管理员（按演示账号邮箱登记：Alice 管星河零售，Bob 管极光百货）；其他人自助加入都是员工。用触发器还是加入 RPC 留给实现。

### 演示：dev-rxdb-supabase 商品页

建在 epic-016 的页面骨架上：顶栏的编辑组与同步组按页面登记渲染（[US-230](US-230-supabase-header-sync.md)、[US-231](US-231-supabase-unified-undo-history.md)），「模拟服务端变更」在右侧抽屉里（[US-232](US-232-supabase-catalog-server-drawer.md)）。

- **身份与权限**：商品页的「身份与权限」区按租户列出当前身份的角色，如「星河零售 · 管理员」「极光百货 · 员工」；权限组合不是两个预设之一时，原样列出权限。
- **员工只读**：员工所在租户的商品，新建、编辑、删除、公开 / 收回都不可点，不可用原因是「员工只读」；没有「历史」按钮。新建表单的租户下拉只列出有 `edit` 的租户。
- **撤销、重做与推送不按角色禁用**：员工本来写不出商品修改；降权之前留下的未推送修改，降权之后仍能撤销，也能推送（推送时被拒）。
- **成员与权限**：抽屉里的成员关系一节增加「成员与权限」。调用者有 `manage` 的租户列出全部成员，每人一个「管理员 / 员工」切换；其余租户只显示自己的角色。自助加入、退出照旧，加入后是员工。
- **授权刷新**：连接时、每轮推拉之后（拉到的可能是别人调整过的成员关系，推送被拒多半是权限变了）、本页自己改了成员关系之后，各读一次 `rxdb_caller_grants()`。两次读之间界面可能还是旧权限，以推送时的服务端裁决为准。

### 阶段 B：演示接入引擎声明

`CatalogItem` 声明作用域（`tenantId`，前缀 `tenant:`）与增删改所需的 `edit`。商品页的可写判断改读 US-029 的按行能力与授权快照，删掉应用自己的判定。员工经公开写入口在本机写商品当场被拒，不留待推修改；离线重开沿用上次的授权快照。

## 范围边界

### In Scope

- 参考 SQL：平台默认 `rxdb_caller_grants()` 与执行权；演示的成员权限列、`rxdb_caller_grants()` 覆盖、写策略、历史可见性、成员管理 RPC、列权限、初始管理员
- 真栈用例：管理员、员工、非成员、anon 四种身份的读、写与历史矩阵，防自我提权，最后一个管理员
- 文档：Supabase 适配器文档的「配置成员权限」一节与升级说明
- 演示：身份与权限、员工只读、成员与权限面板、降权后推送被拒；远端 e2e 与 README
- 阶段 B：`CatalogItem` 的作用域声明，演示改读引擎能力

### Out of Scope

- 按人隐藏列（员工看不到成本价）：列权限按数据库角色授予，要走视图或 RPC，另立故事
- 同一个区里员工只能读其中一部分行：分区日志会让成员看到读不到的行的 id 与变更时间（epic-015「区内细分的权限」）
- 订单页（[US-227](US-227-supabase-relational-sync-demo.md)）的权限：已登录身份共享全部订单，那里演示的是外键关系
- 由实体声明生成 RLS（epic-015 非目标）
- 成员邀请、审批、权限审计日志；`comment / review / merge` 三项在商品上的语义
- 生产环境的成员维护：演示的自助加入、退出只为演示方便，生产由管理员或服务端维护成员表，见文档「配置 caller buckets」

## 验收标准

| #   | 前置条件                                                              | 操作                                                                                   | 预期结果                                                                                                                                                                                         | 状态 |
| --- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | 栈只加载 01～04 与生产权限脚本，不加载演示 SQL                        | anon、登录用户各调 `rxdb_caller_grants()`                                              | anon 为空；登录用户只有自己的 `user:<id>`，权限 `read + edit`                                                                                                                                    | ✅   |
| 2   | 加载演示 SQL；Bob 是极光百货的管理员；新的匿名用户 X 自助加入极光百货 | X、Bob 各调 `rxdb_caller_grants()`                                                     | X 在 `tenant:jiguang` 上只有 `read`；Bob 有 `read + edit + manage`                                                                                                                               | ✅   |
| 3   | 同上                                                                  | X 与 Bob 经 REST 各新建、修改、删除极光百货的商品（公开与内部各一件）                  | X 的新建报 42501，修改、删除零行，远端不变；Bob 全部成功                                                                                                                                         | ✅   |
| 4   | X 在本机改了一件极光百货的商品                                        | 推送                                                                                   | 该实体回执为被拒（42501）；本机按远端对齐，「被拒的推送」列出它；远端行、同步日志与远端变更历史都不变                                                                                            | ✅   |
| 5   | X                                                                     | 同步拉取并直接查询极光百货的公开与内部商品                                             | 都读得到，含成本价，与管理员看到的相同；访客仍读不到成本价                                                                                                                                       | ✅   |
| 6   | 同上                                                                  | X、Bob 各读一件极光百货商品的远端变更历史（`rxdb_entity_history`）                     | X 零条且不报错；Bob 读得到                                                                                                                                                                       | ✅   |
| 7   | X                                                                     | 经 REST 插入带权限的成员行、修改自己的成员行；调改权限的 RPC 给自己加 `edit`           | 全部被拒；X 的权限仍是 `read`                                                                                                                                                                    | ✅   |
| 8   | Bob 是极光百货唯一的管理员                                            | Bob 把 X 升为管理员；X 把 Bob 降为员工；X 再把自己降为员工                             | 前两步成功；第三步被拒，报错说明不能撤掉最后一个管理员                                                                                                                                           | ✅   |
| 9   | Bob                                                                   | 经改权限的 RPC 给 X 写入六项以外的权限，或不含 `read` 的权限                           | 被拒，X 的权限不变                                                                                                                                                                               | ✅   |
| 10  | `website/docs`                                                        | 阅读 Supabase 适配器文档                                                               | 有「配置成员权限」一节：`rxdb_caller_grants()` 的契约与平台默认；写策略与历史可见性同口径的写法；成员表的列权限；权限为什么不放 JWT；员工的列可见范围；降权后推送被拒；升级之后要重新加载覆盖    | ✅   |
| 11  | Bob 登录，打开商品页                                                  | 看「身份与权限」与本机同步的商品                                                       | 写着「极光百货 · 管理员」；极光百货的商品可新建、编辑、删除、公开 / 收回，有「历史」                                                                                                             | ✅   |
| 12  | Alice（星河零售管理员）在抽屉里加入极光百货并拉取                     | 看商品页                                                                               | 列出「星河零售 · 管理员」「极光百货 · 员工」；极光百货的内部商品同步进本机、成本价可见；星河零售的商品照常可改；极光百货的商品写入口不可点，原因「员工只读」，没有「历史」；新建表单只列星河零售 | ✅   |
| 13  | 同上                                                                  | 看顶栏的编辑组与同步组                                                                 | 撤销、重做、推送不显示「员工只读」，按各自的次数与状态可用                                                                                                                                       | ✅   |
| 14  | X 自助加入极光百货；Bob 在抽屉的「成员与权限」里看到 X                | Bob 把 X 升为管理员，X 拉取；Bob 再把 X 降为员工，X 拉取                               | 第一次拉取后 X 的写入口与「历史」出现；第二次拉取后又变回只读；X 的「成员与权限」里没有改权限的按钮                                                                                              | ✅   |
| 15  | X 是管理员时在本机改了一件极光百货的商品，未推送；Bob 把 X 降为员工   | X 推送                                                                                 | 「被拒的推送」列出这件商品，本机对齐远端；之后极光百货商品的写入口变灰                                                                                                                           | ✅   |
| 16  | 按 README 起好本地栈                                                  | 跑商品相关的远端 e2e（catalog-sync、catalog-local-writes 与新的成员权限用例）          | 场景一条不少，访客、Alice、Bob 原有场景照常通过；README 写明管理员与员工的试法                                                                                                                   | ✅   |
| 17  | `CatalogItem` 声明作用域与所需权限                                    | 跑 Supabase 适配器的真栈用例与演示的单测、远端 e2e                                     | 不回归                                                                                                                                                                                           | ✅   |
| 18  | X 是员工                                                              | 经公开写入口（实体 `save()` / `remove()`）在本机写极光百货的商品                       | 当场 `PermissionDeniedError`，待推数不变；商品页的可写判断出自引擎的按行能力，演示里不再有自己的判定                                                                                             | ✅   |
| 19  | X 是管理员，同步过一次后断网重开商品页                                | 在本机改极光百货的商品；断网期间 Bob 把 X 降为员工，X 重新联网后推送、拉取，再在本机改 | 断网时沿用上次的授权快照放行；推送被拒、本机对齐；拉取后授权快照刷新，之后的本机写当场被拒                                                                                                       | ✅   |
| 20  | README                                                                | 阅读                                                                                   | 写明本机判定来自实体声明与授权快照、它是快速失败，安全边界在 RLS                                                                                                                                 | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收入口：

- AC#1～9：`packages/rxdb-adapter-supabase/src/__tests__/` 下的真栈用例，以普通 authenticated 测试用户运行，单独跑这个 spec（不跑整个 `rxdb-adapter-supabase:test`）
- AC#11～16：`apps/dev-rxdb-supabase-e2e/src/catalog-member-permissions.spec.ts` 与改过锚点的 `catalog-sync.spec.ts`、`catalog-local-writes.spec.ts`；商品页组件单测
- AC#17：Supabase 适配器真栈 `tenant-member-permissions`、`caller-grants-source`、`catalog-local-writes`、`change-history`、`public-catalog-browse`、`change-log-pagination` 各自单独跑，外加只用 mock 的一组；PGlite 的 `catalog-local-writes.spec.ts`；演示单测；`e2e-remote` 两轮
- AC#18：`packages/rxdb-adapter-supabase/src/__tests__/tenant-member-permissions.spec.ts` 的 AC#18（员工经公开写入口新建、修改、删除当场被拒，变更日志不多一条）；商品页的写入口出自引擎由演示的 `catalog-local-writes.spec.ts`、`catalog-remote-state.spec.ts` 验收
- AC#19：同一个真栈 spec 的 AC#19（断网沿用快照放行、断网期间降权、联网推送被拒、拉取后本机写被拒）与 `catalog-member-permissions.spec.ts` 的 AC#19（浏览器里只断 Supabase、刷新页面重开）
- AC#20：`apps/dev-rxdb-supabase/README.md`「本机判定」两段与「管理员与员工」第 6 步

## 交付阶段

| 阶段 | 交付                                                                                                                             | 直接前置                                                                                          | AC     | 状态 |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------ | ---- |
| A    | 服务端成员权限与演示：参考 SQL、真栈用例、文档；商品页的身份与权限、员工只读、成员与权限面板、降权后推送被拒；远端 e2e 与 README | US-033（Done）、US-034、US-229、US-218（Done）；演示部分还要 US-230 阶段 A、US-231 阶段 A、US-232 | 1～16  | ✅   |
| B    | 演示接入引擎声明：`CatalogItem` 声明作用域，商品页改读引擎的按行能力与授权快照，员工本机写当场被拒，离线沿用授权快照             | A；US-029 阶段 C                                                                                  | 17～20 | ✅   |

一阶段一 PR，先写红测试；服务端用例不用 mock 的 `SupabaseDataError` 代替真实 RLS。

## 技术笔记

- **权限放成员表，不放 JWT 的 `app_metadata`**：权限按租户算，塞进令牌不自然；令牌里的角色要等刷新才生效，成员表改了下一次请求就生效（**推断**，依据 [Supabase RLS 文档](https://supabase.com/docs/guides/database/postgres/row-level-security)）。
- **列权限挡自我提权**：PostgreSQL 的 INSERT 列权限只检查语句里写到的列，演示的加入请求只写 `tenant_id`（`joinTenant()` 发的是 `insert({ tenant_id })`），收成按列授予后照常可用；初始管理员由服务端在加入时授予，不经客户端写的列。
- **e2e 不改 Alice、Bob 的初始权限**：员工、升降权、降权后推送的场景用每次新建的匿名用户；Alice 加入极光百货的场景结束时退出，回到初始状态。
- **撤销、重做不按角色禁用**：撤销、重做是适配器层的回放，US-027 与 US-029 都不判定；员工写不出修改，只会撤到降权之前留下的修改，撤掉它正是让本机回到远端的样子。
- **两个阶段的分工**：阶段 A 在演示里直接调 `rpc('rxdb_caller_grants')`，与现在 `fetchCallerBuckets()` 调 `rxdb_caller_buckets()` 是同一种做法；阶段 B 改由 Supabase 适配器读同一个函数、交给引擎（US-029 阶段 C），SQL 契约不变。
- **`CatalogItem` 是共享夹具**：它在 `packages/rxdb-test/entities/`，Supabase 适配器的真栈用例也用它；阶段 B 给它加声明时，这些用例的测试用户要有对应租户的 `edit`。
- **重跑 04 会把覆盖冲掉**：与 `rxdb_caller_can_edit` 一样，升级之后先重新加载演示 SQL，再执行生产权限脚本。
- **阶段 B 的落点**（2026-11-28）：授权只认引擎的快照，演示删掉了 `fetchCallerGrants()`；快照在远端连接时与每轮同步进门时由引擎刷新，商品页只在打开时与本页改了成员关系之后再调 `rxdb.grants.refresh()`，每轮推拉之后只重读租户与能读的区。快照只在内容变了才发布，所以改了别人的角色之后成员列表要自己重读（自己的授权多半不变）。新建表单的租户下拉用 `@aiao/rxdb-model` 新增的 `deriveCreateCapability()`，与写入口判 create 同口径。
- **AC#4 改成绕过本机判定**：阶段 B 起员工经公开写入口在本机就写不进去（AC#18），「推送被拒」改用本地适配器的 `mutations()`（系统写，不判定）留下修改，代表没装声明的旧客户端或直接改了本地库，服务端照样拒绝。`change-log-pagination.spec.ts` 只按名字经适配器拉商品的分区日志、没有本地主端，不再注册 `CatalogItem`（规则形式只支持本地主端）。

## 实现文件

| 阶段 | 文件                                                                                                                                                                                                                         | 改动                                                                                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| A    | `docker/sql/04-rxdb-utils-functions.sql`                                                                                                                                                                                     | `rxdb_caller_grants()` 平台默认；`rxdb_caller_scopes(p_permission)` 列出带某项权限的作用域，写策略与历史判定经它读同一份授权           |
| A    | `docker/sql/production/rxdb-change-grants.sql`                                                                                                                                                                               | 两个函数的执行权（`anon`、`authenticated`）                                                                                            |
| A    | `apps/dev-rxdb-supabase/supabase/catalog-demo.sql`                                                                                                                                                                           | 成员权限列与 CHECK、初始管理员登记与触发器、`rxdb_caller_grants()` 覆盖、写策略与历史可见性判 `edit`、列权限、成员列表与改权限两个 RPC |
| A    | `packages/rxdb-adapter-supabase/src/__tests__/tenant-member-permissions.spec.ts`                                                                                                                                             | 真栈用例（AC#2～9）；`catalog-local-writes.spec.ts`、`change-history.spec.ts` 的成员补上 `edit`                                        |
| A    | `packages/rxdb-adapter-supabase/src/__tests__/supabase-sql-security-regressions.sql`                                                                                                                                         | SQL 回归 `caller-grants`（AC#1：保存点里重新执行 04 与生产权限脚本，验平台默认与执行权）                                               |
| A    | `website/docs/adapters/supabase.md`、`website/docs/migration/supabase-member-permissions.md`                                                                                                                                 | 「配置成员权限」「装上成员权限」两节与升级说明                                                                                         |
| A    | `apps/dev-rxdb-supabase/src/app/catalog/`                                                                                                                                                                                    | `catalog-permissions.ts` 预设与换算、读授权（每轮推拉后重读）、按行可写判定、身份与权限、`catalog-members-panel.ts` 成员与权限         |
| A    | `apps/dev-rxdb-supabase-e2e/src/catalog-member-permissions.spec.ts`、`support/members.ts`                                                                                                                                    | 成员权限远端 e2e（AC#11～15）；原有商品用例的成员加入后由管理员设为管理员                                                              |
| A    | `apps/dev-rxdb-supabase/README.md`、`apps/dev-rxdb-supabase-e2e/README.md`                                                                                                                                                   | 管理员与员工的试法；e2e 里怎么给成员授权                                                                                               |
| B    | `packages/rxdb-test/entities/CatalogItem.ts`、`packages/rxdb-test/src/__tests__/entity-model-contract.spec.ts`                                                                                                               | 作用域与所需权限声明及其契约用例                                                                                                       |
| B    | `packages/rxdb-model/src/entity-capabilities.ts`                                                                                                                                                                             | `deriveCreateCapability()`：待建的行能不能新建                                                                                         |
| B    | `apps/dev-rxdb-supabase/src/app/catalog/`（`catalog-remote-state.ts`、`catalog-local-writes.ts`、`catalog-synced-panel.ts`、`catalog-members-panel.ts`、`catalog.page.ts`）                                                  | 授权改读 `rxdb.grants`、写入口改读引擎的按行能力，删掉应用层判定                                                                       |
| B    | `packages/rxdb-adapter-supabase/src/__tests__/tenant-member-permissions.spec.ts`、`caller-grants-source.spec.ts`、`change-log-pagination.spec.ts`；`packages/rxdb-adapter-pglite/src/__tests__/catalog-local-writes.spec.ts` | AC#18、#19 真栈用例，AC#4 绕过本机判定，夹具声明之后的配套改动                                                                         |
| B    | `apps/dev-rxdb-supabase-e2e/src/catalog-member-permissions.spec.ts`、`apps/dev-rxdb-supabase/README.md`                                                                                                                      | 断网重开的远端 e2e，本机判定的说明                                                                                                     |

## References

- [epic-015 按身份授权的同步与本机数据隔离](../../epics/epic-015-identity-scoped-sync.md) — 授权模型：成员权限，read 对应查看、edit 对应增删改
- [US-029 按作用域的成员写权限](../core/US-029-rbac-owner-role-permission.md) — 本地快速拒绝、授权快照与三端按行派生
- [US-034 分区实体的本地写入](../core/US-034-bucketed-entity-local-writes.md)、[US-229 远端变更历史](US-229-supabase-change-history.md)、[US-218 RLS 下的推送完整性](US-218-supabase-rls-push-integrity.md)
- [epic-016 本机修改工作台](../../epics/epic-016-local-change-workbench.md) — 页面登记、顶栏与右侧抽屉
- [Supabase 适配器文档](../../../website/docs/adapters/supabase.md) — 「配置 caller buckets」「远端变更历史」两节
- [PostgreSQL — Privileges](https://www.postgresql.org/docs/current/ddl-priv.html)、[PostgreSQL — Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
