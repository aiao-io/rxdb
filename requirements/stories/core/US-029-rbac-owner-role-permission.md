---
id: US-029
title: 多用户 RBAC：角色与所有权写权限
status: Backlog
priority: Low
epic: epic-004-future-features
created: 2026-09-20
updated: 2026-10-06
tags: [core, permission, rbac, rxdb-model]
---

<!--
INVEST 检查清单:
- [ ] Independent: 阶段 A（声明与身份）只依赖 US-027 阶段 A；B 依赖 A 与 US-027 阶段 B；C 依赖 B 与 US-218；D 依赖 B 与 US-027 阶段 C
- [ ] Negotiable: 声明键名（access / owner）与 API 名可协商；判定真值表、写规则、读边界与身份模型在「技术笔记」锁定
- [ ] Valuable: 价值待证——无具名多用户使用方，见「价值待证」
- [ ] Estimable: 判定真值表、写规则、读边界与身份模型已定死；plan 阶段只剩落点与命名
- [ ] Small: 不是单迭代可完成的小故事；文件内按「交付阶段」A～D 拆分，一阶段一 PR
- [ ] Testable: 每条契约都有负向验收；权威端验收要求真实 RLS + 普通 authenticated 身份，不接受 mock
-->

# 用户故事：多用户 RBAC：角色与所有权写权限

## 作为/我想要/以便

**作为** 构建多用户应用的开发者
**我想要** 在实体上声明所有权属性、并按角色 / 所有权声明 create / update / delete 权限
**以便** 越权写在本地公开写入口被快速拒绝、在同步权威端被真实拒绝，UI 按同一份声明显隐操作入口；而不是每个实体手工拼「写前检查 + RLS + UI 只读」

## 背景与动机

- [`RxDBContext.userId`](../../../packages/rxdb/src/rxdb.interface.ts) 只用于审计：适配器写实体行时拿它填 `createdBy` / `updatedBy`（实体声明了这两列才写）——本地的 sqlite-core / pglite 在 `insert_sql` / `inserts_sql` / `update_sql` 里注入，Supabase 在 `build_upsert_params`、`executeUpsert`、`SupabaseRepository` 的 `create()` / `update()`、[`build_merge_changes_payload`](../../../packages/rxdb-adapter-supabase/src/supabase.merge-changes.ts) 里注入。没有任何写入口按身份或角色判定。
- `createdBy` / `updatedBy` 是**审计字段，不能当授权锚点**：[`ENTITY_BASE_METADATA_OPTIONS`](../../../packages/rxdb/src/entity/entity-base.ts) 里两者 `nullable`；[`fillInitValue`](../../../packages/rxdb/src/entity/entity.utils.ts) 允许构造期传入 readonly 字段；`normalizeUpdateEntity` 对 readonly 键是**静默剔除**而不是报错；推送时 `build_merge_changes_payload` 用**推送那一刻**的 `rxdb.context.userId` 覆盖这两列，而不是写入时的身份。
- **`ownerId` 已被业务模型占用**：[`03-business-tables.sql`](../../../docker/sql/03-business-tables.sql) 的 `shop.id_card` / `shop.order` 有 `"ownerId" uuid NOT NULL` 外键指向 `shop."user"`（共享实体 [`IdCard`](../../../packages/rxdb-test/shop/IdCard.ts)、[`Order`](../../../packages/rxdb-test/shop/Order.ts)）。往 `EntityBase` 塞同名基础字段会与子类覆盖相撞；[`buildEditableColumns`](../../../packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts) 只跳过 `SKIP_FIELDS` / `DISPLAY_ONLY_FIELDS`，新基础字段会在三端默认 UI 里冒出可编辑列。
- 服务端没有业务策略：参考 SQL [`docker/sql/`](../../../docker/sql/) 里业务表没有 RLS 策略，只有测试夹具表 `rls_todos`（[`03-business-tables.sql`](../../../docker/sql/03-business-tables.sql)）用 `auth.uid()` 开了 RLS，锚点是 `createdBy`；写入 RPC `rxdb_mutations`（[`04-rxdb-utils-functions.sql`](../../../docker/sql/04-rxdb-utils-functions.sql)）是 `SECURITY INVOKER`。业务表开 RLS 后推送的幽灵 DELETE 已由 [US-218](../adapter/US-218-supabase-rls-push-integrity.md)（Done）修复。
- **同步日志不受业务表读策略约束**：`rxdb_change` 未开 RLS 且对 `anon` / `authenticated` 授权（生产脚本 `docker/sql/production/rxdb-change-grants.sql` 只收回写权限，保留 SELECT）；[`rxdb_pull_changes`](../../../docker/sql/02-rxdb-sync-functions.sql) 从日志返回 `afterData` 全行。业务表上的 SELECT 策略挡不住同步实体经日志被拉走——同步实体的「读权限」在现有协议下无从实现。
- 远端直读的路径**会**受业务表 SELECT 策略约束：remote 仓库（`SyncType.None` + `remote`）的 [`SupabaseRepository`](../../../packages/rxdb-adapter-supabase/src/SupabaseRepository.ts) 与 `SyncType.QueryCache` 的 `fetchMetadata` / `findByIds`（[`RxDBAdapterSupabase`](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts)）都直接 `.from(tableName)` 查业务表。
- 身份与实例：[`RxDB.context`](../../../packages/rxdb/src/RxDB.ts) setter 整体替换、不发事件；三端 provider（Angular `provideRxDB` 走 `provideAppInitializer`、React `RxDBProvider`、Vue `provide(RxDBKey, …)`）都是一个应用一个实例。demo 的 `context.userId` 除 supabase demo 外都是启动时写死的常量；supabase demo 取 `VITE_RXDB_USER_ID` 或 localStorage 里生成的随机 UUID（`getOrCreateUserId`）。都没有切换用户的路径。
- [US-027 实体操作权限模型](US-027-entity-permission-model.md) 按层区分执行者：经公开写入口的写是用户写、在那里判定，适配器 / 执行器层的写是系统写、不判定；每个操作取 `'both' | 'system'`。本故事把用户写的判定扩展到**角色 / 所有权**，US-027 的 Out of Scope 明确指向本故事。
- [vision.md](../../vision.md) 阶段 3 规划「用户身份、设备身份、工作区成员和权限模型」。

