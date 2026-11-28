---
id: US-029
title: 按作用域的成员写权限：实体声明作用域与所需权限，本地写入口快速拒绝，三端按行显隐入口
status: Done
priority: High
epic: epic-015-identity-scoped-sync
created: 2026-09-20
updated: 2026-11-28
tags: [core, permission, rbac, rxdb-model, identity]
---

<!--
INVEST 检查清单:
- [x] Independent: 阶段 A 只依赖 US-027 阶段 A；B 依赖 A、US-027 阶段 B 与 US-035；C 依赖 B 与 US-234 阶段 A；D 依赖 B 与 US-027 阶段 C；C、D 可并行
- [x] Negotiable: 声明键名（access.scope / requires）、授权快照的 API 名与落库位置可协商；「作用域 × 所需权限」的判定真值表、写约束与读边界已定
- [x] Valuable: owner 授权（见「立项」）；US-234 的员工只读今天要每个应用手写判定，再去和 RLS 对口径
- [x] Estimable: 判定落在 US-027 收敛的公开写入口上，界面落在 US-027 阶段 C 已拆开的「编辑 / 删除」契约上
- [ ] Small: 不是单迭代可完成的小故事；文件内按「交付阶段」A～D 拆分，一阶段一 PR
- [x] Testable: 每条契约都有负向验收；阶段 C 用真实 RLS 与普通 authenticated 身份验收，不接受 mock
-->

# 用户故事：按作用域的成员写权限

## 作为/我想要/以便

**作为** 构建多租户、多成员 local-first 应用的开发者
**我想要** 在实体上声明一行属于哪个作用域（如 `tenant:<tenantId>`）、增删改各要求哪项成员权限（如 `edit`），由远端按当前身份给出调用者在各作用域上的权限
**以便** 没有 `edit` 的成员（员工）经公开写入口写入时在本地当场被拒，不留一条注定被拒的待推修改；Angular / React / Vue 的实体列表与详情按同一份声明逐行显隐新增、编辑、删除；而不是每个应用手写「写前检查 + 界面禁用」，再去和 RLS 对口径

## 立项

2026-11-26 owner 授权。症状出自 `dev-rxdb-supabase` 的极光百货：同一租户的管理员与员工分不开。服务端收口与演示由 [US-234](../adapter/US-234-supabase-tenant-member-permissions.md) 交付，它的阶段 A 只能在应用里手写判定（读 `rxdb_caller_grants()`、按租户比对），引擎与三端组件都不知道「员工」这回事。

权限模型按 [epic-015](../../epics/epic-015-identity-scoped-sync.md) 已拍板的成员权限来：一行属于一个作用域，调用者在每个作用域上有一组权限，增删改各要求其中一项。不做全局角色列表，也不单设「仅所有者」谓词：

- 全局角色表达不了按租户的角色。同一个人可以在星河零售是管理员、在极光百货是员工（演示允许一人加入多个租户），实体上写死 `roles: ['admin']` 说不出「这一行所属租户的管理员」。
- 「仅所有者」是作用域的特例：作用域取所有者属性、前缀 `user:`，平台默认给调用者自己的 `user:<id>` 以 `edit`（US-234）。伪造他人所有者、把行转给别人，都落到同一条规则上被拒。

## 现状

本节记录 US-029 立项时的实现。

1. **实体权限是静态的。** [`EntityOperationPermission`](../../../packages/rxdb/src/entity/entity-options.interface.ts) 只有两种值：

   ```ts
   export type EntityOperationPermission = 'both' | 'system';
   ```

   判定原语 [`assertEntityOperationAllowed`](../../../packages/rxdb/src/entity/entity-permissions.ts) 与整批预检 [`assertMutationsAllowed`](../../../packages/rxdb/src/entity/entity-permissions.ts) 只读元数据，不看行，也不看身份。判定点是 US-027 收敛的公开写入口：门面 `Repository` 的 `create()` / `update()` / `remove()` / `reorder()`，以及 [`EntityManager.mutations()`](../../../packages/rxdb/src/entity/entity-manager.ts) 的整批预检；适配器 / 执行器层不判定。

