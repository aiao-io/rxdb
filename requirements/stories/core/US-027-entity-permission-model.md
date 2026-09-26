---
id: US-027
title: 实体操作权限模型
status: Backlog
priority: Low
epic: epic-004-future-features
created: 2026-09-20
updated: 2026-09-26
tags: [core, permission, model, rxdb-model]
---

# 用户故事：实体操作权限模型

## 作为/我想要/以便

**作为** 模型开发者
**我想要** 在实体定义上声明「谁能创建 / 谁能更新 / 谁能删除」
**以便** 系统表（核心的 `RxDBChange` / `RxDBMigration` / `RxDBSync` / `RxDBBranch` 与插件贡献的系统表）在引擎写边界被强制保护，前端（rxdb-model 的 Angular / React / Vue 绑定）自动呈现为只读或隐藏入口，而不是靠逐字段 readonly 与 UI 约定维系

## 背景与动机

- **系统表进了 demo 的实体目录，挡住写入的只有列表侧。** `SchemaManager.init()` 把 `rxdb.systemEntities` 并进
  `config.entities`：核心 4 张（`CORE_SYSTEM_ENTITIES`）加 working-tree 插件经 `createSystemContribution()` 贡献的 10 张，
  都在 `rxdb` 命名空间。三个 demo 的实体目录都从 `config.entities` 构建，于是目录里多出一个 `rxdb` 分组、14 张表。
  三框架 `EntityList` 用 `isSystemEntity()` 把系统表并进 `isCreateBlocked`（隐藏「+ 新增」）并给行挂 `_readonly`，
  `table-operations.ts` / `table-clipboard.ts` / `table-keyboard.ts` 的现成守卫随之挡住编辑、粘贴、拖拽与删除
  （三端 `entity-list.real.spec` 的「系统表整表只读」用例）；代价是 `actionsColumn()` 对 `_readonly` 行连「查看」一起藏掉。
  这是 AC#16 列表侧的提前交付；详情视图没有单独处理，三端 e2e 未做。
  引擎一侧没有守卫：`isSystemEntity()` 的消费方（sync 监听、working-tree 捕获、HTTP 适配器、三框架 `EntityList`）
  都拿它做**排除**或 UI 只读，没有一条写路径拿它拒绝。经 `Repository` / `EntityManager` 的程序化写照样能新建
  `RxDBBranch` 行（绕过分支 API）、删掉 undo/redo 读取的 `RxDBChange` 行、改写撤销标记。
- **字段级 `readonly` 只管「更新时不改写」。** `normalizeUpdateEntity()` 在更新侧静默剔除 readonly 键，
  sqlite-core / pglite 的 `update_sql.ts`、`SupabaseRepository` 与两份 `switch-result.utils.ts` 都走它；插入不过滤。
  它不拒绝、不报错，拦不住新建与删除；`property-types.interface.ts` 的 TSDoc 与这个行为一致。
  系统表靠逐字段标记维持只读（`RxDBChange` 标了 10 个字段），漏标新字段即裸奔。
- **系统写覆盖系统表的全部三种操作，且都不经 EntityManager。** `RxDBChange` 行由各实体表的 SQL AFTER 触发器写入；
  undo/redo 经 `adapter.switchBranch()` 改写 `revertChangeId` / `revertChangedAt`（`applyUndoRedoHistories()`）；
  sync 推送回写 `remoteId`（`push-repository.ts`）；`remove_branch()` 在 `adapter.transaction()` 的执行器里
  删掉该分支的 `RxDBChange` 行与分支行。所以 `RxDBChange` 的矩阵不能含 `update: 'none'` 或 `delete: 'none'`，
  那会打断 undo/redo、sync 与删分支。
- **用户写的公开入口不止 EntityManager 一条。** 公开的 `Repository.create()` / `update()` / `remove()` 直接交给主适配器的仓库，
  不经 EntityManager；`EntityManager.create()` / `update()` / `remove()` / `save()` / `saveMany()` / `removeMany()`
  与实体实例的 `save()` / `remove()` 经 EntityManager；`EntityManager.mutations()` 直达 `adapter.mutations()`，
  rxdb-model 三端列表的批量保存走的就是这条。用户写与系统写在适配器层汇合，
  受信写通道也在这一层挂作用域（`declareTrustedWrite(adapter, …)`）。