### 行业调研结论

本地优先架构下授权有三条路线：信任客户端（安全剧场，无效）；按权限组加密（密钥管理复杂、吊销弱）；**部分复制 + 服务端策略求值**（Zero / ElectricSQL / PowerSync 均为此形态）。本故事只做第三条里「写授权」那一半：读侧的部分复制需要按身份过滤同步日志，属于租户 / 读权限范畴，不在本期。

- EpicenterHQ《Conflict Resolution Gets All the Attention. It's the Least of Your Problems.》：permissions、schema migration、部分复制才是本地优先的真正生产阻塞项。
- Pylon 的 [Policies](https://docs.pylonsync.com/concepts/policies) 与 [owner stamping](https://docs.pylonsync.com/plugins/data#owner_stamp)：显式 read/insert/update/delete 策略 + 会话绑定 + 服务端戳记 owner。
- [PostgreSQL Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)：`USING` 过滤目标行不抛错、`WITH CHECK` 抛错；表 owner / `BYPASSRLS` 绕过策略。
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)：授权数据不能取自用户可改的 `user_metadata`，应取 `app_metadata`；JWT 内的角色要等 token 刷新才生效。

以上为外部资料结论（**推断**，非本仓源码实证）；本仓实证见「背景与动机」。

## 权限模型设计

模型是 **按层执行者（US-027）+ role / ownership 写谓词 + 一实例一身份**，不是角色管理产品，也不是读隔离。

| 边界         | 承诺                                                                                       | 不承诺                                                      |
| ------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| 远端写       | 权威端按可信会话（`auth.uid()` + `app_metadata` 角色）限制业务表写入（部署契约 + fixture） | `RxDBContext.roles` 本身可信；客户端判定是安全边界          |
| 读           | remote / QueryCache 实体的读受业务表 SELECT 策略约束                                       | 同步实体（Full / Filter）按用户隐藏行；`rxdb_change` 读受限 |
| 本地正常使用 | 越权写在公开写入口快速拒绝；UI 按操作显隐入口                                              | 防住直接改本地库的用户                                      |
| 离线写       | 乐观暂存，恢复后由权威端裁决；拒绝的可观测与处置由 US-218 交付                             | 离线客户端感知权威端刚发生的降权                            |
| 系统执行者   | 系统写走适配器 / 执行器层，不经判定                                                        | `roles` 数组能赋予系统身份                                  |
| 身份         | 一个 RxDB 实例一个用户身份；换用户 = 新实例                                                | 同一实例运行时切换用户或角色                                |

