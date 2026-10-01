---
id: US-029
title: 多用户 RBAC 权限与租户隔离的关联设计
status: Backlog
priority: Medium
epic: epic-004-future-features
created: 2026-09-20
updated: 2026-10-01
tags: [core, permission, rbac, tenant, sync, rxdb-model]
---

<!--
INVEST 检查清单:
- [ ] Independent: 阶段 A（声明与上下文）只依赖 US-027 阶段 A 的权限类型；B 依赖 A 与 US-027 阶段 B；C 依赖 A/B；D 依赖 C；E 依赖 B/C 与 US-027 阶段 C
- [ ] Negotiable: 声明键名（access / tenant / owner）与 API 名可协商；判定语义、写规则与切换协议在「技术笔记」锁定
- [ ] Valuable: 多用户/多租户应用开发者今天就要手工拼装行级过滤与越权防护（见「背景与动机」的现状缺口）
- [ ] Estimable: 判定真值表、写规则、作用域切换与权威端确认均已定死；plan 阶段只剩落点与命名
- [ ] Small: 不是单迭代可完成的小故事；文件内按「交付阶段」A～E 拆分，一阶段一 PR
- [ ] Testable: 每条契约都有负向验收；权威端验收要求真实 RLS + 普通 authenticated 身份，不接受 mock
-->

# 用户故事：多用户 RBAC 权限与租户隔离的关联设计

## 作为/我想要/以便

**作为** 构建多用户 / 多租户应用的开发者
**我想要** 在实体上声明租户归属与所有权属性、并按角色声明操作权限
**以便** 本地库只同步、只展示当前租户的行，越权写在本地被快速拒绝、在同步权威端被真实拒绝且可观测；而不是每接入一个后端就手工重写一遍「行级过滤 + RLS + UI 只读」三板斧

## 背景与动机

- [`RxDBContext.userId`](../../../packages/rxdb/src/rxdb.interface.ts) 只用于审计：适配器写实体行时拿它填 `createdBy` / `updatedBy`（实体声明了这两列才写）——本地的 sqlite-core / pglite 在 `insert_sql` / `inserts_sql` / `update_sql` 里注入，Supabase 在 [`applyAuditFields`](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.utils.ts) 等写路径里注入；它的 TSDoc 也写明同步不按它做行级过滤。**没有任何适配器按身份过滤 pull / push**，多用户隔离在引擎侧没有数据锚点。
- `createdBy` / `updatedBy` 是**审计字段，不能当授权锚点**：[`ENTITY_BASE_METADATA_OPTIONS`](../../../packages/rxdb/src/entity/entity-base.ts) 里两者 `nullable`；[`fillInitValue`](../../../packages/rxdb/src/entity/entity.utils.ts) 允许构造期传入 readonly 字段；`normalizeUpdateEntity` 对 readonly 键是**静默剔除**而不是报错。Supabase 侧四条写路径都只在 `rxdb.context.userId` 存在时才覆盖这两列，而 `userId` 本身是客户端自报的。
- **`ownerId` 已被业务模型占用**：[`03-business-tables.sql`](../../../docker/sql/03-business-tables.sql) 的 `shop.id_card` / `shop.order` 有 `"ownerId" uuid NOT NULL` 外键指向 `shop."user"`（共享实体 [`IdCard`](../../../packages/rxdb-test/shop/IdCard.ts)、[`Order`](../../../packages/rxdb-test/shop/Order.ts)）。往 `EntityBase` 塞同名基础字段会与子类覆盖相撞；[`buildEditableColumns`](../../../packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts) 只跳过 `SKIP_FIELDS` / `DISPLAY_ONLY_FIELDS`，新基础字段会在三端默认 UI 里冒出可编辑列。
- 服务端没有戳记与策略：参考 SQL [`docker/sql/`](../../../docker/sql/) 里没有 `auth.uid()`、没有 RLS 策略；写入 RPC（[`04-rxdb-utils-functions.sql`](../../../docker/sql/04-rxdb-utils-functions.sql) 的 `rxdb_mutations` 等）是 `SECURITY INVOKER`，且 `rxdb_mutations` 把**请求里带的**日志镜像插入 `rxdb_change`。[`remote-security-notice.ts`](../../../apps/dev-rxdb-supabase/src/app/remote-security-notice.ts) 在 demo 里向用户明示了这一点。
- 选择性同步的原语已经存在但**与身份无关，也不是隔离边界**：[`SyncType.Filter`](../../../packages/rxdb/src/entity/sync-options.interface.ts) 的 `remote.filter` 每次拉取时求值；Supabase [`pullChanges`](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts) 把它送进 [`rxdb_pull_changes`](../../../docker/sql/02-rxdb-sync-functions.sql)——该 RPC 在日志快照上求值，`beforeData` 或 `afterData` 任一命中即返回整条变更，`NOT snapshotComplete` 的历史变更**不经过滤直接返回**。批量拉取 [`pull-batch.ts`](../../../packages/rxdb-plugin-sync/src/pull-batch.ts) 跳过 `filter` 型仓库；HTTP 适配器的 `pullChanges` 恒抛 `HttpChangelogUnsupportedError`。
- 同步状态与上下文无关：[`getOrCreateSyncRecord`](../../../packages/rxdb/src/sync-contract/sync-record-utils.ts) 的水位键是 `${namespace}:${entity}:${branchId}`，换租户沿用旧水位会跳过新租户的历史变更；[`RxDB.context`](../../../packages/rxdb/src/RxDB.ts) setter 只是整体替换，没有切换屏障，在途请求切换后返回仍会落库。
- 实时通道直接分发远端 patch：[`RxDBAdapterSupabase`](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts) 订阅整张 `public.rxdb_change` 的 INSERT，[`handleSupabaseChange`](../../../packages/rxdb-adapter-supabase/src/handle_supabase_change.ts) 只按实体范围与 `clientId` 筛选后就把 patch 当事件数据派发。
- push 成功按发送数计：[`push-repository.ts`](../../../packages/rxdb-plugin-sync/src/push-repository.ts) 的 `pushPlanEntries` 在远端返回后执行 `plan.pushed += batchEntries.length`，`getChangeIdMapping` 缺映射时返回空数组也不报错。PostgreSQL RLS 的 `USING` 会让越权 UPDATE / DELETE **零行生效而不抛错**，所以「远端没抛错」不等于「写被授权并生效」。
- [US-027 实体操作权限模型](US-027-entity-permission-model.md) 按层区分执行者：经公开写入口的写是用户写、在那里判定，适配器 / 执行器层的写是系统写、不判定；每个操作取 `'both' | 'system'`。本故事把用户写的判定扩展到**角色 / 所有权 / 租户**，且 US-027 的 Out of Scope 明确指向本故事。
- [vision.md](../../vision.md) 阶段 3 规划「用户身份、设备身份、工作区成员和权限模型」「按租户同步」。