2. **阶段 D 前的界面能力按实体判定。** [`deriveEntityCapabilities`](../../../packages/rxdb-model/src/entity-capabilities.ts) 返回整个实体的 `canCreate` / `canEdit` / `canDelete`。三端列表曾用同一个实体级判定给所有行挂只读。

   ```ts
   const isRowReadonly = capabilities?.canEdit === false;
   ```

   阶段 D 把它换成按行派生：[`deriveRowCapabilities`](../../../packages/rxdb-model/src/entity-capabilities.ts) 逐行求出只读的行。删除入口已经是按行的谓词：[`actionsColumn()`](../../../packages/rxdb-model/src/entity-table/columns/column-utils.ts) 收 `canDelete: RecordDeletePredicate`，US-027 阶段 C 把「编辑」与「删除」拆开了。

3. **身份已经一库一个。** US-035 交付了 [`RxDBIdentity`](../../../packages/rxdb/src/system/identity-binding.ts) 与打开时核对：库按身份命名并绑定，远端会话对不上就抛 [`RxDBIdentityMismatchError`](../../../packages/rxdb/src/system/identity-binding.ts)，一个请求都不发。「一个实例一个身份」「待推变更不跨身份推送」由它覆盖（[US-035](US-035-identity-bound-local-database.md) AC#4、#6、#7）；授权快照跟着身份的库走，不需要运行时换身份。

4. **读授权已经按分区。** Supabase 的读范围由 `rxdb_caller_buckets()` 裁决，同步插件每轮拉取经 [`getCallerBuckets()`](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts) 取一次（US-033）。写侧没有机器可读的授权：US-234 阶段 A 补上 `rxdb_caller_grants()`，本故事阶段 C 消费它。

5. **审计字段不能当作用域。** `createdBy` / `updatedBy` 在 [`ENTITY_BASE_METADATA_OPTIONS`](../../../packages/rxdb/src/entity/entity-base.ts) 里可空，推送时 [`build_merge_changes_payload`](../../../packages/rxdb-adapter-supabase/src/supabase.merge-changes.ts) 会用推送那一刻的身份覆盖它们。作用域必须是声明过的业务属性。

6. **不加基础字段。** `ownerId` 已被业务模型占用：共享实体 [`IdCard`](../../../packages/rxdb-test/shop/IdCard.ts) 与 [`Order`](../../../packages/rxdb-test/shop/Order.ts) 的 `ownerId` 是指向 `shop.user` 的外键。往 `EntityBase` 塞授权字段会撞上它，也会在 [`buildEditableColumns`](../../../packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts) 生成的三端默认表格里冒出可编辑列。

7. **服务端是唯一边界，被拒已可观测。** 推送被 RLS 拒绝的修改按 [US-218](../adapter/US-218-supabase-rls-push-integrity.md) 逐实体回执、本机对齐。本地判定只是快速失败，与 US-027 的定位一致。

## 权限模型

| 边界     | 承诺                                                                                                       | 不承诺                                                        |
| -------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 远端写   | 部署方的 RLS 按 `auth.uid()` 与成员表裁决（参考实现见 US-234）                                             | 本地判定是安全边界                                            |
| 本地写   | 声明了作用域的实体，经公开写入口的写按「行的作用域 × 所需权限 × 授权快照」判定，越权当场拒绝               | 防住直接改本地库、走适配器 / 执行器层的写                     |
| 授权快照 | 来自远端（Supabase：`rxdb_caller_grants()`），连接时与每轮同步刷新，存进该身份的本地库，离线沿用上次取到的 | 离线时感知远端刚发生的降权：推送时由权威端裁决（US-218 回执） |
| 读       | 不变：读授权按分区（US-033）                                                                               | 按作用域在本地隐藏已经同步下来的行                            |
| 系统写   | 同步合并、撤销 / 重做回放、外键级联、迁移都在适配器 / 执行器层，不判定                                     | —                                                             |

### 声明

```ts
@Entity({
  name: 'CatalogItem',
  access: { scope: { property: 'tenantId', prefix: 'tenant:' } },
  permissions: {
    create: { requires: 'edit' },
    update: { requires: 'edit' },
    delete: { requires: 'edit' }
  }
})
```

