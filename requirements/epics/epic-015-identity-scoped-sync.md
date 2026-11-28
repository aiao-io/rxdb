---
id: epic-015-identity-scoped-sync
status: In Progress
startDate: 2026-11-19
targetDate: TBD
owner: jimmy
---

# 按身份授权的同步与本机数据隔离

## 愿景

同一后端的两个用户只能读写各自获准的数据。换账号、断线重连、授权扩大或收回之后，本机可见的数据最终等于服务端以该身份重新查询的结果；旧账号的草稿、待发请求和迟到响应不会进入新账号。能力落在 `packages/*`，Admin 是第一个三端业务验收，不是唯一入口。

## 为什么单列一个 Epic

[US-225](../stories/adapter/US-225-supabase-sync-protocol-access-baseline.md) 收口 anon 与分支写入之后，Supabase 日志同步已经支持按 `rxdb_caller_buckets()` 隔离带 bucket 的日志与实时通知，但未分区旧日志仍对全部 authenticated 可读。`SyncType.Filter` 的过滤条件由客户端传、不构成授权，账号切换后的本机数据清理、按行不可见即不存在、完整三端身份绑定仍需按身份授权方案继续推进，不属于 epic-004 的单点加固，也不属于 epic-006 / epic-014 的提交图能力。

## 立项

owner 明确了目标：不同用户同步到自己有权限的数据是关键，没登录的用户能看到全部公开数据。据此立项，先做每个身份一个本地库（[US-035](../stories/core/US-035-identity-bound-local-database.md)）、只读同步（[US-033](../stories/core/US-033-identity-scoped-read-sync.md)）与规则之外公开数据的在线浏览（[US-036](../stories/core/US-036-browse-public-data-outside-sync-rule.md)），写入与实时刷新放在后续故事。

## 已拍板的方向

以下是当前生效的结论，按主题排列。

### 授权模型

- **读授权按分区裁决。** 数据按授权边界分区（公开区、每个租户或团队一个区，需要时每人一个区）。区由服务端算（业务表的生成列），谁能读哪些区由 RLS 裁决。owner 确认权限是租户、团队、项目这类分区式的，且登录用户需要离线可用、可写的完整同步。
- **授权与筛选分开。** 实体同步规则（`remote.filter()`）只在能读的区里挑行，客户端改规则扩大不了授权。
- **正文由业务表裁决。** 分区日志只记哪个区的哪一行变了，不存行内容；正文在拉取时按调用者身份从业务表读，业务表的 RLS 与列权限照常生效。依据见 [US-033 的试验记录](../stories/core/US-033-bucket-log-spike.md)。
- **权限沿用成员现有的六项权限。** 六项是 admin-template 协作模型的 `read / edit / comment / review / merge / manage`（`git show origin/admin-template:rxdb-admin-template/packages/collaboration/src/model.ts`）。行级策略直接读成员权限：read 对应 SELECT，edit 对应增删改。不引入 GitHub 式 read / write / maintain / admin 四级角色。
- **租户内分管理员与员工。** 管理员 = `read + edit + manage`，员工 = `read`，是权限集合的两个预设，不是固定角色。权限存在成员表，不放 JWT；写策略、远端变更历史的可见性与 `rxdb_caller_grants()` 出自同一个成员权限函数。员工看不到远端变更历史；员工能看到成本价，因为列权限按数据库角色授予，分不出员工与管理员（[US-234](../stories/adapter/US-234-supabase-tenant-member-permissions.md)）。
- **本地按作用域判定只是快速失败。** 实体声明行的作用域与增删改所需的权限，越权在本地公开写入口当场拒绝，三端界面按行显隐；安全边界仍只在 RLS（[US-029](../stories/core/US-029-rbac-owner-role-permission.md)）。
- **公开数据给 anon，不靠匿名账号。** 公开区对 anon 可读，未登录用户直接以 anon 身份同步；匿名登录只留给演示推送一类场景。

### 同步协议