### 行业调研结论

本地优先架构下授权有三条路线：信任客户端（安全剧场，无效）；按权限组加密（密钥管理复杂、吊销弱）；**部分复制 + 服务端策略求值**（生产工具的主流选择，Zero / ElectricSQL / PowerSync 均为此形态）。调研来源与要点：

- EpicenterHQ《Conflict Resolution Gets All the Attention. It's the Least of Your Problems.》：permissions、schema migration、部分复制才是本地优先的**真正生产阻塞项**；每家有产量的工具都选择服务端决定「把什么同步给谁」。
- Pylon 的 [Policies](https://docs.pylonsync.com/concepts/policies) 与 [owner stamping](https://docs.pylonsync.com/plugins/data#owner_stamp)：显式 read/insert/update/delete 策略 + 会话绑定 + 服务端戳记 owner。这说明完整方案依赖服务端语义，不证明本仓的 filter 或角色数组具备同等能力——本故事借鉴原则，不省略自己的协议。
- [PostgreSQL Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)：`USING` 过滤目标行不抛错、`WITH CHECK` 抛错；表 owner / `BYPASSRLS` 绕过策略；外键与唯一约束检查不受 RLS 约束。
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) 与 [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)：授权数据不能取自用户可改的 `user_metadata`；JWT 内的成员信息要等 token 刷新；实时事件按**被订阅的表**对订阅者授权，业务表的策略不会自动套到 `rxdb_change`。

以上为外部资料结论（**推断**，非本仓源码实证）；本仓实证见「背景与动机」。

## 权限模型设计

模型是 **按层执行者（US-027）+ tenant scope + role / ownership predicates**，不是角色管理产品。

