# Data Model: 本地工作树与提交历史

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-09-12

本文件把 spec.md「Key Entities」的 **9 行逻辑契约**冻结成物理落地。spec.md 只说「必须持久化什么、按什么粒度隔离」；表名、字段、索引、约束、编解码与迁移版本在这里定死。**两者冲突以 spec.md 为准。**

> 旧 data-model.md 的缓存区表、依赖闭包边表、环检测状态、staged snapshot 与 `HEAD ↔ index` 相关结构**全部作废**，不在本文件中承接。

## 0. 既有基线（必须对齐，不是本特性新建的）

| 事实                   | 位置                                                                                    | 对本特性的约束                                                               |
| ---------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 系统表用装饰器实体声明 | `packages/rxdb/src/system/{branch,change,sync,migration}.ts`                            | 新表照此写：`namespace: 'rxdb'` + `tableName: 'rxdb_*'` + `log: false`       |
| 系统表清单只此一份     | `system-entities.ts:19` `SYSTEM_ENTITIES`（注释原文：「清单只此一份」）                 | 新表**必须**追加进去，顺序即建表顺序                                         |
| `isSystemEntity()`     | `system-entities.ts:53`                                                                 | 漏登记的代价不是编译错误，是新表被按库级 sync 配置送进它们从不参与的同步管道 |
| 系统表结构版本         | `migration.ts:22` `RXDB_SYSTEM_SCHEMA_VERSION = 3`                                      | 本特性 **bump 到 4**，水位 `__rxdb_system_schema__:4`                        |
| 版本不匹配即拒绝       | `migration.ts` `UnsupportedRxDBSystemVersionError`                                      | 「所有 writer 连接时协商」已有机制，不另造                                   |
| 迁移互斥锁             | `migration-runner.ts` + `rxdb_migration.name` 唯一索引 + `RxDBSystemMigrationLockError` | 建表迁移走这条既有路径，不另开锁                                             |
| change 编解码          | `change-codec.ts:33` `RXDB_CHANGE_CODEC_VERSION = 1`                                    | 新表的 patch 列**复用同一份 codec**，不写第二份                              |
| 加密列跳过 codec       | `change-codec.ts:17`（`PropertyType.encrypted === true` 不经本编码）                    | 加密 envelope 不被二次包裹 = 不降级                                          |

`log: false` 在每一张新表上都是**强制**的：新表自身的写入若被 change trigger 记录，会与「写工作树条目」互相递归。

## 1. 逻辑 → 物理映射总表

9 行逻辑状态落成 **10 张物理表**（多出的一张是物化 staging 的分页 payload 子表）。

| #   | 逻辑状态（spec.md）          | 类名                              | 表名                                      | 主键粒度          | 建表归属      |
| --- | ---------------------------- | --------------------------------- | ----------------------------------------- | ----------------- | ------------- |
| 1   | `CommitCapabilityState`      | `CommitCapabilityState`           | `rxdb_commit_capability`                  | 单行              | US-305        |
| 2   | `WorkingTreeActivationState` | `WorkingTreeActivationState`      | `rxdb_working_tree_activation`            | 单行              | US-305        |
| 3   | `Commit`                     | `Commit`                          | `rxdb_commit`                             | commit            | US-305        |
| 4   | `CommitChangeSet`            | `CommitChangeSet`                 | `rxdb_commit_change_set`                  | commit + unit     | US-305        |
| 5   | `CommitBranchRef`            | `CommitBranchRef`                 | `rxdb_commit_branch_ref`                  | branch            | US-305        |
| 6   | `WorkingTreeState`           | `WorkingTreeState`                | `rxdb_working_tree_state`                 | branch            | US-306 阶段 A |
| 7   | `WorkingTreeEntry`           | `WorkingTreeEntry`                | `rxdb_working_tree_entry`                 | branch + 实体身份 | US-306 阶段 A |
| 8   | `WorkingTreeRestoreSession`  | `WorkingTreeRestoreSession`       | `rxdb_working_tree_restore_session`       | branch + session  | US-306 阶段 B |
| 9   | branch materialization stage | `WorkingTreeMaterializationStage` | `rxdb_working_tree_materialization_stage` | attempt           | US-308        |
| 9   | ↑ 的分页 payload             | `WorkingTreeMaterializationPage`  | `rxdb_working_tree_materialization_page`  | attempt + page    | US-308        |