### 声明层：实体显式声明所有权属性（不改 `EntityBase`）

```ts
interface EntityAccessOptions {
  /** 所有权属性；`ownerOnly` 的唯一判定依据（不是 `createdBy`） */
  owner?: { property: string };
}
// EntityMetadataOptions 新增 access?: EntityAccessOptions
```

- 被指向的属性必须是实体（含继承）上已声明的、`uuid` 或 `string` 类型、`nullable: false` 的普通属性；否则 metadata-validate 配置期报错。列由使用方经 `MigrationType[]` 自己建与回填——引擎**不自动补列**。
- 未声明 `access` 的实体零变化：`IdCard.ownerId` 这类业务字段**不会**被当成授权字段，除非使用方显式声明指向它（即确认「业务 `shop.user.id` 即登录身份 ID」）。
- 声明了的 owner 属性在 rxdb-model 默认 UI 中只显示不可编辑：`buildEditableColumns` 按实体 `access` 声明动态判断，不是往写死的 `DISPLAY_ONLY_FIELDS` 里加字面量。
- 本期不支持在 `@GraphEntity` 上声明带谓词的规则：[`GraphRepository.addEdge()` / `removeEdge()`](../../../packages/rxdb-plugin-graph/src/GraphRepository.ts) 不经门面写入口，metadata-validate 拒绝该组合。

### 身份层：`RxDBContext.roles` 与一实例一身份

[`RxDBContext`](../../../packages/rxdb/src/rxdb.interface.ts) 增加 `roles?: readonly string[]`。`userId` 与 `roles` 是同一份身份快照。

库中存在任一声明了 `access` 或规则形式权限的实体时：

- 身份**只能设入一次**：`userId` 从未设置到设置（允许应用先建实例、登录后再设入）成功，此后经 `context` setter 改动 `userId` 或 `roles` 抛错；context 冻结保存，原地 `roles.push()` 抛错。未声明的库 setter 行为不变。
- **换用户 = 新实例**：退出登录时销毁实例（Angular 一般为整页重载，React / Vue 卸载 provider 后重建），新用户用新实例。角色变化同理——它本来也要等 JWT 刷新才在远端生效。不引入 `switchContext`、代次与缓存清理。
- **待推变更不跨身份**：同一本地库里用户 A 的未推送变更，不得以用户 B 的身份推送（推送时审计列取推送时的 `userId`，见「背景与动机」）。推荐每用户一个 `dbName`；引擎侧的守卫落点（本地库绑定首个 `userId`，或打开时检查待推变更的写入身份）留给 plan 阶段。

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
2. **谓词只约束用户写**：谓词之间 AND，`roles` 数组内部 ANY。`roles` 声明后，`context.roles` 为 `undefined`、`[]` 或无交集**一律拒**——兼容退化只存在于「规则没声明该谓词」时。`ownerOnly` 要求前像的 owner 属性与 `context.userId` **都是非空字符串且相等**，任一缺失即拒。
3. **系统写**（同步合并等）不受 `roles` / `ownerOnly` 约束，不重戳 owner（合并他人的合法行原样落库）。
4. 结构校验：`roles: []`、空串角色、`{}`、未知键、`ownerOnly` 但实体未声明 `access.owner`、`create` 上声明 `ownerOnly`（新行没有前像，owner 由注入保证）都是配置期错误。**角色名只校验结构**，不建角色注册表——角色语义归应用。

### 写入层：owner 的写前、写后约束

适用于 Repository、EntityManager、实体 `save` / `remove`、`mutations`、`saveMany` / `removeMany` 与关联级联的全部**用户**写入口：

- **create**：owner 属性缺省时从 `context.userId` 注入；显式值与 `userId` 相同则接受，不同则抛 `PermissionDeniedError`；`userId` 缺失则抛错，不产生空 owner 行。
- **update / delete**：权限按**持久化前像**判定（从本地库读出），不看内存里被改过的实例；前像按批一次 `WHERE id IN (...)` 读取、与随后的写在同一事务内，不做 N+1。update 改动 owner 属性（含先改内存实例再 `save`）抛 `PermissionDeniedError`，不走 readonly 的静默剔除。**owner 转让本期不支持**。
- **批量**：落库前逐行判定，任一行被拒则整次调用拒绝、库内无部分写入；拒绝清单沿用 US-027 阶段 B 的 `PermissionDeniedError` 形状。