| 边界         | 承诺                                                                     | 不承诺                                                    |
| ------------ | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| 远端数据安全 | 权威端按可信会话与成员关系限制业务表、日志、RPC、实时数据（部署契约）    | `RxDBContext.roles` 或请求 filter 本身可信                |
| 本地正常使用 | 当前租户之外的行不会经公开读 API、UI、缓存出现                           | 收回用户已复制、导出的数据；原始 SQL / 备份是受信管理通道 |
| 离线写       | 乐观暂存，恢复后由权威端裁决；拒绝可定位、可处置                         | 离线客户端感知权威端刚发生的吊销                          |
| 系统执行者   | 系统写走适配器 / 执行器层，不经公开写入口判定，但遵守租户作用域不变量    | 系统写等同业务管理员；`roles` 数组能赋予系统身份          |
| 服务端范围   | 不实现通用策略引擎；交付部署契约与测试专用 RLS fixture，用普通身份跑验收 | 只补远端列就宣称已交付多租户安全                          |

### 声明层：实体显式声明授权属性（不改 `EntityBase`）

授权属性由实体自己声明、自己拥有，引擎只通过声明找到它们：

```ts
interface EntityAccessOptions {
  /** 租户归属属性；声明后该实体为「租户私有」，未声明即「共享」 */
  tenant?: { property: string };
  /** 所有权属性；`ownerOnly` 的唯一判定依据（不是 `createdBy`） */
  owner?: { property: string };
}
// EntityMetadataOptions 新增 access?: EntityAccessOptions
```

- 被指向的属性必须是实体（含继承）上已声明的、字符串类 ID 类型、`nullable: false` 的普通属性；否则 metadata-validate 配置期报错。列由使用方经 `MigrationType[]` 自己建与回填——引擎**不自动补列**，不替使用方猜存量行属于哪个租户。
- 未声明 `access` 的实体零变化：既有的 `IdCard.ownerId` 这类业务字段**不会**被当成授权字段，除非使用方显式声明指向它（那就是使用方确认「业务 `shop.user.id` 即登录身份 ID」）。
- 声明了的租户 / 所有权属性在 rxdb-model 默认 UI 中按 `DISPLAY_ONLY_FIELDS` 处理（可见、不可编辑）。
- 命名：用 `tenant` 而非 `group` / `workspace`——`workspace` 已被 [US-501 Workspace 插件](../plugin/US-501-workspace-plugin.md) 占用，`group` 易与角色组混淆。

### 上下文层：`RxDBContext` 扩展与冻结快照

[`RxDBContext`](../../../packages/rxdb/src/rxdb.interface.ts) 增加 `tenantId?: string` 与 `roles?: readonly string[]`。`userId` / `tenantId` / `roles` 是**同一份原子快照**：换租户必须同时给出新角色，省略 `roles` 即清空，不沿用旧租户的成员资格。

库中存在任一声明了 `access` 的实体时：context 以冻结快照保存（原地 `roles.push()` 抛错）；经 `context` setter 改动 `userId` / `tenantId` / `roles` 抛错并指向 `switchContext`。未声明的库 setter 行为不变。

### 判定层：US-027 的操作权限扩展为可携带谓词

```ts
interface EntityPermissionRule {
  roles?: string[]; // context.roles 命中任一即满足
  ownerOnly?: boolean; // 前像 owner 属性 === context.userId
}
type EntityOperationPermission = 'both' | 'system' | EntityPermissionRule;
```

判定顺序与真值（fail-closed，不设放行兜底）：

1. **执行者按层**：判定只设在 US-027 的公开写入口，那里的写都是用户写；适配器 / 执行器层的系统写不判定。`'both'` / `'system'` 简写与 US-027 完全一致；规则形式表示「对用户有条件开放」。系统身份由写所在的层决定，`context.roles` 永远给不出。
2. **业务谓词只约束用户写**：谓词之间 AND，`roles` 数组内部 ANY。`roles` 声明后，`context.roles` 为 `undefined`、`[]` 或无交集**一律拒**——兼容退化只存在于「规则没声明该谓词」时，不存在「上下文缺角色就跳过谓词」。`ownerOnly` 要求前像的 owner 属性与 `context.userId` **都是非空字符串且相等**，任一缺失即拒，两个缺失值不得比较相等。
3. **系统写**（同步合并等适配器 / 执行器层的写）不受 `roles` / `ownerOnly` 约束，不重戳 owner / tenant（合并他人的合法行原样落库），但仍受租户作用域不变量约束（见同步层）。
4. 结构校验：`roles: []`、空串角色、`{}`、未知键、`ownerOnly` 但实体未声明 `access.owner` 都是配置期错误。**角色名只校验结构**，不建角色注册表——角色语义归应用。

### 写入层：归属字段的写前、写后约束