**类名全部落在 `Commit*` / `WorkingTree*` 前缀内**，满足 SC-014；无 `Index*`、无 `Workspace*`。这些**持久化类不从 `packages/rxdb/src/index.ts` 导出**——它们是实现，公开面是 `Commit*` / `WorkingTree*` 的 DTO 与命令契约（见 [contracts/core-api.md](./contracts/core-api.md)）。即便将来需要导出，前缀已经合规。

`SYSTEM_ENTITIES` 追加顺序 = 上表 1→10（`RxDBBranch` 已在首位，被 5/6/7/8 引用；3 被 4 引用；9 被其分页子表引用）。

## 2. 表定义

### 2.1 `rxdb_commit_capability` — 数据库级能力与版本协商（US-305）

| 字段              | 类型      | 约束                      | 说明                                 |
| ----------------- | --------- | ------------------------- | ------------------------------------ |
| `id`              | `string`  | primary, 常量 `'default'` | 单行守卫：主键取常量，第二行插不进来 |
| `enabled`         | `boolean` | default `false`           | 数据库级显式启用                     |
| `protocolVersion` | `integer` | not null                  | 提交能力协议版本                     |
| `schemaVersion`   | `integer` | not null                  | commit 图结构版本                    |
| `codecVersion`    | `integer` | not null                  | 与 `RXDB_CHANGE_CODEC_VERSION` 对齐  |
| `enabledAt`       | `date`    | nullable                  | 未启用时为 `null`                    |

- **启用是一次 CAS**：`UPDATE … SET enabled = true … WHERE id = 'default' AND enabled = false`。重复启用命中 0 行 = 幂等，不报错、不重置版本。
- 启用后三个版本字段**只读**；每个 writer 连接时读本行与进程常量比对，任一不匹配走既有 `UnsupportedRxDBSystemVersionError` 语义 fail-closed。
- `enabled = false` 时所有捕获与门禁短路，对应 FR-046 的**零行为差异**。

### 2.2 `rxdb_working_tree_activation` — 激活态与分支代际源（US-305）

| 字段                  | 类型      | 约束                      | 说明                                       |
| --------------------- | --------- | ------------------------- | ------------------------------------------ |
| `id`                  | `string`  | primary, 常量 `'default'` | 单行                                       |
| `activationRevision`  | `integer` | not null, default `0`     | switch branch CAS 成功后 +1                |
| `branchGenerationSeq` | `integer` | not null, default `0`     | 分支代际单调源，create branch 时 +1 并取用 |

- **不复制第二份 active branch ID**：当前分支的唯一真相仍是 `rxdb_branch.activated`（`branch.ts:35`）。本表只存 revision，避免两份真相漂移。
- `branchGenerationSeq` 放在本表而不是 2.1：create / remove branch **本来就要**校验或递增 activation revision（见 §5），放同一行让分支生命周期只锁一行；放进 2.1 会让只读的能力协商行变成全局写热点。

### 2.3 `rxdb_commit` — 不可变提交节点（US-305）

| 字段                 | 类型      | 约束                                  | 说明                                      |
| -------------------- | --------- | ------------------------------------- | ----------------------------------------- |
| `id`                 | `string`  | primary                               | commit id                                 |
| `parentIds`          | `json`    | not null                              | 父链数组；根 commit 为 `[]`，merge 可多父 |
| `firstParentId`      | `string`  | nullable, indexed                     | 首父冗余列，供祖先遍历走索引              |
| `message`            | `string`  | not null                              |                                           |
| `author`             | `string`  | nullable                              |                                           |
| `createdAt`          | `date`    | default `CURRENT_TIMESTAMP`, readonly |                                           |
| `operationId`        | `uuid`    | **unique**, not null                  | 幂等键                                    |
| `changeSetCount`     | `integer` | not null                              | 与 2.4 实际行数比对，图校验用             |
| `contentFingerprint` | `string`  | not null                              | FR-022 图校验的节点指纹                   |