- `access.scope.property` 指向实体（含继承）上已声明、`string` 或 `uuid` 类型、不可空的普通属性；行的作用域键 = `prefix` + 属性值。不满足就在配置期报错，引擎不自动补列。
- `EntityOperationPermission` 扩展为 `'both' | 'system' | { requires: string }`。规则形式要求实体声明了 `access.scope`；`requires` 是非空字符串；未知键报错。权限名只校验结构，不建注册表，语义归应用（Supabase 参考实现用 epic-015 的六项）。
- 按操作就近继承，与 US-027 一致；`access` 随继承。
- `@GraphEntity` 上不支持规则形式：[`GraphRepository.addEdge()`](../../../packages/rxdb-plugin-graph/src/GraphRepository.ts) 不经门面写入口，metadata-validate 拒绝这个组合。核心不认识图插件：由仓储注册时声明 `IRepositoryConfig.unsupportedPermissionRules`（理由原样进违规消息），与 `unsupportedSyncTypes` 同一种做法。
- 规则形式只支持本地主端：生效配置是 remote-only 或 `SyncType.QueryCache` 时注册期报错（前像要在本地主适配器的事务里读，这两种主端的写不经那个事务）。
- 没声明 `access` 与规则的实体零变化。

### 授权快照

- 快照是「作用域键 → 权限集合」，另有一个状态：未取到 / 已取到。
- 来源：远端适配器报告（阶段 C：Supabase 读 `rxdb_caller_grants()`），或没有远端的应用直接设入（阶段 B，三端 demo 与单测用）。一个实例只认一个来源。
- 时机：连接时、每轮同步、应用主动刷新；变化时发事件，判定与界面都跟着走。
- 存进当前身份的本地库：离线重开沿用上次的快照；换身份就是换库（US-035），快照不跨库。

### 判定

判定点不变，仍是 US-027 的公开写入口；规则形式只约束这里的用户写。

| 操作   | 按哪一行的作用域                                   | 放行条件                                      |
| ------ | -------------------------------------------------- | --------------------------------------------- |
| create | 新行                                               | 快照在该作用域上有 `requires`                 |
| update | 持久化前像；作用域属性被改时，前像与写后的行都要判 | 两个作用域都有 `requires`：换租户要两边都能改 |
| delete | 持久化前像                                         | 快照在该作用域上有 `requires`                 |

- 快照未取到时，声明了规则的操作一律拒绝（fail-closed），原因写「授权未知」。
- 前像按批一次读（每个实体一次 `WHERE id IN (…)`），与随后的写在同一事务内；判定看前像，不看内存里被改过的实例。
- 批量：任一行被拒，整次调用拒绝，库内无部分写入。
- [`PermissionDeniedError`](../../../packages/rxdb/src/entity/entity-permissions.ts) 沿用 US-027 的违规清单形状；规则形式的违规另带行 id、作用域、所需权限与原因（缺权限 / 授权未知）。
- `'both'` / `'system'` 两种简写与 US-027 完全一致。

### 界面

- 行级能力：给定实体元数据、行与快照，得出这一行能否编辑、能否删除，不能时给出原因。实体级的 `canCreate` 看快照里有没有一个带该前缀的作用域满足 `create` 的要求（调用者 `user:` 区的 `edit` 不让 `tenant:` 实体开新增）；表单保存到没有权限的作用域时报 `PermissionDeniedError`，经 [US-104](../framework/US-104-validation-feedback.md) 的错误面板显示。
- 三端列表的只读改为按行：`_readonly` 由行级编辑能力派生，删除谓词按行求值；只读行照常「查看」，详情走 view 模式。
- 快照未取到或实例只读时，写入口全关；快照变化时不刷新页面即生效。
- Angular / React / Vue 行为对称，跑同一组 e2e。

## 范围边界

### In Scope

- `access.scope` 声明、规则形式 `{ requires }` 与 metadata-validate 校验
- 授权快照：状态、两种来源、刷新时机、按身份落库、离线沿用
- 全部公开写入口的规则判定：前像、换作用域、批量原子、fail-closed、违规清单
- Supabase 授权来源：适配器读 `rxdb_caller_grants()`，连接时与每轮同步刷新；实体声明了作用域而远端没有这个函数时，连接即报错
- rxdb-model 行级能力派生，Angular / React / Vue 三端列表与详情；三端 demo 跑同一组 e2e
- 文档：声明方式、快照的来源与刷新、离线与降权窗口、快速失败的定位、与 RLS 对口径的写法

### Out of Scope

- 读权限：按作用域在本地隐藏行（读授权按分区，US-033）
- 由声明生成 RLS（epic-015 非目标）；服务端策略引擎
- 全局作用域（不随行变化的固定作用域，如「全应用管理员」）：出现具名使用方时追加，形状如 `scope: { value: 'app' }`（2026-11-28 具名使用方出现：Admin 团队库整库属于一个团队，登记为 [US-039](US-039-instance-access-scope.md)）
- 角色注册表、角色层级；所有者转让（换作用域要两边的权限，把行转给别人照规则被拒）
- 字段级权限（只读列、按人隐藏列）
- 「仅经 PR」写入模式（epic-015 目标，另立故事；已登记为 [epic-017](../../epics/epic-017-pr-only-team-data.md) 的 US-322，价值待证）
- 图插件实体的规则形式
- 权限审计日志