适用于 Repository、EntityManager、实体 `save` / `remove`、`mutations`、`saveMany` / `removeMany` 与关联级联的全部**用户**写入口：

- **create**：tenant / owner 属性缺省时从 `context.tenantId` / `context.userId` 注入；显式值与上下文相同则接受，不同则抛 `PermissionDeniedError`；上下文缺对应字段则抛错，不产生空归属行。
- **update / delete**：权限按**持久化前像**判定（从本地库读出），不看内存里被改过的实例；update 改动 tenant / owner 属性（含先改内存实例再 `save`）抛 `PermissionDeniedError`，不走 readonly 的静默剔除。**owner 转让与跨租户迁移本期都不支持**。
- **批量**：落库前逐行判定，任一行被拒则整次调用拒绝、库内无部分写入（与 US-027 「被拒无新行」一致）。
- **关系**：两个租户私有实体之间的关联必须同租户（写时读目标行归属校验）；租户私有 → 共享实体允许；共享实体 → 租户私有实体的关系在 metadata-validate 报错；多对多两端都私有时中间实体也必须声明 `access.tenant`。既有唯一约束保持全局语义不改写，需要租户内唯一的由使用方声明含租户属性的组合唯一索引。

### 读取层：本地读按当前租户收敛

声明了 `access.tenant` 的实体，所有公开读入口（`get` / `find` / `findOne` / `count`、关联加载、关联候选、实时查询，以及 `EntityIdentityCache` 命中）都以 `tenant = context.tenantId` 作为不可覆盖的顶层 AND；`context.tenantId` 缺失时读取抛错。本地物理上可以同时存放多个租户的行（换租户不清库），可见性由这条条件保证。本期没有 read 权限谓词：租户内的行全部可见。

### 同步层：作用域化复制与权威端确认

- **允许的同步模式**：声明租户的实体只能用 `SyncType.None` 或 `SyncType.Filter`；`Full`、`QueryCache`、remote 仓库、以及远端适配器没有 filter 通道（HTTP）的组合在配置期报错，不回落全量。不给 `PullBatchRequest` 加 filter 槽。
- **拉取条件**：`AND(tenant = 当前租户, remote.filter(), PullRepositoryOptions.filter)`，租户条件在顶层，自定义 OR 只能在其内部收窄；级联节点按各自实体的声明生成条件。
- **水位按租户**：声明租户的实体的同步记录键追加租户维度（`${namespace}:${entity}:${branchId}:${tenantId}`）。新租户从零拉取即得到该租户全量基线；A→B→A 续用 A 的水位。
- **严格拉取**：声明租户的实体走严格模式——只返回 `snapshotComplete` 的变更，按 `afterData`（DELETE 按 `beforeData`）的租户归属求值，不走「不完整快照全发」分支。因租户不可变，前后像归属一致，无需「离开范围」事件。
- **系统合并的作用域不变量**：同步任务启动时冻结租户；落库的行归属与之不符即整批失败报错（远端违约），不静默丢弃也不落库。
- **实时通道**：声明租户的实体不应用实时 patch，只把事件当作「对当前代次发起一次逐仓拉取」的信号。
- **push 确认**：远端对每条发出的操作返回结果（已应用 / 已应用的重试 / 拒绝）；缺失、重复或未知的确认按整批失败处理、不推进水位、不赋 remoteId。被拒的变更标记为 rejected（带错误、可查询），不按网络错误自动重试，水位越过它；本地乐观值保留，由应用决定重新拉取覆盖或修改后再存（产生新变更）。

### 作用域切换：`rxdb.switchContext(next)`

改动 `userId` / `tenantId` / `roles` 的唯一入口（异步）：

1. 若 `userId` 或 `tenantId` 变化，且声明实体有未推送变更：拒绝切换并报出待推数量，context 不变（离线时换租户 / 换用户需先推完——已知限制）。仅改 `roles` 不受此限。
2. 递增上下文代次。同步任务启动时冻结代次与作用域，落库与推进水位前校验代次，旧代次结果一律丢弃。
3. 清除声明实体在 `EntityIdentityCache` 中的实例，重算实时查询与 UI 能力派生，不需要重启 RxDB。

同一物理库的多个 RxDB 连接可分处不同租户：行并存、读按各自上下文收敛、水位按租户分键，切换不做全库清除。成员被移除时由应用调用 `rxdb.evictTenantData(tenantId)` 删除本地该租户的行——这是缓存驱逐，不生成 `RxDBChange`、不会推成业务 DELETE；该租户有待推变更时拒绝执行。