- **分区日志与旧日志同表、按区隔离。** 分区实体的变更照样记进 `rxdb_change`，带上 `bucket` 列；读取与实时频道按 `rxdb_caller_buckets()` 放行，未分区的旧日志保持 [US-225](../stories/adapter/US-225-supabase-sync-protocol-access-baseline.md) 的授权。试验时定的是单独成表，实现改成了加列，以 [US-033](../stories/core/US-033-identity-scoped-read-sync.md) 与参考 SQL 为准。
- **变更历史与同步日志分开。** 同步日志（含分区日志）不带正文的规则不变；完整前后快照、操作者与来源只进独立的历史表，覆盖所有登记同步的表，只对当前能编辑该行的成员经受控 RPC 按列权限开放（[US-229](../stories/adapter/US-229-supabase-change-history.md)）。
- **一行换区时旧区只记移除。** 换租户、公开改私有时，旧区的成员只收到「移除」，新区收到一条写入。
- **公开数据也走分区同步，按实体同步规则只取一部分。** 登录用户与 anon 都能订阅公开区，但只同步实体规则选中的行（例如关注的分类、近期的、收藏的），这部分离线可用；不做公开数据的全量下载。
- **进度与规则绑定，规则变化要补齐与清理。** 拉取进度按区 × 实体分开，并记下当时的规则。加入区或放宽规则时先拉快照再增量；退出区、收窄规则或行离开规则时自动清理本地，跳过未推送的行。滚动时间窗口这类只收窄的变化不重拉快照。
- **直读对账只留给在线浏览。** 以身份直读业务表再对账（QueryCache）只覆盖查过的范围，加入、退出租户要全量对账，Supabase 下不能写远端，因此只保留给「不落地、只在线浏览」。
- **实时刷新放到后续故事。** 第一批故事靠同步时拉取。

### 本机隔离

- **每个身份一个本地库。** 库与身份绑定，对不上就停下报错、不混数据，不自动改绑；应用按身份打开各自的库。拉取进度随库隔离，不需要再按身份分键。
- **会话与换号归平台。** 2026-11-28 owner 定方向：应用连 Supabase 要有一套标准逻辑。登录、会话恢复、离线身份、跨标签页与按身份换库由平台会话层提供（[US-237](../stories/adapter/US-237-supabase-session-layer.md)），应用不再各写一套；Admin 是它的第一个三端业务验收。

### 范围边界

- **不做分支远程删除保护。** 平台和产品都没有远程删除分支的功能，有了再谈。
- **Admin 现有协作链路不动。** 团队共享数据保持 `SyncType.None` + 提交交换 + 仅经 PR 合并（admin-template 分支 `rxdb-admin-template/requirements/decisions.md` 的 D-06、协作契约 C06）。Admin 连接层（会话、身份、授权快照）改走本 Epic 的平台能力；把仅经 PR 的链路做成可复用能力登记在 [epic-017](epic-017-pr-only-team-data.md)，不在本 Epic。

## 目标