### 读取层：本期不设读权限

- **同步实体**（`Full` / `Filter`）：对能同步它的所有用户全量可读，本地读不按身份收敛。原因是日志 `rxdb_change` 不受业务表读策略约束（见「背景与动机」），只在业务表上限读等于假装隔离。
- **需要按用户限读的数据**：声明为 remote 仓库或 `QueryCache`，由权威端业务表的 SELECT 策略裁决；本地 QueryCache 行缓存靠「每用户一个 `dbName`」与他人隔离。
- 部署说明写明这条边界：开了业务表 SELECT 策略的同步实体，仍能经日志被拉走。

### 权威端契约（部署方实现，本仓交付说明与测试 fixture）

- 业务表：按 `auth.uid()` 与 JWT `app_metadata` 中的角色判定，不读 `user_metadata`；owner 列 `WITH CHECK` 等于 `auth.uid()` 且 update 时不可变；update / delete 的 owner 与角色策略按需。
- 测试 fixture：现有 `rls_todos` 的 RLS 锚定在审计字段 `createdBy` 上，是 US-218 的推送完整性夹具，不改；本故事另建一张以显式 owner 列为锚点的夹具表，`owner` 与 `createdBy` 分离的判定只在新表上验证。
- 写入 RPC 与日志的完整性（日志由真实生效的写推导、逐操作确认与拒绝处置）以 [US-218](../adapter/US-218-supabase-rls-push-integrity.md) 为准，本故事不重复交付。
- 降权窗口：角色变化对远端的生效时间（JWT 刷新周期）在部署说明中写明。
- 测试登录态 harness：建测试用户、写 `app_metadata` 角色、取 JWT 并注入 PostgREST——唯一的登录调用是 `rxdb-adapter-supabase` 的 `push-receipts.spec.ts` 用 `auth.signUp` 注册随机用户取会话（US-218）；`rxdb-plugin-sync` / `apps/dev-rxdb-supabase` 没有登录调用，写 `app_metadata` 角色与注入 JWT 的部分仍需新搭。

### UI 层：按操作区分的能力派生

沿用 US-027 的 `deriveEntityCapabilities()`：`canCreate` 由实体规则与身份求值，`canEdit` / `canDelete` 按行求值（US-027 已把删除能力参数定成按行谓词 `(record) => boolean`，签名不用再改）；能读到的行总是可查看。rxdb-model 的列表、详情、表单、批量动作消费同一派生，不复制权限条件；`_readonly` 只由 `!canEdit` 派生，删除入口按 `canDelete` 单独显示。身份未设入时一律不可操作。身份在实例内不变，派生不需要订阅上下文变化。三框架对称（铁律），依赖 US-027 阶段 C 的「查看与删除拆开」UI 契约。

## 范围边界

### In Scope

- `access.owner` 声明与 metadata-validate；`RxDBContext.roles`、身份一次设入与冻结
- `EntityPermissionRule` 谓词与判定真值表；全部用户写入口的 owner 注入、前像判定、owner 不可变
- 待推变更不跨身份推送的守卫
- 读边界说明（同步实体不限读；限读走 remote / QueryCache）
- 权威端部署说明、测试专用 RLS fixture 与登录态 harness
- rxdb-model 操作级能力派生（Angular / React / Vue 三端）

### Out of Scope

- 多租户：租户声明、本地读收敛、按租户同步与水位、切换与驱逐（RV-022 评审后整体移出，需要时另立故事）
- 同步实体的读权限谓词与按身份过滤同步日志
- 同一实例运行时切换用户或角色（`switchContext`）
- 服务端策略引擎本身与生产级 RLS 模板（fixture 只服务测试）
- `EntityBase` 新增基础字段与引擎自动补列
- owner 转让；角色注册表、层级继承、审批 UI
- 图插件实体的谓词规则；按权限组加密（[`@aiao/rxdb-adapter-encrypted`](../../../packages/rxdb-adapter-encrypted/README.md) 是字段级静态加密，非访问控制）
- 登录 UI、会话刷新、权限审计日志

## 验收标准