### 权威端契约（部署方实现，本仓交付说明与测试 fixture）

- 业务表：按可信会话（`auth.uid()`）+ 成员表判定租户与角色，不读 `user_metadata`；租户属性 `WITH CHECK` 不可变；owner 的 update / delete 策略按需。
- 日志与 RPC：`rxdb_change` 的 SELECT 按日志快照的租户归属 + 成员表授权；严格模式下日志只能由真实生效的写推导（同事务），不接受客户端自报镜像；`SECURITY INVOKER` 只是执行身份，不等于策略完整。
- 实时：`rxdb_change` 上的策略同时约束 Postgres Changes 下发。
- 吊销窗口：角色 / 成员变化对远端的生效时间（JWT 刷新周期）在部署说明中写明，不承诺 `context.roles` 变化即远端许可变化。

### UI 层：按操作区分的能力派生

核心返回 `{ create }`（实体 + 上下文能力）与行级 `{ update, delete }`；租户内的行总是可查看。rxdb-model 的列表、详情、表单、批量动作消费同一派生，不复制权限条件；`_readonly` 只由 `!update` 派生，删除入口按 `delete` 单独显示。加载中或上下文缺失时一律不可操作。三框架对称（铁律），依赖 US-027 阶段 C 的「查看与删除拆开」UI 契约。

## 范围边界

### In Scope

- `access` 声明（tenant / owner）与 metadata-validate；`RxDBContext` 的 `tenantId` / `roles` 与冻结快照
- `EntityPermissionRule` 谓词与判定真值表；用户写入口的注入、前像判定、归属不可变与同租户关系
- 本地读按租户收敛；同步模式白名单、拉取条件组合、按租户水位、严格拉取、实时信号化、push 确认与拒绝处置
- `switchContext` 切换协议与 `evictTenantData` 驱逐原语
- 参考 SQL 的严格拉取与逐操作确认；权威端部署说明；测试专用 RLS fixture
- rxdb-model 操作级能力派生（Angular / React / Vue 三端）

### Out of Scope

- 服务端策略引擎本身与生产级 RLS / 戳记模板（fixture 只服务测试）
- `EntityBase` 新增基础字段与引擎自动补列（改为显式声明，列由使用方迁移）
- owner 转让与跨租户迁移（本期普通写一律拒绝，另立故事）
- 租户内的 read 权限谓词；角色注册表、层级继承、审批 UI
- 按权限组加密的替代路线（[`@aiao/rxdb-adapter-encrypted`](../../../packages/rxdb-adapter-encrypted/README.md) 是字段级静态加密，非访问控制）
- 设备身份、登录 UI、会话刷新（`switchContext` 协议在内，谁调用它在应用层）
- 权限审计日志、审计 UI；收回已导出 / 复制的数据
- 声明租户的实体使用 `Full` / `QueryCache` / remote 仓库；`PullBatchRequest` 的 filter 槽

## 验收标准