- **受信写通道是「系统写」身份自报的底子，但只服务捕获层。** `packages/rxdb/src/trusted-write/`：fail-closed、
  作用域对象 + WeakMap、取用即清除；`TRUSTED_CALLSITE_REGISTRY` 登记 11 个调用点（history 6 / sync 3 / working-tree 2），
  `WRITE_ENTRANCES` 定义 11 种写入口身份。它不参与任何权限判定，migration 写也不在登记表里。
- vision 阶段 4「模型驱动应用」已规划「字段级权限、只读规则、条件显示和统一校验」，本故事是其中「实体级操作权限」的增量切片。

## 权限矩阵

每个实体可对三个操作各声明一个执行者权限：

```ts
/** 操作执行者权限：user 仅用户 / system 仅系统 / both 均可（默认） / none 均不可 */
type EntityOperationPermission = 'user' | 'system' | 'both' | 'none';

interface EntityPermissionOptions {
  create?: EntityOperationPermission; // 默认 'both'
  update?: EntityOperationPermission; // 默认 'both'
  delete?: EntityOperationPermission; // 默认 'both'
}

@Entity({
  name: 'AuditLog',
  permissions: {
    create: 'system', // 只能系统创建：用户 UI 无「新增」，用户写被拒
    update: 'none',   // 创建后不可变：用户与系统都无法再改（audit 语义）
    delete: 'none'    // 不可删除
  }
})
```

「用户」= 未声明系统写作用域的一切写（UI 操作、应用代码、插件代码）；
「系统」= 系统写作用域内的引擎内部写（sync 回写、migration、工作树物化、历史回放、分支维护）。
系统表的矩阵要从各自真实的系统写路径推出来（见背景第 3 条），不能按「系统表 = 不可变」一刀切。

| 业务诉求               | 配置                           | 效果                                                            |
| ---------------------- | ------------------------------ | --------------------------------------------------------------- |
| 哪些用户能改           | `update: 'user'` 或 `'both'`   | 用户写放行，UI 表格可编辑、详情弹窗 edit 模式                   |
| 哪些只能系统改         | `update: 'system'`             | 用户写被拒，UI 只读（view 模式）；sync / migration 等系统写放行 |
| 哪些创建后系统也无法改 | `update: 'none'`               | 不可变：用户与系统的 update 一律被拒                            |
| 哪些只能系统创建       | `create: 'system'`             | 用户 create 被拒，UI 隐藏「新增」                               |
| 哪些用户可以创建       | `create: 'user'` 或 `'both'`   | UI 显示「新增」，创建成功                                       |
| 哪些不可删除           | `delete: 'none'` 或 `'system'` | 对应用户/系统删除被拒，UI 隐藏「删除」                          |

## 交付阶段

| 阶段 | 交付                                                                                                     | 直接前置 | AC 区段   | 状态 |
| ---- | -------------------------------------------------------------------------------------------------------- | -------- | --------- | ---- |
| A    | 元数据与判定原语：`permissions` 配置与默认三元组、metadata-validate 校验、判定原语、14 张系统表的矩阵    | 无       | AC#1～4   | ⬜   |
| B    | 写边界强制：系统写作用域原语、背景第 4 条列出的每个公开写入口在写前判定、`PermissionDeniedError`         | 阶段 A   | AC#5～11  | ⬜   |
| C    | 三框架 UI 派生：rxdb-model 与 Angular / React / Vue 绑定的按钮显隐、单元格与表单只读、弹窗模式；三端 e2e | 阶段 A   | AC#12～16 | ⬜   |

AC#1（未配置 `permissions` 的实体零变化）每个阶段都要守住。B 与 C 都只依赖 A，可以并行。

AC#16 的列表侧已提前交付：三框架 `EntityList` 按 `isSystemEntity()` 隐藏「+ 新增」并给行挂 `_readonly`，
阶段 C 再把这个判断换成权限派生。

## 范围边界

### In Scope