## 验收标准

| #   | 前置条件                                                                                                                                                              | 操作                                                                                                    | 预期结果                                                                                                                                                | 状态 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 实体没声明 `access` 与规则（含带业务 `ownerId` 的 `IdCard` / `Order`）                                                                                                | connect、读写、同步；三端默认列表与详情                                                                 | 表结构、SQL、判定与默认界面的字段集合与现状一致；现有测试与 API 基线不回归；业务 `ownerId` 不参与判定                                                   | ✅   |
| 2   | `access.scope.property` 指向不存在、非 `string` / `uuid`、可空的属性；规则形式而没有 `access.scope`；`requires` 为空串或非字符串；规则含未知键；`@GraphEntity` 带规则 | `RxDB.init()`（metadata-validate）                                                                      | 初始化报错，指出实体、键与原因；任意非空权限名不因「未注册」报错                                                                                        | ✅   |
| 3   | 父类声明 `access.scope` 与 `update: { requires: 'edit' }`；子类只声明 `delete: { requires: 'edit' }`                                                                  | 读子类的运行期元数据                                                                                    | update、delete 都是规则形式，create 为 `'both'`；`access.scope` 随继承                                                                                  | ✅   |
| 4   | 声明了规则的实体，快照未取到                                                                                                                                          | 经公开写入口 create / update / delete                                                                   | 都抛 `PermissionDeniedError`，原因是授权未知；没有新行，行不变、仍在，没有待推修改                                                                      | ✅   |
| 5   | 快照：`tenant:a` 有 `read + edit`，`tenant:b` 只有 `read`                                                                                                             | 在 a、b 各 create、update、delete 一行（门面 `Repository`、`EntityManager`、实体实例方法 × 操作参数化） | a 全部放行；b 全部抛 `PermissionDeniedError`，违规项写明实体、行 id、作用域与所需权限                                                                   | ✅   |
| 6   | 同上                                                                                                                                                                  | update 把一行的 `tenantId` 从 a 改成 b；从 b 改成 a                                                     | 都被拒，库内不变                                                                                                                                        | ✅   |
| 7   | 持久化前像在 b，内存实例的 `tenantId` 被改成 a                                                                                                                        | `save()`                                                                                                | 按前像判定，被拒                                                                                                                                        | ✅   |
| 8   | 同上的快照                                                                                                                                                            | `mutations()` / `saveMany()` / `removeMany()` 的一批里混进一行 b                                        | 整批拒绝，库内无部分写入；前像读取次数与行数无关，每个实体一次                                                                                          | ✅   |
| 9   | 快照只有 `read`                                                                                                                                                       | 同步拉取合并别人改的行；撤销、重做降权之前的本机修改；外键级联删除                                      | 全部放行（系统写不判定），行原样落库                                                                                                                    | ✅   |
| 10  | 快照已取到；实例关闭后离线重开同一身份的库                                                                                                                            | 读快照并写入                                                                                            | 沿用上次的快照判定；另一身份的库里没有这份快照                                                                                                          | ✅   |
| 11  | 快照变化：a 的 `edit` 被收回                                                                                                                                          | 再写 a 的行                                                                                             | 立即按新快照拒绝；快照事件发出一次                                                                                                                      | ✅   |
| 12  | 实体权限为 `'both'` / `'system'` 简写                                                                                                                                 | 2 值 × 3 操作，经公开写入口与适配器 / 执行器层各写一次                                                  | 与 US-027 一致：公开写入口按声明放行或拒绝，适配器 / 执行器层一律放行                                                                                   | ✅   |
| 13  | 本地后端                                                                                                                                                              | 在 SQLite 系与 PGlite 上跑 AC#4～11 的判定用例                                                          | 全绿，结果一致                                                                                                                                          | ✅   |
| 14  | 真实 Supabase 栈加载 US-234 的参考 SQL；员工身份（普通 authenticated）                                                                                                | connect 后读快照；在本机改一件本租户的商品                                                              | 快照与 `rxdb_caller_grants()` 一致；本机写当场 `PermissionDeniedError`，没有待推修改                                                                    | ✅   |
| 15  | 管理员在本机改了商品、未推送，期间被降为员工                                                                                                                          | 推送，再同步，再在本机改                                                                                | 推送被拒、本机对齐、进被拒清单（US-218）；同步后快照刷新，之后的本机写当场被拒                                                                          | ✅   |
| 16  | 实体声明了作用域，远端没有部署 `rxdb_caller_grants()`                                                                                                                 | connect                                                                                                 | 报错并指出缺的函数与部署文档；不静默放行，也不当成空快照                                                                                                | ✅   |
| 17  | `website/docs`                                                                                                                                                        | 阅读                                                                                                    | 写明声明方式、快照的来源与刷新、离线与降权窗口、快速失败不是安全边界、与 RLS 对口径的写法                                                               | ✅   |
| 18  | 三端 demo：声明了作用域的演示实体，快照里 a 可编辑、b 只读                                                                                                            | 打开列表与详情；在表单里新增到 b、再改到 a                                                              | a 的行可编辑、可删，b 的行只读、可查看（详情 view 模式）；新增保存到 b 被拒并指出缺权限的作用域，改到 a 落库；Angular / React / Vue 同一组 e2e 结果一致 | ✅   |
| 19  | 同上，页面开着                                                                                                                                                        | 收回快照里 a 的 `edit`                                                                                  | 不刷新页面，a 的行变只读、删除入口消失；三端一致                                                                                                        | ✅   |
| 20  | 快照未取到；实例只读                                                                                                                                                  | 打开列表                                                                                                | 写入口全关，行可查看，原因可读；三端一致                                                                                                                | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收入口：