- **只追加，永不 UPDATE / DELETE**。
- 幂等靠 `operationId` 唯一索引 + 既有 `isUniqueConstraintViolation()`（`migration.ts`）判别：撞约束 = 同一次提交重放，读回现有节点返回，**不新建**。该谓词必须**贴在这一条 INSERT 上**，不得在事务外层泛用（`migration.ts` 注释已写明误用代价）。
- 祖先可达性沿 `parentIds` 向上走，方向与 FR-022 的损坏判定一致，因此**不建 edge 表**。
- `firstParentId` 是 `parentIds[0]` 的冗余列，只为让祖先遍历走索引。冗余列就是第二份真相的温床，因此配一条不变量断言（`firstParentId === parentIds[0] ?? null`）进 conformance 套件。

### 2.4 `rxdb_commit_change_set` — 提交的不可变恢复数据（US-305）

| 字段            | 类型      | 约束                                  | 说明                                       |
| --------------- | --------- | ------------------------------------- | ------------------------------------------ |
| `id`            | `string`  | primary                               |                                            |
| `commit`        | relation  | MANY_TO_ONE → `Commit`                | 级联随 commit（commit 不删，故实际不触发） |
| `sequence`      | `integer` | not null, unique `(commit, sequence)` | 冻结的重放顺序                             |
| `unitId`        | `string`  | not null                              | 与 2.7 的 `unitId` 同源                    |
| `transactionId` | `uuid`    | nullable                              | 完整事务共享同一值                         |
| `namespace`     | `string`  | not null, readonly                    |                                            |
| `entity`        | `string`  | not null, readonly                    |                                            |
| `entityId`      | `string`  | not null, readonly                    |                                            |
| `operation`     | `string`  | not null, readonly                    | `insert` / `update` / `delete`             |
| `patch`         | `json`    | nullable, readonly                    | 完整不可变副本                             |
| `inversePatch`  | `json`    | nullable, readonly                    | 完整不可变副本                             |
| `origin`        | `string`  | not null, readonly                    | `local` / `remote_sync`                    |

- **与 2.3 同一事务写入**；只追加。
- **不存 `rxdb_change.id` 外键**：change 行会被「删分支级联 / 压缩合并 / 回滚标记 / 失效标记」四条既有路径删除或失效，引用等于把 commit 的可恢复性挂在一张会被清理的表上。

### 2.5 `rxdb_commit_branch_ref` — 分支 HEAD 与 CAS（US-305）

| 字段           | 类型      | 约束                       | 说明                                         |
| -------------- | --------- | -------------------------- | -------------------------------------------- |
| `id`           | `string`  | primary = branchId         | 一分支一行                                   |
| `branch`       | relation  | MANY_TO_ONE → `RxDBBranch` |                                              |
| `generation`   | `integer` | not null, **readonly**     | 建分支时从 2.2 的 `branchGenerationSeq` 取用 |
| `headCommitId` | `string`  | nullable                   | 空分支为 `null`                              |
| `headRevision` | `integer` | not null, default `0`      |                                              |
| `status`       | `string`  | not null, default `'ok'`   | `ok` / `corrupted_read_only`                 |
| `corruptedAt`  | `date`    | nullable                   | 进入 `corrupted_read_only` 的时刻            |

- **推进 HEAD 的 CAS**：`UPDATE … WHERE id = ? AND generation = ? AND headRevision = ?`，命中 0 行即 `CommitConflict`。
- `generation` **不可变且不复用**，专治 ABA：删分支后同名重建拿到新代际，持旧 `(branchId, headRevision)` 的调用方不会误中新分支。
- `status = 'corrupted_read_only'` 由 §6 的**单一守卫**写入；`commit()` / `restore()` / switch-to 三入口各自在自己的写事务内调用同一份守卫。

