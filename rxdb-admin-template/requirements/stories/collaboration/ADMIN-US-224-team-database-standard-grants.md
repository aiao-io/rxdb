---
id: ADMIN-US-224
title: 团队库接入标准 Supabase 适配器：身份核对、成员授权快照与按权限显隐
status: Backlog
priority: Medium
epic: ADMIN-EPIC-005
created: 2026-11-28
updated: 2026-11-28
tags: [admin, permission, supabase, rxdb-model, collaboration]
dependsOn: [ADMIN-US-203, ADMIN-US-221, ADMIN-US-222]
capabilities: [rxdb:US-029, rxdb:US-039, rxdb:US-238]
---

# 用户故事：团队库接入标准 Supabase 适配器

## 作为/我想要/以便

**作为** 团队成员（编辑者、审核者、只读成员）
**我想要** 团队任务里的实体列表与表单按我在该团队的权限显隐新增、编辑与删除，断网重开后仍按上次在线取到的权限
**以便** 界面与服务端用同一份授权（[ADMIN-US-203](ADMIN-US-203-permission-server-isolation.md)「UI 的可见性和服务端授权使用同一权限结果」），且这份授权走平台标准，而不是协作包自己拼

## 背景

- 现状：团队任务编辑用三端 `EntityList`（`apps/*/src/app/pages/team-editor.*`），只收命名空间、实体名与未保存回调；资产实体没有声明 `permissions` / `access`，每一行都可编辑。拦截靠「打开或保留任务要求是作者且有 `edit`」（协作包 `controller.ts`）与服务端上传时的校验；协作界面按内存里的成员列表 `hasPermission()`（`workspace-view.ts`）显隐，离线没有权限记录。
- 平台标准：`rxdb_caller_grants()` → 适配器 `callerGrants()` → `rxdb.grants`（存进本地库、离线沿用）→ `deriveRowCapabilities` 等 → 三端 `EntityList` 随 `snapshot$` 重算（平台 US-029；六项权限沿用 Admin 的定义）。团队库整库属于一个团队，需要平台 US-039 的库级作用域；团队库不走日志同步，需要平台 US-238 的「只接身份与授权」。
- 服务端：成员权限在 `admin_private.memberships`（六项权限、`can_read` 生成列），由领域引擎的 `authorize()` 裁决（协作包 `server/access.ts`）。方向见 [D-11](../../decisions.md#d-11supabase-接入走平台标准层) 第 1 条。

## 范围边界

### In Scope

- 产品迁移新增 `public.rxdb_caller_grants()`：按当前会话返回调用者在各团队应用作用域上的权限（作用域键的口径随平台 US-039 定，如 `team:<teamId>:app:<appId>`），与引擎 `authorize()` 读同一份成员数据（启用、已验证、权限）；按平台 US-238 的最小安装集部署，不引入日志同步表与直写 RPC。
- 团队库以会话层的同一个客户端连接 `RxDBAdapterSupabase`（只接身份与授权），开启库级作用域；团队实体的增删改声明所需权限 `edit`。
- 三端团队任务编辑的 `EntityList` 随授权快照显隐：没有 `edit` 时新增入口隐藏、行只读、删除入口消失；降权后不刷新页面即生效，随后按现有规则锁定任务（D-10 第 3 条）。
- 协作界面里依赖「当前用户在本团队有哪些权限」的入口，在团队库已打开时读授权快照（离线一致）；团队库没打开的页面（团队列表、成员管理）仍按在线读到的成员列表。
- 本地判定只是快速失败：服务端校验与锁定规则不变。

### Out of Scope

- 非作者以只读方式打开别人的任务分支（今天打开任务要求是作者），另起故事评估。
- PR 面板里审核、合并、评论权限的界面判定改读快照：随本故事评估，不承诺。
- 把成员管理搬出领域引擎（锁顺序见 [D-09](../../decisions.md#d-09协作后端收敛方向) 第 2 条）。

## 验收标准

| #   | 前置条件                                         | 操作                   | 预期结果                                                                                        | 状态 |
| --- | ------------------------------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------- | ---- |
| 1   | 编辑者打开自己的任务                             | 增删改记录             | 入口可用，写入照常进入任务工作树                                                                | ⬜   |
| 2   | 编辑者在任务打开期间被降为只读                   | 观察实体列表与表单     | 不刷新页面：新增隐藏、行只读、删除消失；随后任务按现有规则锁定                                  | ⬜   |
| 3   | 从未在线取到快照（首次就离线冷启动）             | 打开任务               | 写入口全关，原因是「授权未知」；与 C01 的冷启动规则一致                                         | ⬜   |
| 4   | 在线取到过快照之后断网重开                       | 打开已解锁的任务       | 沿用上次的快照，显隐与断网前一致                                                                | ⬜   |
| 5   | 没有 `edit` 的成员绕过界面，经公开写入口写团队库 | 写入                   | 本地抛 `PermissionDeniedError`，不进工作树；服务端规则不变                                      | ⬜   |
| 6   | 团队的 Supabase 项目只部署产品迁移               | 连接团队库             | 只调用 `rxdb_caller_grants()`；没有变更频道订阅与日志表自检，也没有 `rxdb_mutations` 等直写入口 | ⬜   |
| 7   | `rxdb_caller_grants()` 与引擎 `authorize()`      | 对六项权限矩阵逐项比对 | 两者结论一致                                                                                    | ⬜   |
| 8   | 三端                                             | 跑同一组 e2e           | 结果一致                                                                                        | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：随实现补齐。

## 技术笔记

- 团队库在打开任务时才懒加载；授权快照随团队库存取，所以只有团队库打开之后才有离线可用的权限。团队列表等页面继续在线读成员列表，不为它们另存一份。
- 连接适配器多了一条连接路径：断网、令牌过期时 `callerGrants()` 失败按平台 US-029「连接时离线沿用快照」处理，不能挡住 C01 的离线热续作。

## 实现文件

- `rxdb-admin-template/supabase/migrations/` — `public.rxdb_caller_grants()`
- `rxdb-admin-template/packages/collaboration/src/client/team-database.ts` — 适配器连接与库级作用域
- `rxdb-admin-template/apps/{react,angular,vue}/src/app/entities/`、`pages/team-editor.*` — 实体权限声明与编辑界面

## References

- [平台 US-029 按作用域的成员写权限](../../../../requirements/stories/core/US-029-rbac-owner-role-permission.md)
- [平台 US-039 整库一个作用域](../../../../requirements/stories/core/US-039-instance-access-scope.md)
- [平台 US-238 Supabase 适配器只接身份与授权](../../../../requirements/stories/adapter/US-238-supabase-adapter-identity-grants-only.md)
- [Supabase 接入标准化计划](../../plans/supabase-standardization-tasks.md)