- [ ] 两用户、两租户的公共包契约测试：同一远端、一个直写实体，覆盖首次同步、成员关系变化而业务行未写、换号时在途的拉取与推送、离线待推与重连，以服务端按该身份的查询结果作对照（只读部分由 [US-033](../stories/core/US-033-identity-scoped-read-sync.md) 认领，写入待后续故事）
- [ ] 实体声明隔离范围：元数据声明租户键或作用域；声明了隔离而后端不具备按身份读取时，连接即报错，不降级为普通 `Filter`（写入作用域的声明，以及远端缺授权函数时连接即报错，由 [US-029](../stories/core/US-029-rbac-owner-role-permission.md) 认领；读取隔离的声明**尚无故事认领**）
- [ ] 失权移除：授权代次变化时锁住旧投影，按当前身份重建后原子替换，中途再次变权就废弃本轮；待推变更与可读投影分开保留，重新授权前不重放（**尚无故事认领**）
- [ ] 本机数据按账号隔离：库名使用不含 PII 的不透明键，打开后校验库内记录的作用域与当前会话一致；切换账号时多标签页广播锁定代次，迟到的回调按会话代次丢弃；提供「从此设备移除此账户数据」（库名、打开时与同步前的身份校验、换身份时在途响应的丢弃由 [US-035](../stories/core/US-035-identity-bound-local-database.md) 认领；多标签页的身份变化广播与按代次丢弃迟到回调由 [US-237](../stories/adapter/US-237-supabase-session-layer.md) 认领；「从此设备移除此账户数据」**尚无故事认领**；恢复归档时按身份核对、别的身份的备份恢复不进来由 [US-040](../stories/core/US-040-restore-identity-binding.md) 认领；Admin 本机工作台库的按账号隔离由 ADMIN-US-222 承接）
- [ ] 区内细分的权限：同一个区里成员可读的列不同时，正文按当前身份从业务表读（由 [US-033](../stories/core/US-033-identity-scoped-read-sync.md) 认领）；同一个区里可读的行不同时，分区日志会让成员看到自己读不到的行的 id 与变更时间，要先评估这层元数据（**尚无故事认领**）
- [ ] 规则之外的公开数据：立项目标是没登录的用户能看到全部公开数据，而分区同步只落地规则选中的行；同一个实体的同步类型互斥，不能同时走 QueryCache 在线浏览其余公开行（另声明一个只读浏览实体的做法由 [US-036](../stories/core/US-036-browse-public-data-outside-sync-rule.md) 认领；一个实体既同步又在线浏览**尚无故事认领**）
- [ ] 写入模式：实体声明只读、直写或仅经 PR；直接 REST、RxDB 推送、离线重放与服务端命令执行同一模式（直写模式下分区实体的本地写入、撤销/重做与推送由 [US-034](../stories/core/US-034-bucketed-entity-local-writes.md) 认领；按成员权限的只读即员工，服务端与演示由 [US-234](../stories/adapter/US-234-supabase-tenant-member-permissions.md) 认领，本地判定与界面由 [US-029](../stories/core/US-029-rbac-owner-role-permission.md) 认领，整库属于一个作用域时的判定与界面由 [US-039](../stories/core/US-039-instance-access-scope.md) 认领；仅经 PR 登记在 [epic-017](epic-017-pr-only-team-data.md)，价值待证）
- [ ] 远端变更历史：每次业务写入在独立于同步日志的历史表里记完整前后快照、操作者与来源，只对当前能编辑该行的成员经受控 RPC 按列权限开放（由 [US-229](../stories/adapter/US-229-supabase-change-history.md) 认领）
- [ ] 存在性信号：读授权落地后，推送对不可见的行按「不存在」处理，取代 [US-218](../stories/adapter/US-218-supabase-rls-push-integrity.md) AC#2 对「被拒绝」与「已不存在」的区分（**尚无故事认领**）
- [ ] 租户内成员权限：同一租户里管理员能改、员工只能看；越权的写在服务端被拒、在本机对齐，本地写入口当场拒绝，三端按行显隐（服务端与 `dev-rxdb-supabase` 演示由 [US-234](../stories/adapter/US-234-supabase-tenant-member-permissions.md) 认领，本地判定与三端界面由 [US-029](../stories/core/US-029-rbac-owner-role-permission.md) 认领）
- [ ] 三端验收：Angular / React / Vue 对同一权限矩阵运行同一组用户流程（实体列表与详情的权限矩阵由 [US-029](../stories/core/US-029-rbac-owner-role-permission.md) 阶段 D 认领；身份切换的平台能力由 [US-237](../stories/adapter/US-237-supabase-session-layer.md) 认领，三端业务验收由 Admin 的 ADMIN-US-222～224 承接；同步流程**尚无故事认领**）
- [ ] 只接身份与授权：自带数据协议、不走日志同步的库也能用平台的身份核对与授权快照，服务端只需授权函数（由 [US-238](../stories/adapter/US-238-supabase-adapter-identity-grants-only.md) 认领）

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [US-033 按授权分区同步（只读）：分区决定能读什么，实体同步规则决定同步哪些](../stories/core/US-033-identity-scoped-read-sync.md) (High)
- [US-035 每个身份一个本地库：打开时核对身份，换账号不混数据](../stories/core/US-035-identity-bound-local-database.md) (High)
- [US-036 规则之外的公开数据：在线浏览走只读浏览实体，不进同步子集](../stories/core/US-036-browse-public-data-outside-sync-rule.md) (High)
- [US-034 分区实体的本地写入：本地增删改可撤销/重做，推送后锁定](../stories/core/US-034-bucketed-entity-local-writes.md) (High)
- [US-229 Supabase 远端变更历史：每次业务写入记完整前后快照，只对能编辑的成员开放](../stories/adapter/US-229-supabase-change-history.md) (High)
- [US-234 Supabase 租户内成员权限：管理员能改、员工只能看，dev-rxdb-supabase 完整演示](../stories/adapter/US-234-supabase-tenant-member-permissions.md) (High) — A 服务端成员权限与演示（演示部分排在 epic-016 的页面骨架之后）→ B 演示接入引擎声明（前置 US-029 阶段 C）
- [US-029 按作用域的成员写权限：实体声明作用域与所需权限，本地写入口快速拒绝，三端按行显隐入口](../stories/core/US-029-rbac-owner-role-permission.md) (High) — A 声明与校验 → B 授权快照与本地判定 → C Supabase 授权来源（前置 US-234 阶段 A）∥ D 三端按行派生
- [US-237 Supabase 会话层：一个客户端负责登录、会话恢复、离线身份与按身份换库，应用不再各写一套](../stories/adapter/US-237-supabase-session-layer.md) (High)
- [US-039 整库一个作用域：库里每一行都属于同一个团队时，实体不带作用域列也能按授权快照判定写入、三端按权限显隐](../stories/core/US-039-instance-access-scope.md) (Medium)
- [US-238 Supabase 适配器只接身份与授权：不走日志同步的库不订阅变更频道、不探日志表，服务端只需授权函数](../stories/adapter/US-238-supabase-adapter-identity-grants-only.md) (Medium)
- [US-040 恢复归档时核对身份绑定：别的身份的备份恢复不进当前身份的库，没有绑定的旧备份照常恢复](../stories/core/US-040-restore-identity-binding.md) (High)