| #   | 前置条件                                                                                           | 操作                                                                                       | 预期结果                                                                                                       | 状态 |
| --- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 实体未声明 `access` / 规则（含带业务 `ownerId` 的 `IdCard` / `Order`）                             | connect、读写、同步、三端默认列表 / 详情；改 `context`                                     | 表结构、SQL、默认 UI 字段集合、setter 行为与现状一致；现有测试与 API 基线不回归；业务 `ownerId` 不参与授权判定 | ⬜   |
| 2   | `access.owner` 指向不存在 / 非 `uuid`·`string` / nullable 属性；`@GraphEntity` 带谓词规则          | metadata-validate                                                                          | 配置期报错，指出实体名、属性与原因                                                                             | ⬜   |
| 3   | 规则含 `roles: []`、空串角色、`{}`、未知键；`ownerOnly` 而无 `access.owner`；create 上 `ownerOnly` | metadata-validate                                                                          | 配置期报错；任意非空角色名不因「未注册」报错                                                                   | ⬜   |
| 4   | 库含声明实体                                                                                       | 未设 `userId` 时设入身份；再改 `userId` / `roles`；原地 `roles.push()`                     | 首次设入成功；之后的改动与原地修改均抛错                                                                       | ⬜   |
| 5   | 同一本地库存有用户 A 的未推送变更                                                                  | 以用户 B 的身份打开并同步                                                                  | A 的变更不以 B 的身份推送（拒绝打开或拒绝推送并报待推数量）；不同 `dbName` 的两个用户互不可见                  | ⬜   |
| 6   | 实体声明 `access.owner`                                                                            | create 不带 owner / 带自己 / 伪造他人 owner；`userId` 未设入时 create                      | 注入 `userId` / 成功 / 抛 `PermissionDeniedError` 且无新行 / 抛错且无新行                                      | ⬜   |
| 7   | 已存在的声明实体行                                                                                 | 用户 update 改 owner 属性（含先改内存实例再 `save`）                                       | 抛 `PermissionDeniedError`，不静默剔除，库内不变                                                               | ⬜   |
| 8   | 实体权限为 `'both'` / `'system'` 简写                                                              | 2 值 × 3 操作，分别经公开写入口与适配器 / 执行器层写                                       | 与 US-027 一致：公开写入口按声明放行或抛 `PermissionDeniedError`，适配器 / 执行器层一律放行                    | ⬜   |
| 9   | `update: { roles: ['editor'] }`                                                                    | `context.roles` 为 `undefined` / `[]` / `['viewer']` / `['editor']` 时 update              | 前三者抛 `PermissionDeniedError`，第四者放行                                                                   | ⬜   |
| 10  | `update: { roles: ['editor'], ownerOnly: true }`                                                   | 前像 owner = userId 且有角色；非 owner 有角色；前像 owner 为空                             | 仅第一种放行，其余均拒；判定读持久化前像而非内存实例                                                           | ⬜   |
| 11  | `update: { ownerOnly: true }`；另一实体 `update: 'system'`                                         | 同步合并他人合法行；用户写他人行；用户与同步分别 update `'system'` 实体                    | 同步放行且不重戳 owner；用户写他人行被拒；`'system'` 实体用户被拒、同步放行                                    | ⬜   |
| 12  | 声明实体                                                                                           | 经 Repository / EntityManager / 实体方法 / `mutations` / `saveMany` / `removeMany` / 级联  | 全部入口同一判定；批量中任一行被拒则整次拒绝、库内无部分写入；前像读取次数与批量行数无关                       | ⬜   |
| 13  | 测试 fixture 开启真实 RLS，普通 authenticated 身份（非表 owner / `BYPASSRLS`）                     | 伪造 `context.userId` / `roles` 推送他人行；改自己的 `user_metadata` 角色后写；改 owner 列 | 远端均拒绝，拒绝经 US-218 的逐操作回执可观测；只有 `app_metadata` 角色生效                                     | ⬜   |
| 14  | 同上；remote 仓库实体与 `QueryCache` 实体带 owner 读策略                                           | 用户 B 查询用户 A 的行                                                                     | 均查不到；部署说明写明同步实体不受此约束                                                                       | ⬜   |
| 15  | 三端 demo：update 禁 delete 允、update 允 delete 禁、create 缺角色、混合 owner 列表                | 打开列表 / 详情；批量删除；身份未设入时打开                                                | 只读行仍可查看；入口按操作独立显隐；批量结果确定；Angular / React / Vue 跑同一组行为用例（e2e）一致            | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 交付阶段