- 实体级 `create / update / delete` 三操作 × `user / system` 两执行者的权限配置与判定原语
- 系统表的实体级矩阵：核心 4 张与插件贡献的系统表（今天只有 working-tree 贡献的 10 张）
- 写边界强制：背景第 4 条列出的每个公开写入口在 create、update、remove 前判定
- 系统写作用域原语（复用受信写通道的作用域模式），fail-closed：未声明一律按用户计
- 权限配置的 metadata-validate 校验与 TSDoc
- rxdb-model 与 Angular / React / Vue 三个绑定的 UI 能力派生（按钮显隐、单元格/表单只读、弹窗模式）

### Out of Scope

- 多用户 / 角色 / 租户权限（→ [US-029](US-029-rbac-tenant-permission-design.md)；vision 阶段 3「用户身份、设备身份、工作区成员和权限模型」）
- 字段级权限模型扩展与条件显示（阶段 4 剩余部分；字段级 readonly 保持现有语义，不在本故事升级为拒绝）
- 远程 / 服务端授权（remote adapter 的服务端侧权限）
- 权限审计日志
- 原始 SQL 写（适配器的 `rawQuery()`、事务执行器里的 SQL）与 SQL 触发器写：判定依赖实体元数据，SQL 文本里没有它。
  这个缺口在 `permissions` 的 TSDoc 里显式声明，不假装拦得住

## 验收标准

| #   | 前置条件                                         | 操作                                                                                                                              | 预期结果                                                                                                 | 状态 |
| --- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 实体未配置 `permissions`                         | 用户与系统执行 create / update / delete；三框架 UI 打开其列表                                                                     | 全部放行，写入与 UI 行为与现状一致（现有测试不回归）                                                     | ⬜   |
| 2   | `permissions` 含非法枚举值                       | 实体定义校验（metadata-validate）                                                                                                 | 配置期报错，指出实体名与非法值                                                                           | ⬜   |
| 3   | 判定原语                                         | 对 4 权限值 × 2 执行者 × 3 操作逐格断言                                                                                           | 与权限矩阵一致；`none` 对系统同样拒绝                                                                    | ⬜   |
| 4   | `rxdb.systemEntities` 里的全部系统表             | 读取各自运行期元数据                                                                                                              | 都带 `permissions`；矩阵与背景第 3 条的真实系统写路径一致（如 `RxDBChange` 的 update / delete 放行系统） | ⬜   |
| 5   | 实体 `create: 'system'`                          | 用户经任一公开写入口（`Repository.create()` / `EntityManager.create()` / `EntityManager.mutations()` / 实体 `save()`）执行 create | 被拒并抛 `PermissionDeniedError`（`RxDBError` 子类，带实体名、操作与执行者），库里没有新行               | ⬜   |
| 6   | 同上                                             | 系统写作用域内执行 create                                                                                                         | 创建成功                                                                                                 | ⬜   |
| 7   | 实体 `update: 'system'`                          | 用户经任一公开写入口执行 update                                                                                                   | 被拒并抛 `PermissionDeniedError`                                                                         | ⬜   |
| 8   | 同上                                             | 系统写（sync 回写 / migration / 工作树物化 / 历史回放）执行 update                                                                | 更新成功                                                                                                 | ⬜   |
| 9   | 实体 `update: 'none'`                            | 用户或系统执行 update                                                                                                             | 一律被拒（创建后不可变，audit 语义）                                                                     | ⬜   |
| 10  | 实体 `delete: 'none'` 或 `'system'`              | 用户执行 delete                                                                                                                   | 被拒并抛 `PermissionDeniedError`                                                                         | ⬜   |
| 11  | 插件 / 内部代码未声明系统写作用域                | 对 `update: 'system'` 实体执行写                                                                                                  | 按用户计并被拒（fail-closed）                                                                            | ⬜   |
| 12  | 实体 `create: 'system'` 与 `create: 'user'` 各一 | 三框架 UI 打开两者的列表                                                                                                          | 前者不显示「+ 新增」；后者显示，且创建成功                                                               | ⬜   |
| 13  | 实体 `update: 'system'`                          | 三框架 UI 编辑                                                                                                                    | 表格单元格只读、行挂 `_readonly`、详情弹窗为 view 模式、表单字段全部只读                                 | ⬜   |
| 14  | 实体 `delete: 'none'` 或 `'system'`              | 三框架 UI 打开列表                                                                                                                | 操作列只留「查看」，不显示「删除」                                                                       | ⬜   |
| 15  | 可编辑实体内某字段 `readonly: true`              | 三框架 UI 编辑该实体                                                                                                              | 字段级只读继续生效，实体级权限不覆盖字段级配置                                                           | ⬜   |
| 16  | 三个 dev app 的 `rxdb` 分组                      | 打开任一系统表的列表与详情                                                                                                        | 无新增 / 删除入口、不可编辑；三端 e2e 覆盖                                                               | ⚠️   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