前置的访问底线 [US-225](../stories/adapter/US-225-supabase-sync-protocol-access-baseline.md) 归 epic-004。

## 演示

`dev-rxdb-supabase` 的 `/catalog`（商品目录）在同一个后端上走通第一批三个故事，说明见 [demo README](../../apps/dev-rxdb-supabase/README.md#商品目录按身份授权的同步)：

- 访客（anon，不登录）只同步公开区里规则选中的分类，成本价没有列权限；Alice（星河零售）、Bob（极光百货）各自还同步所在租户的内部商品（US-033 AC#1、#2）。
- 「模拟服务端变更」以当前身份直写业务表：公开改内部、删除、加入或退出租户之后同步，本机按区补快照或整块清理（US-033 AC#3～#7）。
- 每个身份一个本地库，切换身份就是打开另一个库；别的标签页换了身份，本页同步被身份守卫拦下（US-035）。
- 规则之外的公开商品在线浏览，一键把分类加进同步规则（US-036）。
- 所在租户的商品在本机新建、编辑、删除，推送之前撤销、重做，推送之后锁定；访客的写入口禁用（US-034）。
- 所在租户的商品打开「历史」看远端记下的每次修改：前后值、操作者与写入路径；访客与别的租户的成员没有入口（US-229）。
- 远端 e2e：[catalog-sync.spec.ts](../../apps/dev-rxdb-supabase-e2e/src/catalog-sync.spec.ts)、[catalog-local-writes.spec.ts](../../apps/dev-rxdb-supabase-e2e/src/catalog-local-writes.spec.ts)。

## 现状核实（`258856694`）

| 论断                             | 证据                                                                                                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 日志拉取不经业务表 RLS           | [`rxdb_pull_changes`](../../docker/sql/02-rxdb-sync-functions.sql) 读的是 `rxdb_change` 本身，业务表的策略管不到日志里的 `beforeData` / `afterData`                         |
| filter 只缩小范围，不是授权      | 同一函数的 `p_filter` 由客户端传、可以不传；`OR NOT change."snapshotComplete"` 让快照不完整的日志直接放行                                                                   |
| 失去读权限的行留在本机           | 增量拉取只写入新变更，没有「此行对你已不可见」的移除信号                                                                                                                    |
| 游标不分身份                     | [`sync-record-utils.ts`](../../packages/rxdb/src/sync-contract/sync-record-utils.ts) 的 ``const syncId = `${namespace}:${entity}:${branchId}`;``                            |
| QueryCache 的对账天然受 RLS 约束 | [`QueryCacheEngine`](../../packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts) 以调用方身份查远端元数据，`planReconcile` 把 `orphanIds` 列入删除，出站队列占着的行跳过 |
| `context.userId` 不是凭据        | 由调用方设置，只用于写审计；实体的 `'both' / 'system'` 写权限不判成员、所有者或行读取（[US-027](../stories/core/US-027-entity-permission-model.md)）                        |

## 验收矩阵（立项时细化）

- 同一 authenticated 角色下两个用户、两个租户：首次同步、成员关系变化而业务行不变、换号、断线重连、分页期间权限变化之后，本机集合等于以该身份重新执行授权查询的结果。
- 篡改租户键、主键、提交作者或分支 ID 都被拒绝；被拒的写入不产生部分业务更改，也不产生审计副作用。
- 业务表没有 SELECT 授权、RLS 无匹配策略、列权限不足分别得到正确的拒绝；不把「查询返回 0 行」一律当成权限错误。
- 账户 A 切换到 B 后，数据库、查询缓存、working-tree、游标、待推队列与迟到响应完全隔离；A 重新登录并经服务端授权后才恢复 A 的数据。
- 同一主体刷新令牌且授权未变时不重建。

## 待冻结的决策

1. 首批纳入的实体，以及每个实体的 `sync.type` 与写入模式；不默认所有表都适合双向同步或整行缓存。不阻塞 US-033，它用专门的测试夹具实体验收；**阻塞第一个产品实体的接入与三端验收**。
2. 锁定后保留的本机数据保留多久、无待发送内容时的自动清理条件、共享设备是否退出即清理、备份导出规则。不阻塞 US-033 与 US-035，随「从此设备移除此账户数据」的故事定。
3. 重新对账的代价上限：加入一个区或实体规则被改写时，要按「区 × 实体」重拉快照并对账；数据量到多少时改为分批或后台进行。用试点实体的首次同步字节数、重连耗时与每轮扫描行数来定。**阻塞 US-033 阶段 B 的关闭**；起点数据见 [US-033 的试验记录](../stories/core/US-033-bucket-log-spike.md)的量级表。
4. 授权代次从哪里来：成员关系表的版本号、令牌声明，还是服务端接口。US-033 用不到它，每轮同步取一次能读的区、与本地比较即可；**阻塞「失权移除」与写入故事**。

## 非目标

- 分支远程删除保护。
- GitHub 式 read / write / maintain / admin 四级角色。
- 改写 Admin 现有的 PR 协作链路，或对同一份团队数据再开日志同步双写。
- 由实体配置自动生成 RLS 策略；任意 SQL RLS 也不能反推成前端 ACL。
- CRDT 与自动合并：同步冲突按 git 方式由用户裁决（见 [livestore-research](../livestore-research.md) 结论表）。
- 在浏览器使用 `service_role` 或其他绕过 RLS 的凭据。

## References

- 原始设计稿 `redesign.md` 由本 Epic 取代，已随 admin-template 分支的 `3855b58e` 删除；原文可用 `git show dded3edc:redesign.md` 取回。
- [US-218 RLS 下的推送完整性](../stories/adapter/US-218-supabase-rls-push-integrity.md)、[US-225 Supabase 日志同步的访问底线](../stories/adapter/US-225-supabase-sync-protocol-access-baseline.md)
- [US-033 的试验记录：分区日志带不带正文、是否单独成表](../stories/core/US-033-bucket-log-spike.md)