| 阶段 | 交付                                                                                | 关闭条件                                     | 依赖             | AC 区段   | 状态 |
| ---- | ----------------------------------------------------------------------------------- | -------------------------------------------- | ---------------- | --------- | ---- |
| A    | 声明与身份：`access.owner`、规则类型与结构校验、`roles`、身份一次设入、待推不跨身份 | 未声明零回归；配置错误可定位                 | US-027 阶段 A    | AC#1～5   | ⬜   |
| B    | 判定与写约束：真值表、全部用户写入口、owner 注入、前像判定、owner 不可变            | 真值表与写入口矩阵全绿；六个本地后端共享套件 | A；US-027 阶段 B | AC#6～12  | ⬜   |
| C    | 权威端：部署说明、测试 RLS fixture、登录态 harness                                  | 真实 Supabase + 普通身份下全绿               | B；US-218        | AC#13～14 | ⬜   |
| D    | 三框架操作级能力派生与 e2e                                                          | 三端同一组行为用例全绿                       | B；US-027 阶段 C | AC#15     | ⬜   |

一阶段一 PR，每阶段独立更新 AC 状态与 API 基线。负向用例先红后绿；核心判定代码覆盖率 ≥ 90%，其余包 ≥ 80%。阶段 C 禁止用 mock 的 `SupabaseDataError` 代替真实 RLS。

## 技术笔记

**关键设计决策**（已锁定）：

- **只做写授权**：同步日志不受业务表读策略约束，在同步实体上做读权限就得按身份过滤日志——那是租户 / 部分复制的工作量。本期把读边界明说出来，限读数据交给远端直读的同步模式。
- **一实例一身份**：换用户、换角色都走新实例，省掉 `switchContext`、上下文代次、缓存清理与 UI 订阅。代价是 Angular 退出登录要整页重载；三端 provider 本来就是一个应用一个实例，模式对称。
- **显式声明，不加基础字段**：`EntityBase` 加 `ownerId` 会撞上业务模型里已有的 `ownerId uuid NOT NULL` 外键、改变三端默认 UI、并迫使引擎替存量表自动补列和猜回填。
- **`owner` ≠ `createdBy`**：审计与授权分离；`ownerOnly` 只看声明的 owner 属性。
- **兼容退化只针对「未声明的谓词」**：上下文缺角色 / 缺 ID 永远不是放行理由。
- **谓词只约束用户写**：系统写在适配器 / 执行器层、不经判定，保留远端 owner 原样落库，否则同步他人的合法行会被 `ownerOnly` 错拒或被重戳。
- **owner 不可转让**：转让需要独立许可与「行离开所有者」语义，另立故事。
- **客户端判定只做快速反馈**：安全边界只在权威端；本仓交付的是部署契约与能被普通身份验证的 fixture，不是策略引擎。

**未选的替代方案**：应用注入一个策略函数（`(op, entity, preImage, context) => boolean`）代替声明式规则。抽象更少（省掉 `EntityPermissionRule` 与结构校验），但规则不再是元数据，UI 能力派生、devtools 展示与服务端 fixture 都无法从声明推导，也与 US-027 的 `'both' | 'system'` 声明不对称。解锁时若使用方的规则超出「角色 ANY + owner」，再评估改用或追加钩子。

**留给 plan 阶段的落点**（不改语义）：

- 待推变更不跨身份的守卫：本地库绑定首个 `userId`，还是打开时检查待推变更的写入身份；以及推送审计列改为取变更写入时的身份是否一并修正。
- 前像批量读在六个本地后端上的事务落点，与 `saveMany` 的耗时基线。

## 价值待证

本故事**价值待证**。「背景与动机」列的全是能力缺口，不是症状：没有具名的多用户使用方（demo、外部 issue、下游项目都没有），
demo 的 `userId` 是启动时写死的常量或随机生成的 UUID，没有切换用户的路径。
[`RemoteSecurityNotice`](../../../apps/dev-rxdb-supabase/src/app/remote-security-notice.ts) 只是提示「此 demo 未启用身份认证或 RLS」的文案。

