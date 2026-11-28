---
id: US-039
title: 整库一个作用域：库里每一行都属于同一个团队时，实体不带作用域列也能按授权快照判定写入、三端按权限显隐
status: Backlog
priority: Medium
epic: epic-015-identity-scoped-sync
created: 2026-11-28
updated: 2026-11-28
tags: [core, permission, rxdb-model, identity]
---

<!--
INVEST 检查清单:
- [x] Independent: 建在已交付的 US-029 上，只多一种作用域来源；判定点、快照、fail-closed 与界面派生都沿用
- [x] Negotiable: 声明的键名（实体侧怎么写「取库级作用域」、实例侧怎么给值）可协商；「一个库一个作用域键、不读前像、与行作用域同一套判定」已定
- [x] Valuable: Admin 团队库按「用户 × 团队 × 应用」分库，业务实体没有团队列，今天声明不了作用域，三端 EntityList 用不上授权快照，见「现状」
- [x] Estimable: US-029 的判定（`permission-rules.ts`）与界面派生（`entity-capabilities.ts`）各加一个分支
- [x] Small: 一个声明形式、一个实例选项、两处判定分支
- [x] Testable: 沿用 US-029 的契约套件，PGlite 与六个 SQLite 系后端同一组断言
-->

# 用户故事：整库一个作用域

## 作为/我想要/以便

**作为** 按团队、租户或项目分库的 local-first 应用开发者
**我想要** 在打开库时声明「这个库属于作用域 `team:<teamId>`」，实体只写增删改各要求哪项权限
**以便** 没有 `edit` 的成员在本地写入口当场被拒、三端实体列表按同一份授权快照隐藏新增、编辑与删除，而不必给每个业务实体加一列只为承载作用域的团队 id

## 立项

[US-029](US-029-rbac-owner-role-permission.md) 把「全局作用域（不随行变化的固定作用域）」放在范围外，写明「出现具名使用方时追加」。2026-11-28 具名使用方出现：Admin 团队库。owner 同日定方向，Admin 连 Supabase 走平台标准逻辑，平台缺的补成可复用能力；Admin 接入由 [ADMIN-US-224](../../../rxdb-admin-template/requirements/stories/collaboration/ADMIN-US-224-team-database-standard-grants.md) 承接。

## 现状

1. **作用域只能来自行属性。** US-029 的声明要求 `access.scope.property` 指向实体上已声明、`string` / `uuid`、不可空的普通属性，行的作用域键 = `prefix` + 属性值；不满足在配置期报错，引擎不自动补列。
2. **Admin 团队库整库属于一个团队。** 团队库按 [`teamDatabaseName()`](../../../rxdb-admin-template/packages/collaboration/src/client/team-database.ts) 的「用户 × 团队 × 应用」分库，实体是应用业务实体的克隆（资产分类、资产、维护记录），没有团队列；给它们加列会进入协作的 schema 清单与三端默认表格。
3. **于是 Admin 手写了权限显隐。** 团队任务编辑用的三端 `EntityList` 只收命名空间、实体名与未保存回调，资产实体没有声明 `permissions` / `access`，每一行都可编辑；真正的拦截是「打开任务要求是作者且有 `edit`」与服务端上传时的校验，协作界面另按内存里的成员列表判 `hasPermission()`（[`workspace-view.ts`](../../../rxdb-admin-template/packages/collaboration/src/client/workspace-view.ts)），离线没有可用的权限记录。

## 范围边界

### In Scope