AC#16 的保留：列表侧已交付，三端单测覆盖（背景第 1 条）；详情视图与三端 e2e 未做。

## 技术笔记

**关键设计决策**：

- **actor 归属**：默认用户；系统写作用域内为系统。受信写登记表（11 个调用点）专守捕获层豁免，
  权限判定另起一个系统写作用域，两者并存（前者继续守批量重写，后者守权限），不合并。
  归类可以沿用 `WRITE_ENTRANCES` 的入口词表：`crud` 与 `unknown` 计为用户，登记在册的受信入口计为系统；
  migration 写今天不在登记表里，要补。映射表在 plan 阶段定（**建议**，未验证）。
- **判定点落在哪一层**由 plan 决定。约束是背景第 4 条的公开入口一条都不能漏——漏一条就是 fail-open；
  用户写与系统写在适配器层汇合，判定点越往上，要逐个接线的入口越多。
- **`none` 优先于一切**：`update: 'none'` 对系统写同样拒绝，防呆靠单测矩阵（AC#3）而非文档。
  它只在经过判定点的写入口上成立；原始 SQL 与触发器写不经过（见 Out of Scope），TSDoc 必须写明，
  不能让调用方把「没报错」当成「拦住了」。
- **错误形状**：`PermissionDeniedError extends RxDBError`，带实体名、操作与执行者。`RxDBError` 只有 `message`，
  本仓按错误类型区分失败原因（如 `InvalidBranchIdError`），没有错误码体系。US-029 AC#6 沿用这个类型。
- **插件系统表的矩阵来源**：贡献方在各自的 `@Entity` 上声明，或对 `isSystemEntity()` 命中的表给一份默认矩阵，plan 决定。
  约束是贡献方加一张表时不会因漏声明而裸奔——这正是逐字段 readonly 今天的问题（背景第 2 条）。
- **UI 派生**：从元数据派生 UI 能力（如 `deriveUiCapabilities(metadata) → { canCreate, canEdit, canDelete }`）。
  `canCreate=false` 并进三端 `EntityList` 的 `isCreateBlocked`；`canEdit=false` 给行挂 `_readonly`，
  激活 `table-operations.ts` / `table-clipboard.ts` / `table-keyboard.ts` 现成的拖拽、粘贴、键盘守卫，详情弹窗走 `formMode: 'view'`。
  `actionsColumn()` 对 `_readonly` 行把「查看」与「删除」一起藏掉，AC#14 要把两者的判断拆开；但三端 `openViewDialog`
  今天固定用 `buildFormFields(meta, 'edit')` + `formMode: 'edit'` 打开可保存的详情，拆开判断必须与 AC#13 的 view 态
  同一 PR 交付，否则只读行的「查看」就是一条写入口。关系 Tab 内嵌列表同路径派生。
- **与字段级 readonly 的分工**：实体级权限是「门」（能不能动这个实体的写路径），字段级 readonly 是「栅」
  （可编辑实体内哪些字段更新时不改写）。本故事不改字段级 readonly 的语义。
- **向后兼容**：默认 `both` 三元组 = 现状，未配置实体的所有写路径与 UI 行为零变化。

## 价值待证

本故事**价值待证**。用户踩得到的系统表写入口只有 demo 的实体目录，三框架 `EntityList` 已对系统表整表只读
（背景第 1 条），不需要本故事的任何抽象；代价是「查看」也被藏掉（见技术笔记「UI 派生」）。
剩下的是程序化写系统表的潜在风险。

本故事要新增的抽象至少 4 个：`permissions` 配置与判定原语、系统写作用域与 actor 归类、`PermissionDeniedError`、
UI 能力派生。病灶数 < 抽象数，`priority` 因此为 Low。