去掉多租户后要新增的抽象有 5 项：`access.owner` 声明、`roles` 与一次设入的身份、`EntityPermissionRule` 谓词、
RLS fixture 与登录态 harness、操作级能力派生。已知病灶为 0，病灶数 < 抽象数，`priority` 因此为 Low。

推送时以当时的 `userId` 覆盖 `createdBy` / `updatedBy`（`build_merge_changes_payload`）意味着：同一本地库换用户后，
前一个用户的未推送变更会以新用户的名义、新用户的 JWT 推上去（**推断**，代码路径存在，未实验复现）。今天没有任何 demo 或使用方
在同一库上换用户，所以不计病灶；若出现这类使用方并复现，它可以不等本故事、单独作为审计归属缺陷修复。

评审中复现的业务表 RLS 幽灵 DELETE 不依赖本故事的任何声明，已拆为
[US-218](../adapter/US-218-supabase-rls-push-integrity.md)（Done）；阶段 C 以它为前置，该前置已满足。

**解锁条件**：出现具名的多用户使用方（demo、外部 issue 或下游项目），并能写出今天踩得到的具体症状。
届时上调优先级，并按 RV-022 中仍适用的 R10 与 P2 各条复核（`git show 952be44f:requirements/reviews/RV-022-us-029-readiness-review.md`）。
上游 [US-027](US-027-entity-permission-model.md) 阶段 A / B / C 不等本故事解锁，已独立交付。

## 实现文件

| 阶段 | 文件                                                                                                     | 改动                                               |
| ---- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| A    | `packages/rxdb/src/entity/entity-options.interface.ts`                                                   | `access` 声明、`EntityPermissionRule` 类型及 TSDoc |
| A    | `packages/rxdb/src/entity/metadata-validate.ts`                                                          | 声明与规则结构校验                                 |
| A    | `packages/rxdb/src/rxdb.interface.ts`、`packages/rxdb/src/RxDB.ts`                                       | `roles`、身份一次设入与冻结、待推不跨身份守卫      |
| B    | `packages/rxdb/src/entity/`、各适配器写路径                                                              | 判定原语、owner 注入、前像判定、owner 不可变       |
| B    | `packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts`                                 | 声明的 owner 属性按只显示处理                      |
| C    | `docker/sql/` 测试 fixture、Supabase 适配器部署说明                                                      | 测试专用 RLS（owner、`app_metadata` 角色）与读边界 |
| C    | `packages/rxdb-adapter-supabase/src/__tests__/`                                                          | 登录态 harness 与普通身份验收                      |
| D    | `packages/rxdb-model/src/`、`packages/rxdb-model-{angular,react,vue}/src/entity-list/`、`entity-detail/` | 操作级能力派生（框架无关部分 + 三端）              |
| D    | `apps/dev-rxdb-{angular,react,vue}-e2e/`                                                                 | 多角色 / 多 owner 行为 e2e                         |

## References

- [vision.md](../../vision.md) — 阶段 3「用户身份、设备身份、工作区成员和权限模型」
- [US-027 实体操作权限模型](US-027-entity-permission-model.md) — 按层执行者、`'both' | 'system'` 简写与 `PermissionDeniedError` 的基线
- [US-218 Supabase 远端启用 RLS 时的推送完整性](../adapter/US-218-supabase-rls-push-integrity.md) — 权威端写入完整性与逐操作回执
- RV-022 US-029 立项准入评审（`git show 952be44f:requirements/reviews/RV-022-us-029-readiness-review.md`）— 去掉多租户的依据
- [`RxDBContext`](../../../packages/rxdb/src/rxdb.interface.ts) — 上下文现状
- [`rxdb_pull_changes`](../../../docker/sql/02-rxdb-sync-functions.sql) — 日志读取现状（读边界的依据）
- [EpicenterHQ — Conflict Resolution Gets All the Attention](https://github.com/EpicenterHQ/epicenter/blob/main/docs/articles/conflict-resolution-is-the-least-of-your-problems.md) — 权限是本地优先生产阻塞项
- [Pylon — Policies](https://docs.pylonsync.com/concepts/policies) / [owner stamping](https://docs.pylonsync.com/plugins/data#owner_stamp) — 服务端策略与戳记模式
- [PostgreSQL — Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) — `USING` / `WITH CHECK`、绕过角色
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — 可信授权来源、JWT 刷新
