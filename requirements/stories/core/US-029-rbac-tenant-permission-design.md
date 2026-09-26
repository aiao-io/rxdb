---
id: US-029
title: 多用户 RBAC 权限与租户隔离的关联设计
status: Backlog
priority: Medium
epic: epic-004-future-features
created: 2026-09-20
updated: 2026-09-26
tags: [core, permission, rbac, tenant, sync, rxdb-model]
---

<!--
INVEST 检查清单:
- [ ] Independent: 阶段 A（字段与注入）可独立交付；阶段 B 依赖 US-027 的判定原语；阶段 C/D 依赖 A/B
- [ ] Negotiable: 字段命名（tenantId vs groupId vs workspaceId）与谓词形状可协商，理由在「技术笔记」锁定
- [ ] Valuable: 多用户/多租户应用开发者今天就要手工拼装行级过滤与越权防护（见「背景与动机」的现状缺口）
- [ ] Estimable: 设计决策已定死，plan 阶段无需再做架构选择
- [ ] Small: 不是单迭代可完成的小故事；文件内按「交付阶段」A/B/C/D 拆分，一阶段一 PR
- [ ] Testable: 字段注入、判定矩阵、同步过滤与三框架 UI 派生均有明确验收标准
-->

# 用户故事：多用户 RBAC 权限与租户隔离的关联设计

## 作为/我想要/以便

**作为** 构建多用户 / 多租户应用的开发者
**我想要** 在实体上声明行所有权与租户归属、并按角色声明操作权限
**以便** 本地库只同步、只放行当前用户有权访问的行，越权写被同步权威端拒绝；而不是每接入一个后端就手工重写一遍「行级过滤 + RLS + UI 只读」三板斧

## 背景与动机

- [`RxDBContext.userId`](../../../packages/rxdb/src/rxdb.interface.ts) 的 TSDoc 承诺「在 pull / push 时按 `userId` 做行级过滤（依赖具体适配器实现）」，但现状只有审计字段注入（Supabase 适配器的 [`applyAuditFields`](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.utils.ts) 写入 `createdBy` / `updatedBy`），**没有任何适配器按身份过滤 pull / push**——文档承诺与实现之间存在缺口，多用户场景下这条 TSDoc 会误导使用者以为引擎已经做了行级隔离。
- `createdBy` / `updatedBy` 是**审计字段，不能当授权锚点**：[`ENTITY_BASE_METADATA_OPTIONS`](../../../packages/rxdb/src/entity/entity-base.ts) 里两者 `nullable`；[`fillInitValue`](../../../packages/rxdb/src/entity/entity.utils.ts) 允许构造期传入 readonly 字段。Supabase 侧两条写路径（批量 [`build_upsert_params`](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.utils.ts) → `applyAuditFields`、单条 [`SupabaseRepository.create`](../../../packages/rxdb-adapter-supabase/src/SupabaseRepository.ts)）只在 `rxdb.context.userId` 存在时才覆盖这两列。更新路径已经不下发 `createdBy`（`applyAuditFields` 的 `@remarks` 写了原因：服务端 upsert 的 `SET` 子句会把原作者覆写掉），但 `userId` 缺席时客户端构造的值原样上行，而 `userId` 本身也是客户端在 `RxDBContext` 里自报的。
- 服务端没有戳记：参考 SQL [`docker/sql/`](../../../docker/sql/) 里没有 `auth.uid()`、没有 RLS 策略；写入 RPC（[`04-rxdb-utils-functions.sql`](../../../docker/sql/04-rxdb-utils-functions.sql) 的 `rxdb_batch_upsert` / `rxdb_mutations` 等）是 `SECURITY INVOKER`，RLS 只在部署方自己写了策略时才生效。[`remote-security-notice.ts`](../../../apps/dev-rxdb-supabase/src/app/remote-security-notice.ts) 在 demo 里向用户明示了这一点。
- 选择性同步的原语已经存在但**与身份无关**：[`SyncType.Filter`](../../../packages/rxdb/src/entity/sync-options.interface.ts) 的 `remote.filter` 是 `() => RuleGroup` 函数，[`pull-repository.ts`](../../../packages/rxdb-plugin-sync/src/pull-repository.ts) 每次拉取时求值——应用可以在闭包里读当前租户自己拼条件，但引擎不从 `RxDBContext` 派生它。这条通道今天只有一处落地：Supabase 的 [`pullChanges`](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts) 把 `filter` 送进 `rxdb_pull_changes` RPC，且要求恰好一个仓库范围；批量拉取 [`pull-batch.ts`](../../../packages/rxdb-plugin-sync/src/pull-batch.ts) 跳过 `filter` 型仓库，`PullBatchRequest` 没有 filter 槽；HTTP 适配器的 `pullChanges` 恒抛 `HttpChangelogUnsupportedError`。
- Supabase 适配器已经在提示使用者服务端侧必须自己配 RLS（`RxDBAdapterSupabase` 中「`RLS is disabled for tables: …` Fix the policies before exposing this adapter to untrusted clients.」），说明「本地引擎 + 服务端权威」的分工是既定方向，但引擎侧缺配套的**数据锚点字段、权限上下文与派生原语**。
- [US-027 实体操作权限模型](US-027-entity-permission-model.md) 已把执行者轴建模为 `user / system` 二元；本故事是把该轴扩展到**角色 / 所有权 / 租户**的后续，且 US-027 的 Out of Scope 明确指向「多用户 / 角色 / 工作区成员权限（vision 阶段 3）」。
- [vision.md](../../vision.md) 阶段 3 规划「用户身份、设备身份、工作区成员和权限模型」「按租户同步」——没有租户字段，「按租户同步」就没有数据锚点。