- AC#1～3：`packages/rxdb/src/__tests__/entity/entity-access-declaration.spec.ts`；`@GraphEntity` 那一条在 `packages/rxdb-plugin-graph/src/__tests__/permission-rules-ban.spec.ts`
- AC#4～12：`packages/rxdb/src/__tests__/entity/entity-access-enforcement.spec.ts`（判定矩阵）与 `packages/rxdb/src/__tests__/grants/grant-snapshot.spec.ts`（快照状态、设入、事件、读回）
- AC#13：`packages/rxdb-adapter-pglite/src/__tests__/entity-access-rules.spec.ts`（含 AC#1 的真实 `IdCard` / `Order`、AC#10 同名库重开）与 SQLite 系共享套件 `entityAccessRulesSuite`（`packages/rxdb-adapter-sqlite-core/src/__tests__/shared-entity-access-rules.suite.ts`，六个 SQLite 系后端都接入）
- AC#14～16：真栈用例 `packages/rxdb-adapter-supabase/src/__tests__/caller-grants-source.spec.ts`，以普通 authenticated 测试用户运行；降权经 US-234 的 `demo_set_member_permissions` 由另一个管理员发起。AC#16 不改共享栈：客户端外套一层，把 `rxdb_caller_grants` 换成不存在的函数名，拿真栈对缺函数的真实应答（PGRST202），适配器的映射与核心的连接处置照常走一遍；对照用例证明没有实体声明作用域时不问这个函数。应答映射另有桩客户端用例 `caller-grants.spec.ts`，核心的来源规则、刷新时机与离线处置在 `packages/rxdb/src/__tests__/grants/grant-remote-source.spec.ts`，同步入口刷新在 `packages/rxdb-plugin-sync/src/__tests__/SyncManager.orchestration.spec.ts`
- AC#17：`website/docs/model-definition/permissions.md`「按作用域的成员权限」（英文同名页）、`website/docs/adapters/supabase.md`「本机按成员权限判定」、`website/docs/migration/supabase-member-permissions.md` 第 3 步
- AC#18～20：框架无关的派生在 `packages/rxdb-model/src/__tests__/entity-capabilities.rules.spec.ts` 与 `entity-table/columns/build-editable-columns.spec.ts`；三端组件在各自的 `entity-list.real.spec`（「US-029 规则形式的入口按行与授权快照派生」）；三端 e2e 是同一份 `apps/dev-rxdb-{angular,react,vue}-e2e/src/entity-access.spec.ts`（登记在 `scripts/audit/e2e-spec-copies.mjs`），在 demo 的 TenantNote 列表页经授权快照演示面板跑完 AC#18～20 并刷新核对落库。

## 交付阶段