| #   | 前置条件                                                                                       | 操作                                                                                      | 预期结果                                                                                                                  | 状态 |
| --- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 实体未声明 `access`（含带业务 `ownerId` 的 `IdCard` / `Order`）                                | connect、读写、同步、三端默认列表 / 详情                                                  | 表结构、SQL、外键、默认 UI 字段集合与现状一致；现有测试与 API 基线不回归；业务 `ownerId` 不参与任何授权判定               | ⬜   |
| 2   | `access` 指向不存在 / 非字符串 / nullable 属性；共享实体关联租户私有实体；多对多中间实体缺声明 | metadata-validate                                                                         | 配置期报错，指出实体名、属性与原因                                                                                        | ⬜   |
| 3   | 规则含 `roles: []`、空串角色、`{}`、未知键，或 `ownerOnly` 而实体无 `access.owner`             | metadata-validate                                                                         | 配置期报错；任意非空角色名不因「未注册」报错                                                                              | ⬜   |
| 4   | 实体声明 `access.tenant`，`context.tenantId = A`                                               | 用户 create：不带租户值 / 带 A / 带 B                                                     | 注入 A / 成功 / 抛 `PermissionDeniedError` 且无新行                                                                       | ⬜   |
| 5   | 同上，`context.tenantId` 未设置                                                                | create；`get` / `find` / `count`                                                          | 全部抛错（fail-closed），不产生空归属行，不返回任何行                                                                     | ⬜   |
| 6   | 实体声明 `access.owner`                                                                        | create 不带 owner / 伪造他人 owner                                                        | 注入 `userId`、本地立即渲染 / 抛 `PermissionDeniedError`                                                                  | ⬜   |
| 7   | 已存在的声明实体行                                                                             | 用户 update 改 tenant 或 owner 属性（含先改内存实例再 `save`）                            | 抛 `PermissionDeniedError`，不静默剔除，库内不变                                                                          | ⬜   |
| 8   | 实体权限为 `'both'` / `'system'` 简写                                                          | 2 值 × 3 操作，分别经公开写入口与适配器 / 执行器层写                                      | 与 US-027 一致：公开写入口按声明放行或抛 `PermissionDeniedError`，适配器 / 执行器层一律放行                               | ⬜   |
| 9   | `update: { roles: ['editor'] }`                                                                | `context.roles` 为 `undefined` / `[]` / `['viewer']` / `['editor']` 时 update             | 前三者抛 `PermissionDeniedError`，第四者放行                                                                              | ⬜   |
| 10  | `update: { roles: ['editor'], ownerOnly: true }`                                               | 前像 owner = userId 且有角色；非 owner 有角色；owner 为空；`userId` 缺失                  | 仅第一种放行，其余均拒；判定读持久化前像而非内存实例                                                                      | ⬜   |
| 11  | `update: { ownerOnly: true }`；另一实体 `update: 'system'`                                     | 同步合并他人合法行；用户写他人行；用户与同步分别 update `'system'` 实体                   | 同步放行且不重戳 owner / tenant；用户写他人行被拒；`'system'` 实体用户被拒、同步放行                                      | ⬜   |
| 12  | 声明实体                                                                                       | 经 Repository / EntityManager / 实体方法 / `mutations` / `saveMany` / `removeMany` / 级联 | 全部入口同一判定；批量中任一行被拒则整次拒绝、库内无部分写入                                                              | ⬜   |
| 13  | 两个租户私有实体有关联；另有共享实体                                                           | 关联 B 租户行；关联同租户行；关联共享行；级联删除 / SET NULL                              | 跨租户拒绝且目标不变；同租户、共享成功；级联不触及外租户；既有唯一约束语义不变                                            | ⬜   |
| 14  | 本地库同时存有 A、B 租户行，context 为 A                                                       | `get` / `find` / `findOne` / `count`、关联加载、关联候选、实时查询                        | 只见 A；按 id `get` B 的行返回不存在                                                                                      | ⬜   |
| 15  | 声明租户的实体配 `Full` / `QueryCache` / remote 仓库，或 `Filter` 配 HTTP 远端                 | connect                                                                                   | 配置期报错，不回落全量                                                                                                    | ⬜   |
| 16  | `Filter` 同步，`remote.filter()` 与 `PullRepositoryOptions.filter` 含 OR                       | pull                                                                                      | 远端收到的条件为租户条件 AND 自定义条件；结果不越租户                                                                     | ⬜   |
| 17  | 已拉过 A                                                                                       | `switchContext` A→B→A；同租户换用户；仅降权                                               | 普通读与 UI 不见旧范围；B 从自己的零水位拉到完整基线；回 A 续用 A 水位；能力派生随之刷新                                  | ⬜   |
| 18  | 切换前发出的拉取 / 推送在切换后返回                                                            | 观察本地库与水位                                                                          | 旧代次结果不落库、不推进任何水位                                                                                          | ⬜   |
| 19  | 声明实体有未推送变更                                                                           | `switchContext` 换租户或用户；仅改 `roles`                                                | 前者拒绝并报待推数量，context 不变；后者放行                                                                              | ⬜   |
| 20  | 库含声明实体                                                                                   | 经 `context` setter 改 `userId` / `tenantId` / `roles`；原地 `roles.push()`               | 抛错并指向 `switchContext`；未声明实体的库 setter 行为不变                                                                | ⬜   |
| 21  | 同一物理库两个 RxDB 连接分处 A、B；另调用 `evictTenantData(B)`                                 | 各自读写同步；驱逐（B 无 / 有待推变更）                                                   | 两连接互不可见、互不推进对方水位；驱逐删除本地 B 行且不生成 `RxDBChange` / 有待推时拒绝                                   | ⬜   |
| 22  | 声明实体收到 `rxdb_change` 实时 INSERT（含外租户、切换前订阅的迟到事件）                       | 观察本地                                                                                  | 不直接应用 patch，只触发当前代次的逐仓拉取；无旧范围显示或计数                                                            | ⬜   |
| 23  | 参考 SQL，日志含不完整快照、外租户变更、删除                                                   | 严格拉取                                                                                  | 不完整快照与外租户变更不返回；删除按 `beforeData` 归属返回                                                                | ⬜   |
| 24  | 测试 fixture 开启真实 RLS                                                                      | push：`WITH CHECK` 抛错、`USING` 零行生效、空 / 部分 / 重复确认、允许与拒绝混合           | 每条操作有确定结果；被拒变更标记 rejected 可查询、不自动重试、无 remoteId；确认缺失整批失败不推进水位；零行生效不产生日志 | ⬜   |
| 25  | 远端已提交、本地回填失败                                                                       | 同一批次重推                                                                              | 返回「已应用的重试」与原 remoteId，无重复副作用，不判为拒绝                                                               | ⬜   |
| 26  | 测试 fixture，普通 authenticated 身份（非表 owner / `BYPASSRLS`）                              | 伪造 context / filter / 日志镜像；直接调 RPC；直接查 `rxdb_change`；实时订阅              | 均取不到、写不进外租户内容                                                                                                | ⬜   |
| 27  | 三端 demo：update 禁 delete 允、update 允 delete 禁、create 缺角色、混合 owner 列表            | 打开列表 / 详情；详情打开后降权再保存；批量删除                                           | 只读行仍可查看；入口按操作独立显隐；降权后保存被拒；批量结果确定；Angular / React / Vue 跑同一组行为用例（e2e）一致       | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 交付阶段

