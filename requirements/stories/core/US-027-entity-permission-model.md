---
id: US-027
title: 实体操作权限模型
status: Backlog
priority: High
epic: epic-004-future-features
created: 2026-09-20
updated: 2026-09-20
tags: [core, permission, model, rxdb-model]
---

# 用户故事：实体操作权限模型

## 作为/我想要/以便

**作为** 模型开发者
**我想要** 在实体定义上声明「谁能创建 / 谁能更新 / 谁能删除」
**以便** 系统实体（Change / Migration / SyncState / Branch 等）在引擎写边界被强制保护，前端（rxdb-model）自动呈现为只读或隐藏入口，而不是靠逐字段 readonly 与 UI 约定维系

## 背景与动机

- 现有字段级 `readonly` 的事实语义是「前端不可编辑」：数据层（repository / entity-manager / capture / schema）完全不消费它，只有 rxdb-model 表单与表格在用；但其 TSDoc 却写着「更新数据时这个列的值不会被更新」——文档与实现不符。
- 系统实体靠逐字段标记 readonly 维持只读（如 `system/change.ts` 标了 10 个字段），漏标新字段即裸奔，且「只读」止于 UI：程序化写随时可以改掉 Change 记录。
- 引擎已存在「受信写通道」（`packages/rxdb/src/trusted-write/`）：fail-closed、作用域对象 + WeakMap、取用即清除、9 调用点登记表。它是「系统写」身份自报的底子，但只为捕获层豁免服务，不参与任何权限判定。
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
  name: 'Change',
  permissions: {
    create: 'system', // 只能系统创建：用户 UI 无「新建」，用户写被拒
    update: 'none',   // 创建后不可变：用户与系统都无法再改（audit 语义）
    delete: 'none'    // 不可删除
  }
})
```

「用户」= 未声明受信写作用域的一切写（UI 操作、应用代码、插件代码）；「系统」= 受信写作用域内的引擎内部写（sync 回写、migration、工作树物化、捕获层批量重写）。

| 业务诉求               | 配置                           | 效果                                                            |
| ---------------------- | ------------------------------ | --------------------------------------------------------------- |
| 哪些用户能改           | `update: 'user'` 或 `'both'`   | 用户写放行，UI 表格可编辑、详情弹窗 edit 模式                   |
| 哪些只能系统改         | `update: 'system'`             | 用户写被拒，UI 只读（view 模式）；sync / migration 等系统写放行 |
| 哪些创建后系统也无法改 | `update: 'none'`               | 不可变：用户与系统的 update 一律被拒                            |
| 哪些只能系统创建       | `create: 'system'`             | 用户 create 被拒，UI 隐藏「新建」                               |
| 哪些用户可以创建       | `create: 'user'` 或 `'both'`   | UI 显示「新建」，创建成功                                       |
| 哪些不可删除           | `delete: 'none'` 或 `'system'` | 对应用户/系统删除被拒，UI 隐藏「删除」                          |

## 范围边界

### In Scope

- 实体级 `create / update / delete` 三操作 × `user / system` 两执行者的权限配置与判定原语
- 引擎写边界强制：EntityManager / Repository / merge 入口在 create、update、remove 时校验权限
- 系统写作用域原语（复用受信写通道的作用域模式），fail-closed：未声明一律按用户计
- 权限配置的 metadata-validate 校验与 TSDoc
- rxdb-model 与 rxdb-model-angular 的 UI 能力派生（按钮显隐、单元格/表单只读、弹窗模式）
- 系统实体迁移：`system/{change,migration,branch,sync}.ts` 逐字段 readonly 收敛为实体级 permissions

### Out of Scope

- 多用户 / 角色 / 工作区成员权限（vision 阶段 3「用户身份、设备身份、工作区成员和权限模型」）
- 字段级权限模型扩展与条件显示（阶段 4 剩余部分；现有字段级 readonly 保持 UI 语义，不在本故事升级为数据层强制）
- 远程 / 服务端授权（remote adapter 的服务端侧权限）
- 权限审计日志
- rxdb-model 的 React / Vue 绑定（尚不存在；未来出现时按对称铁律补齐 UI 派生）

## 验收标准

| #   | 前置条件                                                         | 操作                                                     | 预期结果                                                     | 状态 |
| --- | ---------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------ | ---- |
| 1   | 实体未配置 `permissions`                                         | 用户与系统执行 create / update / delete                  | 全部放行，行为与现状一致（现有测试不回归）                   | ⬜   |
| 2   | 实体 `create: 'system'`                                          | 用户直接调用 EntityManager.create / 在 UI 打开该实体列表 | 写入被拒并抛 `PERMISSION_DENIED`；UI 不显示「新建」按钮      | ⬜   |
| 3   | 同上                                                             | 受信写作用域内的系统写执行 create                        | 创建成功                                                     | ⬜   |
| 4   | 实体 `update: 'system'`                                          | 用户执行 update                                          | 被拒；表格单元格只读、详情弹窗为 view 模式、表单字段全部只读 | ⬜   |
| 5   | 同上                                                             | 系统写（sync 回写 / migration / 工作树物化）执行 update  | 更新成功                                                     | ⬜   |
| 6   | 实体 `update: 'none'`                                            | 用户或系统执行 update                                    | 一律被拒（创建后不可变，audit 语义）                         | ⬜   |
| 7   | 实体 `create: 'user'`                                            | UI 打开该实体列表                                        | 显示「新建」按钮，创建成功                                   | ⬜   |
| 8   | 实体 `delete: 'none'` 或 `'system'`                              | 用户执行 delete                                          | 被拒；actions 列不显示「删除」按钮                           | ⬜   |
| 9   | 可编辑实体内某字段 `readonly: true`                              | 编辑该实体                                               | 字段级只读继续生效，实体级权限不覆盖字段级配置               | ⬜   |
| 10  | 插件 / 内部代码未声明受信写作用域                                | 其对 `update: 'system'` 实体执行写                       | 按用户计并被拒（fail-closed）                                | ⬜   |
| 11  | Change / Migration / SyncState / Branch 迁移为实体级 permissions | dev app 打开其列表与详情                                 | 无新建 / 删除入口、不可编辑，e2e 覆盖                        | ⬜   |
| 12  | `permissions` 含非法枚举值                                       | 实体定义校验（metadata-validate）                        | 配置期报错，指出实体名与非法值                               | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**交付阶段**（大故事分阶段，阶段间可独立交付）：

- **阶段 A：元数据与判定原语**。`EntityMetadataOptions.permissions` 配置 → 运行期 `EntityMetadata` 携带（默认 `both` 三元组）；判定原语如 `canCreate(actor, metadata)` / `canUpdate(actor, metadata)` / `canDelete(actor, metadata)`；`metadata-validate.ts` 增加枚举值校验；系统实体迁移（逐字段 readonly 收敛为实体级 permissions，具体矩阵按各实体语义定：如 Change 为 `system/none/none`，SyncState 为 `system/system/none`，Migration 为 `system/none/none`，Branch 待定——分支物化是系统写，但用户能否建分支涉及产品决策，迁移时逐实体确认）。
- **阶段 B：写边界强制**。新增系统写作用域原语（命名待定，如 `declareSystemWrite` / `runAsSystem`），模式复用 `trusted-write-scope.ts`（作用域对象 + WeakMap + 取用即清除）；EntityManager 的 `create / update / remove` 与 `merge_create / merge_update / merge_remove` 公共入口在写前判定 actor 与权限；新增 `PERMISSION_DENIED` 错误码（RxDBError 体系）；单测覆盖 4 权限值 × 2 执行者 × 3 操作的矩阵。
- **阶段 C：rxdb-model UI 派生**。从 metadata 派生 UI 能力（如 `deriveUiCapabilities(metadata) → { canCreate, canEdit, canDelete }`）：`canCreate=false` 隐藏「新建」；`canEdit=false` 表格全列只读、行记录挂 `_readonly`（激活现成键盘 / 剪贴板 / 拖拽守卫）、详情弹窗 `formMode: 'view'`；`canDelete=false` actions 列仅留「查看」。关系 Tab 内嵌列表同路径派生。

**关键设计决策**：

- **actor 归属**：默认用户；受信作用域内为系统。现有 9 调用点登记表是「捕获层豁免」专用，权限判定需要一个更通用的系统写作用域，两者并存（前者继续守批量重写，后者守权限），不合并。
- **`none` 优先于一切**：`update: 'none'` 对系统写同样拒绝——这是「创建后系统也无法改」的强制点，防呆靠单测矩阵而非文档。
- **与字段级 readonly 的分工**：实体级权限是「门」（能不能动这个实体的写路径），字段级 readonly 是「栅」（可编辑实体内哪些字段前端不可改）。本故事不把字段级 readonly 升级为数据层强制，也不改其 TSDoc 语义（语义正名另行处理，避免本故事膨胀）。
- **向后兼容**：默认 `both` 三元组 = 现状，未配置实体的所有写路径与 UI 行为零变化。

## 实现文件

- `packages/rxdb/src/entity/metadata-options.interface.ts` — `permissions` 配置类型与 TSDoc
- `packages/rxdb/src/entity/entity.decorator.ts` — options → metadata 携带
- `packages/rxdb/src/entity/metadata-validate.ts` — 枚举值校验
- `packages/rxdb/src/entity/entity-manager.ts` / `packages/rxdb/src/repository/` / merge 入口 — 写边界判定
- `packages/rxdb/src/trusted-write/` — 系统写作用域原语（或独立新模块）
- `packages/rxdb/src/system/{change,migration,branch,sync}.ts` — 实体级 permissions 迁移
- `packages/rxdb-model/src/entity-form/form-fields.ts`、`packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts` — UI 能力派生
- `packages/rxdb-model-angular/src/entity-list/entity-list.component.ts`、`entity-detail/entity-detail.ts` — 按钮显隐与弹窗模式
- `apps/dev-rxdb-angular-e2e/src/entity-model.spec.ts` — 权限场景 e2e

## References

- [vision.md](../../vision.md) — 阶段 4「字段级权限、只读规则、条件显示和统一校验」
- [受信写通道](../../../packages/rxdb/src/trusted-write/index.ts) — `declareTrustedWrite` fail-closed 通道与作用域模式
- [受信调用点登记表](../../../packages/rxdb/src/__tests__/trusted-write/trusted-callsite-registry.spec.ts) — 9 调用点登记表与 US-025 抽包决策的核对记录（见其 `@remarks`）