| 阶段 | 交付                                                                                             | 关闭条件                           | 依赖                                     | AC     | 状态 |
| ---- | ------------------------------------------------------------------------------------------------ | ---------------------------------- | ---------------------------------------- | ------ | ---- |
| A    | 声明与校验：`access.scope`、规则形式与 TSDoc、metadata-validate、就近继承                        | 未声明零回归；配置错误可定位       | US-027 阶段 A（Done）                    | 1～3   | ✅   |
| B    | 授权快照与本地判定：快照状态与应用设入、按身份落库、全部公开写入口判定、前像、批量原子、违规清单 | 判定矩阵与写入口全绿；本地后端一致 | A；US-027 阶段 B（Done）；US-035（Done） | 4～13  | ✅   |
| C    | Supabase 授权来源：适配器读 `rxdb_caller_grants()`、刷新、缺函数时连接报错；文档                 | 真实 Supabase + 普通身份全绿       | B；US-234 阶段 A                         | 14～17 | ✅   |
| D    | 三端按行派生：rxdb-model 行级能力，三端列表与详情，三端 demo 的演示实体、快照开关与 e2e          | 三端同一组用例全绿                 | B；US-027 阶段 C（Done）                 | 18～20 | ✅   |

一阶段一 PR，每阶段独立更新 AC 状态与 API 基线；C、D 可并行。负向用例先红后绿；核心判定代码覆盖率 ≥ 90%，其余包 ≥ 80%。阶段 C 禁止用 mock 的 `SupabaseDataError` 代替真实 RLS。

## 技术笔记

**已定的设计决策**：