### 2.6 `rxdb_working_tree_state` — 分支工作树游标（US-306 阶段 A）

| 字段                  | 类型      | 约束                        | 说明                                   |
| --------------------- | --------- | --------------------------- | -------------------------------------- |
| `id`                  | `string`  | primary = branchId          |                                        |
| `branch`              | relation  | MANY_TO_ONE → `RxDBBranch`  |                                        |
| `baseHeadCommitId`    | `string`  | nullable                    | 工作树所基于的 HEAD                    |
| `workingTreeRevision` | `integer` | not null, default `0`       | **事务内读改写型**，不接收调用方期望值 |
| `entryCount`          | `integer` | not null, default `0`       | 2.7 行数的冗余计数                     |
| `updatedAt`           | `date`    | default `CURRENT_TIMESTAMP` |                                        |

`entryCount` 是冗余列，存在理由是 `status()` 的「有没有未提交变更」要走常数时间而不是 `COUNT(*)`（SC-001 的 100 ms 绝对上限）。它与 2.7 的实际行数**必须在同一事务内一起改**；conformance 套件要有一条「计数与行数一致」的不变量断言，否则冗余列就是第二份真相。

### 2.7 `rxdb_working_tree_entry` — 未提交变更单元（US-306 阶段 A）

| 字段                      | 类型      | 约束                                 | 说明                             |
| ------------------------- | --------- | ------------------------------------ | -------------------------------- |
| `id`                      | `string`  | primary                              |                                  |
| `branch`                  | relation  | MANY_TO_ONE → `RxDBBranch`           | 分支级隔离                       |
| `unitId`                  | `string`  | not null, indexed `(branch, unitId)` | **完整事务共享同一 unit**        |
| `transactionId`           | `uuid`    | nullable                             |                                  |
| `namespace`               | `string`  | not null                             |                                  |
| `entity`                  | `string`  | not null                             |                                  |
| `entityId`                | `string`  | not null                             |                                  |
| `operation`               | `string`  | not null                             | `insert` / `update` / `delete`   |
| `patch`                   | `json`    | nullable                             | **独立完整副本**                 |
| `inversePatch`            | `json`    | nullable                             | **独立完整副本**，取首次捕获值   |
| `fingerprint`             | `string`  | not null                             | 当前指纹                         |
| `origin`                  | `string`  | not null                             | `local` / `remote_sync`          |
| `sourceChangeId`          | `integer` | nullable                             | **仅诊断**，不得作为重放数据来源 |
| `createdAt` / `updatedAt` | `date`    | default `CURRENT_TIMESTAMP`          |                                  |

唯一约束 **`(branch, namespace, entity, entityId)`**：同一分支同一实体至多一个未提交单元。

**合并（折叠）规则**——第二次写入同一实体时：

1. `patch` 取**最新合成值**；`inversePatch` **保持首次捕获值**不变（否则 inverse 只能退回上一次中间态，退不回 HEAD）。
2. `INSERT` 之后 `DELETE`（该行在 HEAD 不存在）→ **净无变化**：删除条目、`entryCount` 递减、**不**留 `delete` 单元。
3. `origin` 取**最新**一次写入的来源；`local` 与 `remote_sync` 折叠进同一单元时按最新值记，`status()` / `diff()` 照常展示。
4. **不做值级归零**（把 UPDATE 改回 HEAD 原值不会自动消解成无单元）。理由：值级归零要读 HEAD 投影，代价与 `diff()` 同阶，摊到每次 `save()` 上会直接顶穿 SC-001 预算。这是**已知取舍**，不是遗漏。

### 2.8 `rxdb_working_tree_restore_session` — 恢复会话（建表 US-306 阶段 B，生命周期 US-307）