| 阶段 | 交付                                                                                      | 关闭条件                                     | 依赖                 | AC 区段   | 状态 |
| ---- | ----------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------- | --------- | ---- |
| A    | 声明与上下文：`access` 声明、`RxDBContext` 扩展与冻结快照、规则类型与结构校验             | 未声明零回归；配置错误可定位                 | US-027 阶段 A        | AC#1～3   | ⬜   |
| B    | 判定与本地约束：真值表、全部用户写入口、归属不可变、同租户关系、本地读收敛                | 真值表与写入口矩阵全绿；六个本地后端共享套件 | A；US-027 阶段 B     | AC#4～14  | ⬜   |
| C    | 同步作用域与切换：模式白名单、拉取条件组合、按租户水位、实时信号化、`switchContext`、驱逐 | 切换 / 迟到 / 多连接场景全绿                 | A / B                | AC#15～22 | ⬜   |
| D    | 权威端：严格拉取与逐操作确认的参考 SQL、push 确认与拒绝处置、部署说明、测试 RLS fixture   | 真实 Supabase + 普通身份下全绿；拉取计划基线 | C                    | AC#23～26 | ⬜   |
| E    | 三框架操作级能力派生与 e2e                                                                | 三端同一组行为用例全绿                       | B / C；US-027 阶段 C | AC#27     | ⬜   |

一阶段一 PR，每阶段独立更新 AC 状态与 API 基线。负向用例先红后绿；核心判定 / 作用域代码覆盖率 ≥ 90%，其余包 ≥ 80%。阶段 D 禁止用 mock 的 `SupabaseDataError` 代替真实 RLS。

## 技术笔记

**关键设计决策**（已锁定）：

- **显式声明，不加基础字段**：`EntityBase` 加 `ownerId` 会撞上业务模型里已有的 `ownerId uuid NOT NULL` 外键、改变三端默认 UI、并迫使引擎替所有存量表自动 `ADD COLUMN` 和猜回填。改为实体声明指向自有属性后，单用户应用零变化、列迁移归使用方 `MigrationType[]`、存量行的租户回填是使用方显式迁移而不是引擎猜测。
- **`owner` ≠ `createdBy`**：审计与授权分离；`ownerOnly` 只看声明的 owner 属性。
- **兼容退化只针对「未声明的谓词」**：上下文缺角色 / 缺 ID 永远不是放行理由。
- **业务谓词只约束用户写**：系统写在适配器 / 执行器层、不经判定，保留远端归属原样落库，否则同步他人的合法行会被 `ownerOnly` 错拒或被重戳。
- **租户不可变、owner 不可转让**：消除了「行离开范围」事件与前后像归属不一致，严格拉取只需按快照归属求值。转让与迁移另立故事时再引入独立许可。
- **客户端判定只做快速反馈**：安全边界只在权威端；本仓交付的是部署契约与能被普通身份验证的 fixture，不是策略引擎。
- **不改 `RuleGroup` 语法**：拉取注入的是求值后的具体值，租户条件作为顶层 AND。
- **作用域并存而非清库**：本地多租户行物理并存、读时收敛、水位按租户分键——换租户无需清库，A→B→A 不重拉，同库多连接不互相误伤。