### 行业调研结论

本地优先架构下授权有三条路线：信任客户端（安全剧场，无效）；按权限组加密（密钥管理复杂、吊销弱）；**部分复制 + 服务端策略求值**（生产工具的主流选择，Zero / ElectricSQL / PowerSync 均为此形态）。调研来源与要点：

- EpicenterHQ《Conflict Resolution Gets All the Attention. It's the Least of Your Problems.》：permissions、schema migration、部分复制才是本地优先的**真正生产阻塞项**；每家有产量的工具都选择服务端决定「把什么同步给谁」。
- Pylon 的 [Policies](https://docs.pylonsync.com/concepts/policies) 与 [owner stamping](https://docs.pylonsync.com/plugins/data#owner_stamp)：行级策略表达式（`allowRead/Insert/Update/Delete` + `auth.*` 绑定 + `auth.hasRole()`）；`owner` 由服务端从会话戳记、拒绝客户端改 owner，客户端乐观写时预填自己的 ID 以即时渲染；实体带 `tenantId` 字段即可自动开启行级隔离。
- ZarishLog（PostgreSQL RLS + `app.current_org_id` 会话变量 + Keycloak RBAC）与 Aequora（服务端权威、`AuthContext` 携带 actor/tenant/device）佐证：**租户列 + 服务端会话求值是行业标准形态**。

以上均为外部资料结论（**推断**，非本仓源码实证）；本仓源码实证的结论只有「背景与动机」前五条。

## 权限模型设计

### 字段层：`EntityBase` 新增两个可空基础字段（预留）

在 [`ENTITY_BASE_METADATA_OPTIONS`](../../../packages/rxdb/src/entity/entity-base.ts) 中与 `createdBy` / `updatedBy` 同级新增：

| 字段       | 类型             | 语义                                      | 与现有字段的分工                                                                         |
| ---------- | ---------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| `ownerId`  | string, nullable | 行所有权锚点（授权用）                    | `createdBy` 是审计历史（谁创建，不可变）；`ownerId` 是授权锚点（**可转让**，权威端裁决） |
| `tenantId` | string, nullable | 租户 / 工作区隔离锚点（同步与行级过滤用） | 全新概念；`userId` 只描述「是谁」，`tenantId` 描述「属于哪个租户」                       |

命名决定（可协商，理由锁定）：用 `tenantId` 而非 `groupId` / `workspaceId`——`workspace` 命名已被草稿恢复插件占用（[US-501 Workspace 插件](../plugin/US-501-workspace-plugin.md) 的 `WorkspaceCacheId` 语义完全不同，复用会造成概念污染）；`groupId` 易与用户组 / 角色组混淆；`tenant` 是行业通用词（Pylon `tenantId`、ZarishLog `org_id`、Aequora `tenant_id`）。

关键语义：两字段**预留但默认无行为**——不声明就不参与同步过滤、不参与权限判定，单用户应用零变化（与 US-027「默认 `both` = 现状」的向后兼容原则一致）。行为由实体配置显式开启（见判定层），**不采用** Pylon「字段存在即自动隔离」的隐式约定：通用引擎里隐式行为会让存量应用加个字段就静默改变同步语义。

### 上下文层：扩展 `RxDBContext`

在 [`RxDBContext`](../../../packages/rxdb/src/rxdb.interface.ts) 增加 `tenantId?: string` 与 `roles?: string[]`（`userId` 已有），供注入审计字段与权限判定。

### 判定层：US-027 的执行者轴扩展

US-027 的 `EntityOperationPermission = 'user' | 'system' | 'both' | 'none'` 扩展为**可携带谓词**，四值字符串保留为简写（等价无约束谓词，向后兼容）：

```ts
interface EntityPermissionRule {
  actors?: ('user' | 'system')[]; // 缺省 = 全部
  roles?: string[]; // 当前上下文 roles 满足任一即可
  ownerOnly?: boolean; // 仅 ownerId === context.userId 放行
}
type EntityOperationPermission = 'user' | 'system' | 'both' | 'none' | EntityPermissionRule;
```

fail-closed 延续 US-027：未满足谓词一律按拒处理，不设放行兜底。`ownerOnly` 判定依据 `ownerId`，**不依据 `createdBy`**。

### 同步层：部分复制与权威端裁决的配合点

- **pull 过滤**：声明租户隔离的实体在拉取时由引擎按权限上下文生成含 `tenantId` 等值条件的过滤，走现有 [`pullChanges`](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts) 的 `filter` 通道（不改 `RuleGroup` 形状，注入的是**求值后的值**，不是新语法）。这类实体必须走逐仓库拉取：批量路径没有 filter 槽（见背景第四条），落点见技术笔记。
- **push 裁决**：权威端以会话为准校验行归属与租户（Supabase 由 RLS 完成，拒绝经现有 `SupabaseDataError`「远端拒绝（RLS / 约束 / 语法等）」通道回传）；引擎职责是**不吞、可观测**——远端拒绝的写不能留在「已同步」假象里。
- 客户端侧过滤与判定只做 **UX**（少拉数据、界面只读），**安全边界在权威端**——本仓引擎不实现服务端策略引擎。

### UI 层：角色感知的能力派生

rxdb-model 的能力派生从「实体级三元组」扩展到**行级**：`ownerOnly` 或角色谓词不满的行挂只读（复用 US-027 阶段 C 的 `_readonly` 行守卫路径）。三框架对称（铁律）。

## 范围边界

### In Scope

- `ownerId` / `tenantId` 两字段的预留与注入（构造期预填约定、适配器注入点、生成器与 API 基线回归）
- 存量库的补列迁移（方案见技术笔记「阶段 A 的迁移负担」）
- `RxDBContext` 的 `tenantId` / `roles` 扩展
- `EntityOperationPermission` 谓词扩展与 metadata-validate 校验
- 权限上下文 → pull 过滤条件生成的客户端原语；远端拒绝的可观测契约
- rxdb-model 行级只读派生（Angular / React / Vue 三端）

### Out of Scope

- 服务端策略引擎本身：Supabase RLS SQL 策略、Zanzibar 式关系图、Keycloak 式 RBAC 中间件——引擎只提供配合点与契约
- 按权限组加密的替代路线（本地优先无服务端访问控制；本仓 [`@aiao/rxdb-adapter-encrypted`](../../../packages/rxdb-adapter-encrypted/README.md) 是字段级静态加密，非访问控制）
- 设备身份、会话生命周期与登入登出协议（应用层关注）
- 权限审计日志、审计 UI
- `ownerId` 转让的完整产品流程（本故事只保证「转让是可被权限判定的写操作」，转让 UI 与审批流不在内）

## 验收标准

| #   | 前置条件                                               | 操作                                         | 预期结果                                                                                          | 状态 |
| --- | ------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---- |
| 1   | 实体未声明任何租户 / 角色配置；新库或已补列的存量库    | 任意读写与同步                               | `ownerId` / `tenantId` 两列存在于表结构（nullable），行为与现状零变化，现有测试不回归             | ⬜   |
| 2   | 实体声明租户隔离，`rxdb.context.tenantId` 已设置       | create                                       | `tenantId` 由引擎 / 适配器从上下文注入，写入成功                                                  | ⬜   |
| 3   | 同上，但 `context.tenantId` 未设置                     | create                                       | 配置期或写入期报错（fail-closed），不产生 `tenantId` 为空的孤立行                                 | ⬜   |
| 4   | create 时按构造期预填约定把 `ownerId` 填成 `userId`    | 本地渲染后 push                              | 本地立即渲染；权威端对 `ownerId` 的戳记与校验属服务端策略（Out of Scope），其拒绝按 AC#11 可观测  | ⬜   |
| 5   | `rxdb.context.roles` 未设置                            | 一切权限判定                                 | 退化为 US-027 的 user / system 二元语义，行为与该故事一致                                         | ⬜   |
| 6   | 实体 `update: { actors: ['user'], roles: ['editor'] }` | 带 `editor` 角色的用户 update                | 放行；不带该角色的用户被拒并抛 `PermissionDeniedError`（US-027 阶段 B 的错误类型）                 | ⬜   |
| 7   | 实体 `update: { actors: ['user'], ownerOnly: true }`   | 行 `ownerId` 等于当前 `userId` 的用户 update | 放行；非 owner 被拒                                                                               | ⬜   |
| 8   | 实体 `update: 'user'`（简写）                          | update                                       | 等价 `{ actors: ['user'] }`，与 US-027 定义的语义完全一致                                         | ⬜   |
| 9   | `permissions` 含未知角色名或非法谓词结构               | 实体定义校验（metadata-validate）            | 配置期报错，指出实体名与非法值                                                                    | ⬜   |
| 10  | 实体声明租户隔离                                       | pull                                         | 引擎按上下文生成含 `tenantId` 等值条件的过滤并经 `pullChanges` 的 `filter` 通道执行，只拉本租户行 | ⬜   |
| 11  | 权威端拒绝一次 push（RLS / 越权）                      | 观察 sync 状态                               | 拒绝可观测（错误回传、行不进入已同步状态），不静默吞掉                                            | ⬜   |
| 12  | 运行时切换 `rxdb.context`（换角色 / 换租户）           | 重新判定与重新拉取                           | 判定原语与 UI 派生随新上下文刷新，不需要重启 RxDB                                                 | ⬜   |
| 13  | `ownerOnly` 实体列表                                   | 三端 demo 打开                               | 非 owner 行只读、编辑入口隐藏；Angular / React / Vue 行为一致（e2e 覆盖）                         | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 交付阶段

| 阶段 | 交付                                                                                                    | AC 区段   | 状态 |
| ---- | ------------------------------------------------------------------------------------------------------- | --------- | ---- |
| A    | 字段预留与注入：`EntityBase` 两字段、注入点、生成器 / 基线回归                                          | AC#1～4   | ⬜   |
| B    | 上下文与判定原语：`RxDBContext` 扩展、谓词判定、metadata-validate（依赖 US-027 阶段 A/B 的 actor 判定） | AC#5～9   | ⬜   |
| C    | 同步配合点：pull 过滤生成原语、远端拒绝契约与适配器落点                                                 | AC#10～11 | ⬜   |
| D    | 三框架行级 UI 派生                                                                                      | AC#12～13 | ⬜   |

阶段 A 独立可交付；B 依赖 US-027 的判定原语；C 依赖 A/B；D 依赖 B。一阶段一 PR，每阶段独立更新 AC 状态与 API 基线。

## 技术笔记

**关键设计决策**（已锁定）：

- **`ownerId` ≠ `createdBy` 分工**：审计与授权分离。`createdBy` 是历史事实（创建后不变，客户端可伪造因此只能作展示）；`ownerId` 是授权锚点（权威端戳记、可转让、判定依据）。转让场景下 `createdBy` 保持不变。
- **预留但不隐式生效**：字段进 `EntityBase` 是为避免「未来再加字段 = 全员迁移表结构」；行为显式开启是为避免存量应用静默改变同步语义。两个目标缺一不可。
- **客户端判定只做 UX**：本地库在用户机器上，任何客户端侧判定都可被绕过；真正的强制点只有权威端（部分复制决定「看到什么」、push 裁决决定「改得了什么」）。引擎侧所有「拒」都是快速反馈，不是安全边界。
- **不改 `RuleGroup` 语法**：pull 过滤注入的是按上下文求值后的具体值，`RuleGroup` 保持静态 where 语义，避免在客户端侧引入可被篡改的「策略求值器」。
- **向后兼容**：不声明 = 零变化；简写权限值 = US-027 语义；`RxDBContext` 新字段全可选。
- **服务端戳记不在本故事**：AC#4 只验客户端半边。参考 SQL 若要自带 `ownerId` 戳记触发器或 RLS 策略，属于改 Out of Scope，不是实现细节。

**AC#10 的落点**（源码约束，plan 阶段二选一）：租户过滤只能走逐仓库拉取。要么声明租户隔离即强制 `SyncType.Filter`，
要么给 `PullBatchRequest` 加 filter 槽、让批量路径也带条件。没有 `filter` 通道的适配器（HTTP 的 `pullChanges` 恒抛）
必须在配置期显式报错，不能回落为全量拉取——那等于把别的租户的行拉进本地。

**阶段 A 的迁移负担**：[`RxDB.#ensureEntityTables`](../../../packages/rxdb/src/RxDB.ts) 对既有库只按表补建（`isTableExisted`），不补列；
两个方言的 `CREATE TABLE` 都不做列比对；[`runMigrations`](../../../packages/rxdb/src/system/migration-runner.ts) 只跑使用方提供的 `MigrationType[]`。
所以 `ENTITY_BASE_METADATA_OPTIONS` 加两列后，存量库里每张继承 `EntityBase` 的业务表都缺这两列（核心与 working-tree 的系统表不继承它，不受影响）。
**推断**（未实测）：生成的 INSERT / SELECT 若按元数据列举列名，缺列会直接报错，AC#1 的「零变化」只对新库成立；
远端部署方的 DDL（如 [`03-business-tables.sql`](../../../docker/sql/03-business-tables.sql)）同样要补列，否则 push 带上新键即失败。
补列由引擎自带一条迁移还是交给使用方逐表写，plan 阶段在六个本地后端上实测后再定。

## 实现文件

| 阶段 | 文件                                                                                         | 改动                                                             |
| ---- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| A    | `packages/rxdb/src/entity/entity-base.ts`                                                    | `ENTITY_BASE_METADATA_OPTIONS` 新增 `ownerId` / `tenantId`       |
| A    | `packages/rxdb/src/entity/entity.utils.ts` 与各 adapter 注入点                               | `tenantId` / `ownerId` 注入与预填约定                            |
| A    | `packages/rxdb/src/RxDB.ts`、`packages/rxdb/src/system/`                                     | 存量库补列迁移（若由引擎自带）                                   |
| B    | `packages/rxdb/src/entity/entity-options.interface.ts`                                       | 租户 / 所有权声明与 `EntityPermissionRule` 类型及 TSDoc          |
| B    | `packages/rxdb/src/entity/metadata-validate.ts`                                              | 谓词与声明校验                                                   |
| B    | `packages/rxdb/src/rxdb.interface.ts`                                                        | `RxDBContext` 扩展 `tenantId` / `roles`                          |
| C    | `packages/rxdb-plugin-sync/src/pull-repository.ts`、`pull-batch.ts`                          | 权限上下文 → pull 过滤条件生成原语与拉取路径落点                 |
| C    | `packages/rxdb-adapter-supabase/`、`packages/rxdb-adapter-http/`                             | 过滤通道落地与缺席时的配置期报错；远端拒绝的可观测契约           |
| D    | `packages/rxdb-model/src/entity-table/columns/`                                              | 行级只读派生（框架无关部分）                                     |
| D    | `packages/rxdb-model-{angular,react,vue}/src/entity-list/`、`entity-detail/`                 | 行级只读派生（三端）                                             |
| D    | `apps/dev-rxdb-{angular,react,vue}-e2e/`                                                     | 多角色 / 多租户场景 e2e                                          |

## References

- [vision.md](../../vision.md) — 阶段 3「用户身份、设备身份、工作区成员和权限模型」「按租户同步」
- [US-027 实体操作权限模型](US-027-entity-permission-model.md) — 执行者轴扩展的基线
- [US-501 Workspace 插件](../plugin/US-501-workspace-plugin.md) — `workspace` 命名占用的依据
- [`ENTITY_BASE_METADATA_OPTIONS`](../../../packages/rxdb/src/entity/entity-base.ts) — 现有审计字段预留方式
- [`RxDBContext`](../../../packages/rxdb/src/rxdb.interface.ts) — 上下文现状与 TSDoc 承诺缺口
- [`applyAuditFields`](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.utils.ts) — createdBy 覆写风险注释
- [`pullChanges`](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts) — 行级过滤通道现状
- [EpicenterHQ — Conflict Resolution Gets All the Attention](https://github.com/EpicenterHQ/epicenter/blob/main/docs/articles/conflict-resolution-is-the-least-of-your-problems.md) — 权限是本地优先生产阻塞项；部分复制为主流路线
- [Pylon — Policies](https://docs.pylonsync.com/concepts/policies) — 行级策略表达式与 `auth.*` 绑定
- [Pylon — Data hygiene: owner stamping](https://docs.pylonsync.com/plugins/data#owner_stamp) — 服务端戳记 owner 模式