它的主要价值在下游：[US-029](US-029-rbac-tenant-permission-design.md) 阶段 B 依赖本故事阶段 A / B 的判定原语与错误类型。
**解锁条件**（满足其一）：出现需要声明实体级权限的业务实体；或 US-029 立项，届时一并上调优先级。

## 实现文件

| 阶段 | 文件                                                                                                                                                               | 说明                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| A    | `packages/rxdb/src/entity/entity-options.interface.ts`                                                                                                             | `EntityMetadataOptions.permissions` 配置类型与 TSDoc             |
| A    | `packages/rxdb/src/entity/metadata-transition.ts`                                                                                                                  | `transitionMetadata()` 把配置带进运行期元数据，填默认三元组      |
| A    | `packages/rxdb/src/entity/metadata-validate.ts`                                                                                                                    | 枚举值校验                                                       |
| A    | `packages/rxdb/src/system/{change,migration,branch,sync}.ts`                                                                                                       | 核心 4 张系统表的矩阵                                            |
| A    | `packages/rxdb-plugin-working-tree/src/commit/*.entity.ts`、`packages/rxdb-plugin-working-tree/src/working-tree/*.entity.ts`（或 `system-entities.ts` 的默认矩阵） | 插件贡献的 10 张系统表的矩阵                                     |
| B    | `packages/rxdb/src/repository/Repository.ts`、`packages/rxdb/src/entity/entity-manager.ts`、`packages/rxdb/src/rxdb-adapter.ts`                                    | 公开写入口判定（落点由 plan 定）                                 |
| B    | `packages/rxdb/src/trusted-write/`                                                                                                                                 | 系统写作用域原语（或独立新模块）；`write-entrance.ts` 的入口词表 |
| B    | `packages/rxdb/src/RxDBError.ts` 或新文件                                                                                                                          | `PermissionDeniedError`                                          |
| C    | `packages/rxdb-model/src/entity-form/form-fields.ts`、`packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts`                                     | UI 能力派生                                                      |
| C    | `packages/rxdb-model/src/entity-table/columns/column-utils.ts`                                                                                                     | `actionsColumn()` 拆开「查看」与「删除」的判断                   |
| C    | `packages/rxdb-model-angular/src/entity-list/`、`packages/rxdb-model-react/src/entity-list/`、`packages/rxdb-model-vue/src/entity-list/`                           | 「+ 新增」显隐、行 `_readonly`，三端同交                         |
| C    | `packages/rxdb-model-angular/src/entity-detail/`、`packages/rxdb-model-react/src/entity-detail/`、`packages/rxdb-model-vue/src/entity-detail/`                     | 详情弹窗模式，三端同交                                           |
| C    | `apps/dev-rxdb-angular-e2e/src/entity-model.spec.ts`、`apps/dev-rxdb-react-e2e/src/entity-model.spec.ts`、`apps/dev-rxdb-vue-e2e/src/entity-model.spec.ts`         | 权限场景 e2e                                                     |

## References

- [vision.md](../../vision.md) — 阶段 4「字段级权限、只读规则、条件显示和统一校验」
- [受信写通道](../../../packages/rxdb/src/trusted-write/index.ts) — `declareTrustedWrite` fail-closed 通道与作用域模式
- [写入口词表](../../../packages/rxdb/src/trusted-write/write-entrance.ts) — `WRITE_ENTRANCES` 的 11 种写入口身份
- [受信调用点登记表](../../../packages/rxdb/src/__tests__/trusted-write/trusted-callsite-registry.spec.ts) — 11 个调用点与 US-025 抽包决策的核对记录（见其 `@remarks`）
- [系统表清单](../../../packages/rxdb/src/system/system-entities.ts) — `CORE_SYSTEM_ENTITIES` 与 `isSystemEntity()`
- [US-029 多用户 RBAC 权限与租户隔离](US-029-rbac-tenant-permission-design.md) — 下游：阶段 B 依赖本故事阶段 A / B
- [US-028 可排序实体](US-028-sortable-entity.md) — 同改三端 `EntityList` 与 `_readonly` 路径，互不依赖