| 字段                          | 类型      | 约束                        | 说明                                         |
| ----------------------------- | --------- | --------------------------- | -------------------------------------------- |
| `id`                          | `string`  | primary                     |                                              |
| `branch`                      | relation  | MANY_TO_ONE → `RxDBBranch`  |                                              |
| `targetCommitId`              | `string`  | not null                    | 恢复来源 commit                              |
| `expectedHeadRevision`        | `integer` | not null                    | 会话创建时捕获                               |
| `expectedWorkingTreeRevision` | `integer` | not null                    | 会话创建时捕获                               |
| `status`                      | `string`  | not null                    | `active` / `conflicted` / `committed`        |
| `activeKey`                   | `string`  | nullable, **unique**        | 非终态时 = branchId，`committed` 时置 `null` |
| `createdAt` / `updatedAt`     | `date`    | default `CURRENT_TIMESTAMP` |                                              |

- `activeKey` 的唯一索引实现「一分支至多一个未结束会话」，且在 PostgreSQL 与全部 SQLite 绑定上语义一致（`NULL` 不参与唯一比较），**不需要**各后端写方言化的部分索引。
- **`status().conflicted` 的唯一来源就是本表**。没有 durable session 就没有 conflicted，`CommitConflict` **不入库**（见 §7）。

### 2.9 `rxdb_working_tree_materialization_stage` / `_page` — 目标分支物化 staging（US-308）

**stage**：`id`（attempt id, primary）、`targetBranchId`、`frozenRemoteWatermark`(json)、`scopeManifest`(json)、`fingerprint`、`status`、`pageCount`、`createdAt`。

**page**：`id`（primary）、`stage`（MANY_TO_ONE → stage，级联删除）、`pageIndex`（unique `(stage, pageIndex)`）、`payload`(json)、`fingerprint`。

- 只落**目标分支**快照，**不写当前业务投影**、不更新当前分支同步状态。
- switch 成功后连同分页整体删除；失败或中断遗留的 attempt 按 `fingerprint` + `scopeManifest` 判定可否续用，判不了就整体丢弃重来——**不允许**把半份 payload 当成完整快照物化。

## 3. 两条不可让步的存储契约 → 物理落点

| 契约（spec.md）                                                | 物理落点                                                                                            |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `WorkingTreeEntry` 独立完整复制，不复用也不只引用 `RxDBChange` | 2.7 自带 `patch` / `inversePatch` / `fingerprint` 三列；`sourceChangeId` **无外键约束**且只用于诊断 |
| `CommitChangeSet` 复制完整不可变恢复数据                       | 2.4 自带 `patch` / `inversePatch`，与 2.3 同事务写入，**无**指向 `rxdb_change` 的列                 |

判定这两条是否被违反的可执行门禁：`rxdb_commit_change_set` 与 `rxdb_working_tree_entry` 的 `relations` 数组中**不得出现** `mappedEntity: 'RxDBChange'`。这是一条静态断言，进 conformance 套件。

## 4. 编解码与加密边界

- 2.4 / 2.7 的 `patch` / `inversePatch` **复用** `change-codec.ts` 的同一份 encode / decode，不写第二份编解码器。
- 因此 `bigint` / `binary` 走既有 envelope；`PropertyType.encrypted === true` 的列**一律跳过** codec（`change-codec.ts:17`），加密包不被二次包裹——这正是「加密 at-rest envelope 不降级」的物理含义。
- 2.1 的 `codecVersion` 与 `RXDB_CHANGE_CODEC_VERSION` 必须一致；不一致按既有 `UnsupportedRxDBSystemVersionError` 口径拒绝，**不做**降级读取。

## 5. revision 校验矩阵 → 物理 CAS 语句