**留给 plan 阶段的落点**（不改语义）：

- 严格拉取是 `rxdb_pull_changes` 加参数还是新函数；`rxdb_mutations` 逐操作确认的返回形状与版本兼容（第三方远端适配器的升级说明）。
- rejected 标记落在 `RxDBChange` 的哪一列，以及对应的同步状态 API 名。
- 严格拉取在日志 JSON 上按租户过滤的索引（如 `afterData->>'<tenantProperty>'` 表达式索引），以可复验的查询计划与延迟基线决定。

## 实现文件

| 阶段 | 文件                                                                                                     | 改动                                                     |
| ---- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| A    | `packages/rxdb/src/entity/entity-options.interface.ts`                                                   | `access` 声明、`EntityPermissionRule` 类型及 TSDoc       |
| A    | `packages/rxdb/src/entity/metadata-validate.ts`                                                          | 声明与规则结构校验                                       |
| A    | `packages/rxdb/src/rxdb.interface.ts`、`packages/rxdb/src/RxDB.ts`                                       | `RxDBContext` 扩展、冻结快照、setter 限制                |
| B    | `packages/rxdb/src/entity/`、各适配器写路径                                                              | 判定原语、注入、前像判定、归属不可变、同租户关系         |
| B    | `packages/rxdb/src/repository/`、`packages/rxdb/src/entity/entity-identity-cache.ts`                     | 本地读租户收敛                                           |
| B    | `packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts`                                 | 声明的归属属性按只显示处理                               |
| C    | `packages/rxdb/src/RxDB.ts`、`packages/rxdb/src/sync-contract/sync-record-utils.ts`                      | `switchContext`、代次、按租户水位键、`evictTenantData`   |
| C    | `packages/rxdb-plugin-sync/src/pull-repository.ts`、`pull-batch.ts`、`push-repository.ts`                | 条件组合、代次校验、模式白名单                           |
| C    | `packages/rxdb-adapter-supabase/src/handle_supabase_change.ts`、`packages/rxdb-adapter-http/`            | 实时信号化；无 filter 通道的配置期报错                   |
| D    | `docker/sql/02-rxdb-sync-functions.sql`、`docker/sql/04-rxdb-utils-functions.sql`                        | 严格拉取、逐操作确认、日志与业务效果同事务               |
| D    | `packages/rxdb-plugin-sync/src/push-repository.ts`、`packages/rxdb-adapter-supabase/`                    | 确认完整性校验、rejected 处置                            |
| D    | `docker/sql/` 测试 fixture、Supabase 适配器部署说明                                                      | 测试专用 RLS（成员表、租户不可变、owner 策略）与部署契约 |
| E    | `packages/rxdb-model/src/`、`packages/rxdb-model-{angular,react,vue}/src/entity-list/`、`entity-detail/` | 操作级能力派生（框架无关部分 + 三端）                    |
| E    | `apps/dev-rxdb-{angular,react,vue}-e2e/`                                                                 | 多角色 / 多租户行为 e2e                                  |

## References

- [vision.md](../../vision.md) — 阶段 3「用户身份、设备身份、工作区成员和权限模型」「按租户同步」
- [US-027 实体操作权限模型](US-027-entity-permission-model.md) — 按层执行者、`'both' | 'system'` 简写与 `PermissionDeniedError` 的基线
- [US-501 Workspace 插件](../plugin/US-501-workspace-plugin.md) — `workspace` 命名占用的依据
- [`RxDBContext`](../../../packages/rxdb/src/rxdb.interface.ts) — 上下文现状
- [`pullChanges`](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts) / [`rxdb_pull_changes`](../../../docker/sql/02-rxdb-sync-functions.sql) — 过滤通道现状
- [EpicenterHQ — Conflict Resolution Gets All the Attention](https://github.com/EpicenterHQ/epicenter/blob/main/docs/articles/conflict-resolution-is-the-least-of-your-problems.md) — 权限是本地优先生产阻塞项
- [Pylon — Policies](https://docs.pylonsync.com/concepts/policies) / [owner stamping](https://docs.pylonsync.com/plugins/data#owner_stamp) — 服务端策略与戳记模式
- [PostgreSQL — Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) — `USING` / `WITH CHECK`、绕过角色、约束不受 RLS 约束
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) / [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes) — 可信授权来源、JWT 刷新、实时授权