- **实例侧**：打开库时可以给出库级作用域键（非空字符串，如 `team:<teamId>`），存进实例配置，不随运行时改变；换作用域就是换库。
- **实体侧**：声明「作用域取库级」的形式，配合 US-029 的规则 `{ requires }`；与按属性的作用域互斥，同一实例里不同实体可以各用一种。
- **判定**：create / update / delete 都按库级作用域查授权快照，不读前像（作用域不随行变化）；快照未取到时 fail-closed；批量任一行被拒整次拒绝；违规清单的形状与 US-029 一致。
- **校验**：实体声明了库级作用域而实例没给作用域键、作用域键为空、同一实体两种作用域都写，均在配置期报错。
- **界面**：`deriveRowCapabilities` / `deriveCreateCapability` / `deriveWriteBlockedReason` 与 `buildEditableColumns({ grants })` 支持库级作用域；Angular / React / Vue 的 `EntityList` 随 `snapshot$` 即时重算，三端跑同一组 e2e。
- **授权来源不变**：远端 `callerGrants()`（Supabase 的 `rxdb_caller_grants()` 返回 `team:<id>` 这一行即可）或无远端时 `rxdb.grants.set()`。

### Out of Scope

- 一库多作用域、作用域键在运行时切换。
- 按作用域隐藏读：读授权仍由服务端裁决（US-033），本地只管写。
- 字段级权限、角色注册表（同 US-029）。

## 验收标准

| #   | 前置条件                                                                | 操作                                 | 预期结果                                                                     | 状态 |
| --- | ----------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------- | ---- |
| 1   | 库级作用域 `team:t1`，实体增删改要求 `edit`；快照有 `team:t1` 的 `edit` | 经公开写入口增删改                   | 全部放行；判定不读前像                                                       | ⬜   |
| 2   | 同上，快照只有 `team:t1` 的 `read`                                      | 新建、修改、删除，及含一条违规的批量 | 都抛 `PermissionDeniedError`，违规带作用域、所需权限与原因；批量一条都不写   | ⬜   |
| 3   | 快照未取到                                                              | 写入                                 | fail-closed，原因是「授权未知」                                              | ⬜   |
| 4   | 实体声明库级作用域而实例没给作用域键；或同一实体两种作用域都写          | 打开库                               | 配置期报错，写明实体与缺的配置                                               | ⬜   |
| 5   | 三端 `EntityList` 绑定库级作用域的实体                                  | 快照从 `edit` 降为 `read`，再升回    | 不刷新页面：新增入口隐藏、所有行只读、删除入口消失；升回后恢复；三端结果一致 | ⬜   |
| 6   | 远端是 Supabase，`rxdb_caller_grants()` 返回 `team:t1`                  | 连接、离线重开                       | 快照来源 `remote`，离线重开沿用上次快照，判定与界面同 AC#1、#5               | ⬜   |
| 7   | 按属性作用域的实体（US-029 的 `CatalogItem`、`TenantNote`）             | 跑 US-029 的契约套件                 | 结果不变                                                                     | ⬜   |
| 8   | PGlite 与六个 SQLite 系后端                                             | 跑同一组库级作用域契约用例           | 结果一致                                                                     | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：随实现补齐——核心契约套件、三端 `EntityList` e2e 与复验命令。

## 技术笔记

- 判定在 [`permission-rules.ts`](../../../packages/rxdb/src/entity/permission-rules.ts) 的前像读取之前分流：库级作用域的实体直接按实例作用域键判，省掉每实体一次 `WHERE id IN (…)`。
- 新增实例选项会触到公开面门禁：`pnpm audit:api-surface` 与 `corePrefixExceptions`（见核心系统表与导出的手写清单）。
- 实体级 `canCreate`：US-029 看「快照里有没有一个带该前缀的作用域满足 `create`」，库级作用域直接看那一个键，不再猜前缀。

## 实现文件

- `packages/rxdb/src/entity/` — 声明校验与判定分支
- `packages/rxdb-model/src/entity-capabilities.ts` — 行级能力派生
- `packages/rxdb-model-{angular,react,vue}/` — `EntityList` 回归（预计不改组件，只加用例）

## References

- [US-029 按作用域的成员写权限](US-029-rbac-owner-role-permission.md)
- [US-027 实体操作权限模型](US-027-entity-permission-model.md)
- [epic-015 按身份授权的同步与本机数据隔离](../../epics/epic-015-identity-scoped-sync.md)