| 操作                      | 捕获型条件（调用方传入）                                                     | 事务内读改写                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 普通 INSERT/UPDATE/DELETE | active branch token                                                          | 2.6 `workingTreeRevision` +1、`entryCount` 同步                                              |
| remote entity apply       | active branch token、sync 水位                                               | 同上（仅当有实体净变化）                                                                     |
| merge / undo / redo       | active branch token、expected 2.6 revision + 操作自身 revision               | 有逻辑工作树变化时 +1                                                                        |
| commit                    | active branch token、2.5 `(generation, headRevision)`、2.6 expected revision | 2.5 head +1、2.6 revision +1、清空 2.7 并置零 `entryCount`（**同一事务**）                   |
| restore                   | active branch token、2.5 expected head、2.6 expected revision                | 2.6 revision +1                                                                              |
| discard                   | active branch token、2.5 expected head、2.6 expected revision                | 2.6 revision +1、删条目、`entryCount` 归零                                                   |
| switch branch             | 2.2 expected `activationRevision`、来源/目标分支状态或 2.9 快照              | 2.2 `activationRevision` +1                                                                  |
| create branch             | active branch token、来源 2.5 head + 2.6 revision                            | 2.2 `branchGenerationSeq` +1 并写入新 2.5 `generation`；新 2.5/2.6 从 `0` 起；**来源行不变** |
| remove branch             | 2.2 expected `activationRevision`、目标 2.5/2.6 revision、目标非 active      | 原子删除目标 2.5/2.6/2.7/2.8；`generation` **不复用**                                        |

**语义 no-op 一律不递增 revision**——判定发生在写 2.6 之前，不是写完再回滚。

## 6. 损坏守卫（单一实现）

一份守卫函数，输入 `(branchId)`，在**调用方自己的写事务内**执行：沿 2.5 `headCommitId` → 2.3 `parentIds` 遍历可达祖先，逐节点比对 `contentFingerprint` 与 `changeSetCount` ↔ 2.4 实际行数。

- 命中可达损坏 → 置 2.5 `status = 'corrupted_read_only'` + `corruptedAt`，**拒绝本次操作、保留原 ref、不删任何记录**。
- 孤立损坏（不在任何分支的可达集里）→ 只隔离记录，不影响任何入口。
- 不依赖重放的当前投影读取、诊断导出、以及「切离」该分支的 switch **不受影响**。
- `commit()` / `restore()` / switch-to 三入口调用的是**同一个符号**；conformance 套件断言三入口的拒绝码同为 `commit_graph_corrupted`。

## 7. 明确**不建**的表

| 不建                         | 理由                                                                     |
| ---------------------------- | ------------------------------------------------------------------------ |
| 任何 index / staging area 表 | v1 裁掉暂存区（spec.md 硬裁决 1）                                        |
| 依赖闭包表 / 环检测状态表    | 随暂存区一并裁掉（硬裁决 2），`index_dependency_cycle` 已裁撤            |
| staged snapshot 冻结表       | 同上                                                                     |
| `CommitConflict` 持久表      | 它是**一次失败命令的类型化诊断值**，不是状态；`conflicted` 只由 2.8 派生 |
| 第二条 diff 轴的物化表       | 只有 `HEAD ↔ 工作树` 一条轴                                              |
| 指向 `rxdb_change` 的外键列  | 见 §3                                                                    |

## 8. 迁移

单条迁移，走既有 `runMigrations` 路径（互斥靠 `rxdb_migration.name` 唯一索引，不另开锁）：

1. 建 §1 的 10 张表与其索引。
2. 为**每个已存在分支**写入 2.5 / 2.6 初始行：`generation` 依次取自 2.2 的 `branchGenerationSeq`，`headCommitId = null`、`headRevision = 0`、`workingTreeRevision = 0`、`entryCount = 0`。
3. 写 2.1 单行（`enabled = false`）与 2.2 单行。
4. `RXDB_SYSTEM_SCHEMA_VERSION` 3 → **4**，水位写 `__rxdb_system_schema__:4`。

**全有或全无**：任一分支初始化不成功，整条迁移回滚，数据库停在 v3。

**已知影响，不掩饰**：bump 之后旧版本客户端打开该库会按既有 `UnsupportedRxDBSystemVersionError` 拒绝。这不是本特性新增的危险面——2→3 同样如此——但必须写进发布说明。建表本身不改变任何业务行为：`enabled = false` 时全部捕获与门禁短路，满足 FR-046。

**迁移不是发布步骤**。FR-030 的发布门禁由已实现且 39/39 单测绿的 `scripts/check-migration-release-gate.mjs` 承担，本特性**只复验、不重写**；npm release 由维护者手动控制，不进本计划的任务链。