- **作用域 × 所需权限，不做角色列表**：角色按租户算，全局 `roles` 说不清；管理员、员工只是权限集合的预设，归应用的界面。与 epic-015「不引入 GitHub 式四级角色」一致。
- **授权来自服务端函数，不来自 JWT**：成员表改了下一次请求就生效；令牌里的角色要等刷新（**推断**，依据 [Supabase RLS 文档](https://supabase.com/docs/guides/database/postgres/row-level-security)）。
- **「仅所有者」用 `user:` 作用域表达**：省掉单独的 owner 谓词与 owner 注入；所有者不可转让是同一条规则的推论。
- **本地判定只做快速反馈**：安全边界只在权威端，本仓交付声明、判定与能被普通身份验证的参考 SQL，不交付策略引擎。
- **系统写不判定**：同步合并他人的合法行要原样落库；撤销、重做降权之前的修改，正好让本机回到远端的样子。

**未选的替代方案**：应用注入策略函数（`(operation, row, preImage, grants) => boolean`）代替声明。抽象更少，但规则不再是元数据，三端界面派生、devtools 展示都无法从声明推导，也与 US-027 的声明式不对称。规则超出「作用域 × 所需权限」时再评估追加钩子。

**plan 阶段的落点**（2026-11-27 定，不改语义）：

- **快照落库**：新的核心系统表 `rxdb_grant_state`（`RxDBGrantState`，`log: false`），单行（主键 `current`）：`source`、`grants`（规范化后的 JSON）、`updatedAt`。「未取到」就是没有这一行，「已取到、一项授权都没有」是 `grants` 为空数组的一行。既有库由 `connect()` 的系统表补建建出，不升系统表结构版本；`connect()` 打开既有库时经引导期事务读回（普通查询的就绪门等的正是这一次 `connect()`）。读不懂的行按未取到处理（判定 fail-closed），下一次设入覆盖它。
- **快照的形状与事件**：`rxdb.grants`（`RxDBGrants`）给出 `snapshot` / `snapshot$` / `set()`；`RxDBGrantSnapshot` 不可变，同一作用域合并、作用域与权限名按码元排序去重，`equals()` 不比取得时间，`snapshot$` 只在内容变化时发出。`set()` 先写库再发布，写库失败快照不变。断连不清快照；多标签页不互相同步（各自设入或刷新）。
- **两种来源**（阶段 C 落定）：远端适配器的可选能力 `RxDBAdapterRemoteBase.callerGrants()` 决定来源——有实体声明了 `access`、且配置的远端实现了它，快照就来自远端，`set()` 抛错并提示用 `rxdb.grants.refresh()`；否则来源是应用设入。没有实体声明作用域时远端一次都不问，没部署 `rxdb_caller_grants()` 的旧服务端照常可用。
- **远端的刷新时机**：远端 `connect()` 时（`adapter.connect()` 之后、置位已连接之前）问一次；同步插件八个公开入口（pull / push / sync、按仓库的三个、bulkSync、syncBranches）在核对远端身份之后各问一次（入口内部逐仓库的 `bulkSyncInSession` 与一轮中途的远端身份核对都不再问，免得同一轮问两次）；应用随时可调 `rxdb.grants.refresh()`。每次问之前先核对会话身份（授权要落进这个身份的库）。
- **离线与配置错误**：连接时连不上远端（`isNetworkError`）沿用上次的快照、连接照常完成；缺函数（Supabase 回 PGRST202，适配器报 `SupabaseConfigError`）、应答形状不对、会话身份不符都让连接失败并撤回适配器名，与打开时身份对不上同一种处置。同步入口与 `refresh()` 的错误原样抛出。
- **本地库还没连上**：刷新只发布、不落库，不等本地连接（并行连接、先连远端都不卡住）；下一次刷新落库。相应地，本地 `connect()` 读回改成「库里的那一行不比内存里的旧才发布」，先连远端拿到的新快照不被旧行盖掉。
- **违规清单的兼容**：`'system'` 的违规仍是三个字段、消息首行不变；规则形式的违规是扩展接口 `PermissionRuleViolation`（`id` / `scope` / `requires` / `reason`），用 `isPermissionRuleViolation()` 区分。一行一个作用域一条，按 create / update / delete 排序。
- **前像的读法与事务落点**：经事务执行器的仓储 `find({ id in [...] , limit })`，读仓储交回的实例的 `origin`（与手动排序读「落库值快照」同口径）；显式给 `limit`，批量超过 100 行也不漏。create 不读库（新行就在实例上），在碰适配器之前同步判；单条 update / delete 与批量写改走「本地主适配器事务：表集断言 → 读前像 → 判定 → 写」，与适配器自己的 `mutations()` 同一个事务体；重排在 `reorderRow()` 算出落点之后、写入之前判；批里没有规则写时写路径与现状逐字一致。读不到前像的行（库里已经没有）不判，存储层对它是空写。快照在全部前像读完之后取一次。
- **`deriveEntityCapabilities`**：阶段 B 不动 `rxdb-model`。它按 `=== 'both'` 派生，规则形式在阶段 D 之前一律得到「入口关闭」，与「授权未知即拒绝」同口径；按行派生与四个调用方归阶段 D。
- **界面派生**（阶段 D 落定）：`EntityCapabilityContext` 多一个 `grants`，没传与快照未取到一样，规则形式一律关闭（fail-closed）。实体级只认带该前缀的作用域；按行的 `deriveRowCapabilities()` 取这一行作用域属性此刻的值，不能时给出原因（`'read-only-instance'` / `'system'` / `'grants-unknown'` / `'missing-permission'`，只读实例排在最前）。写入口全关时的提示走单独的 `deriveWriteBlockedReason()`，`EntityCapabilities` 的形状不变。`buildEditableColumns()` 收 `grants`，操作列的删除谓词按行求值，不在记录上加删除标记：快照变化时三端重建列。三端 `EntityList` 订阅 `snapshot$`（Angular `toSignal`、React `useState` + `useEffect`、Vue `shallowRef` + `watchEffect`），行的 `_readonly`、新增门、手动排序的「有只读行」随快照重算；详情沿用 `_readonly` 走 view 模式，保存被拒经 US-104 的错误面板显示违规清单。
- **AC#18 改写**（2026-11-28 owner 决定阶段 D 只做按行入口）：三端 `EntityList` 没有批量删除入口，原文「选中 a、b 的行批量删除，整批拒绝」改为表单新增到 b 被拒、改到 a 落库；批量写的整批拒绝已由 AC#8 在引擎层验收。
- **demo 与 e2e**（阶段 D 落定）：`@aiao/rxdb-test` 新增 `TenantNote`（`tenant:` + `tenantId`，三个写操作都要 `edit`）。三端 demo 的 TenantNote 列表页上方有授权快照演示面板：状态文字、「生成示例数据」（本地适配器 `mutations()` 系统写 a、b 各一行，快照未取到也落得下）、「a 可编辑、b 只读」与「收回 a 的 edit」（`rxdb.grants.set()`）。

**行业做法**（外部资料，**推断**）：本地优先的授权有三条路线——信任客户端（无效）、按权限组加密（密钥管理复杂、吊销弱）、部分复制加服务端策略求值（Zero / ElectricSQL / PowerSync）。本仓走第三条：读由分区裁决（US-033），写由 RLS 裁决，本故事补的是本地快速拒绝与界面。

## 实现文件

| 阶段 | 文件                                                                                                                             | 改动                                                        |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| A    | `packages/rxdb/src/entity/entity-options.interface.ts`                                                                           | `access` 声明、规则形式的类型与 TSDoc                       |
| A    | `packages/rxdb/src/entity/metadata-transition.ts`、`entity-permissions.ts`                                                       | `access` 就近继承；读取作用域与规则的函数                   |
| A    | `packages/rxdb/src/entity/metadata-validate.ts`、`rxdb.types.ts`、`entity-manager.ts`                                            | `invalidAccess`、规则校验、主端限制、仓储限制               |
| A    | `packages/rxdb-plugin-graph/src/plugin.ts`                                                                                       | `GraphRepository` 声明不支持规则形式                        |
| B    | `packages/rxdb/src/entity/permission-rules.ts`、`entity-permissions.ts`                                                          | 按行判定、前像、违规清单                                    |
| B    | `packages/rxdb/src/repository/Repository.ts`、`packages/rxdb/src/entity/entity-manager.ts`、`sortable/sortable.utils.ts`         | 公开写入口接入规则判定                                      |
| B    | `packages/rxdb/src/grants/`、`packages/rxdb/src/RxDB.ts`、`system/system-entities.ts`                                            | 授权快照的状态、设入、事件、落库与读回                      |
| B    | `packages/rxdb-adapter-pglite/src/__tests__/`、`packages/rxdb-adapter-sqlite-core/src/__tests__/`（六个后端的 setup 接入）       | 本地后端用例                                                |
| C    | `packages/rxdb/src/rxdb-adapter.ts`、`packages/rxdb/src/grants/grants.ts`、`packages/rxdb/src/RxDB.ts`                           | `callerGrants()` 契约、远端来源、刷新、连接时刷新           |
| C    | `packages/rxdb-plugin-sync/src/SyncManager.ts`                                                                                   | 同步入口刷新授权快照                                        |
| C    | `packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts`                                                                      | 读 `rxdb_caller_grants()`、缺函数时报错                     |
| C    | `packages/rxdb-adapter-supabase/src/__tests__/`                                                                                  | 真栈普通身份用例与应答映射用例                              |
| C    | `website/docs/`                                                                                                                  | 声明方式、快照来源与刷新、离线与降权窗口、与 RLS 对口径     |
| D    | `packages/rxdb-model/src/entity-capabilities.ts`、`entity-table/columns/build-editable-columns.ts`、`messages.ts`、`headless.ts` | 实体级 / 按行能力、写入口全关的原因、按行删除谓词、提示文案 |
| D    | `packages/rxdb-model-{angular,react,vue}/src/entity-list/`                                                                       | 订阅授权快照，按行 `_readonly`、删除与新增门，原因提示      |
| D    | `packages/rxdb-test/entities/TenantNote.ts`、`modules/demo-i18n/entities.ts`                                                     | 演示实体、演示面板文案                                      |
| D    | `apps/dev-rxdb-{angular,react,vue}` 的 `grant-demo` 面板与列表页；`apps/dev-rxdb-*-e2e/src/entity-access.spec.ts`                | 授权快照演示面板、同一组 e2e                                |

## References

- [epic-015 按身份授权的同步与本机数据隔离](../../epics/epic-015-identity-scoped-sync.md) — 授权模型：成员权限，read 对应查看、edit 对应增删改
- [US-234 Supabase 租户内成员权限](../adapter/US-234-supabase-tenant-member-permissions.md) — `rxdb_caller_grants()` 与参考 RLS；阶段 B 是本故事在演示里的消费方
- [US-027 实体操作权限模型](US-027-entity-permission-model.md) — 公开写入口、`'both' | 'system'` 与 `PermissionDeniedError` 的基线
- [US-035 每个身份一个本地库](US-035-identity-bound-local-database.md) — 授权快照随身份的库走
- [US-218 Supabase 远端启用 RLS 时的推送完整性](../adapter/US-218-supabase-rls-push-integrity.md) — 权威端拒绝的逐实体回执
- [PostgreSQL — Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) — `USING` / `WITH CHECK`、绕过角色
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — 可信授权来源、JWT 刷新
- [EpicenterHQ — Conflict Resolution Gets All the Attention](https://github.com/EpicenterHQ/epicenter/blob/main/docs/articles/conflict-resolution-is-the-least-of-your-problems.md) — 权限是本地优先的生产阻塞项
