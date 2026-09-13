# Tasks: 本地工作树与提交历史

**Input**: Design documents from `/specs/001-working-tree-commits/`

**Prerequisites**: [plan.md](./plan.md)（必读）、[spec.md](./spec.md)（必读）、[research.md](./research.md)、[data-model.md](./data-model.md)、[contracts/](./contracts/)、[quickstart.md](./quickstart.md)

**Tests**: 本特性**强制 TDD**（constitution v2.0.2 II：红 → 绿 → 重构）。每个阶段的测试任务排在实现任务之前，且**必须先看到红**再写实现。

**Organization**: 任务按用户故事分组。故事标签与 spec.md 的四条 User Story 一一对应：

| 标签    | spec.md      | 需求编号                 | 优先级 |
| ------- | ------------ | ------------------------ | ------ |
| `[US1]` | User Story 1 | US-305                   | P1     |
| `[US2]` | User Story 2 | US-306（阶段 A / B / C） | P1     |
| `[US3]` | User Story 3 | US-307                   | P2     |
| `[US4]` | User Story 4 | US-308                   | P2     |

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、不依赖未完成任务）
- **[Story]**: 该任务归属的用户故事标签
- 每条任务都带确切文件路径

## Path Conventions

Nx 23 + pnpm 10 monorepo，沿用既有布局（见 plan.md「Project Structure」）：

- 核心：`packages/rxdb/src/`（新增 `commit/` 与 `working-tree/` 两个目录，与既有 `version/` 并列）
- 适配器：`packages/rxdb-adapter-{pglite,wa-sqlite,sqlite-wasm,sqlite,sqliteai,electron}/src/`
- 三框架：`packages/rxdb-{angular,react,vue}/src/`
- benchmark：`benchmarks/`
- 门禁脚本：`scripts/audit/`

## 本任务链的硬边界（不得越界）

1. **MUST NOT 重写** `scripts/check-migration-release-gate.mjs`——它已实现且 39/39 单测绿，本特性只在真实 tag 与真实清单上**复验**（FR-030 / R9）。
2. **MUST NOT** 排入任何 npm release / 发版步骤。发布由维护者手动控制，**不是开工前置**，也不是本任务链的一环（quickstart.md §6）。
3. **MUST NOT** 出现 stage / unstage / 部分提交 / 依赖闭包 / 环检测 / `index_dependency_cycle` / `HEAD ↔ index` 第二条 diff 轴相关任务——v1 已整体裁掉（spec.md 硬裁决 1–2，data-model.md §7）。
4. **MUST NOT** 新增 `Index*` 或 `Workspace*` 前缀导出；**MUST NOT** 复活 `stagedChange()` / `unstageChange()` / `stagedCount` / `WorkspaceCacheEntry.staged`（SC-014、横切约束 4）。

---

## Phase 1: Setup（共享基础设施）

**Purpose**: 目录骨架与套件分发通道。不含任何语义实现。

- [x] T001 创建核心目录骨架与 barrel：`packages/rxdb/src/commit/index.ts` 与 `packages/rxdb/src/working-tree/index.ts`（空 barrel + `@fileoverview` TSDoc，说明两者分别承载不可变提交图与可变工作树面）
- [x] T002 [P] 在 `packages/rxdb/package.json` 增加 `./testing` 子路径导出（`@aiao/source` 条件指向 `src/working-tree/testing/index.ts`），用于把两套 `*.suite.ts` 分发给 6 个适配器包；照 `packages/rxdb-adapter-pglite/package.json` 的既有 `./testing` 形态写
- [x] T003 [P] 让 T002 的新子路径通过既有门禁：跑 `node scripts/audit/subpath-inventory.mjs` 与 `node scripts/audit/subpath-build-entries.mjs`，按其报错补齐 `packages/rxdb/tsconfig*.json` 与构建入口登记
- [x] T004 [P] 在 `packages/rxdb/src/working-tree/testing/index.ts` 建立套件 barrel 占位（导出 `workingTreeCaptureConformanceSuite` / `workingTreeCommitConformanceSuite` 的类型签名与 `SuiteContext { name, createDatabase }`，实现留空并 `throw new Error('not implemented')`）

**Checkpoint**: 目录与分发通道就绪，`pnpm nx run-many -t build --projects=rxdb` 可过。

---

## Phase 2: Foundational（阻塞性前置）

**Purpose**: 10 张物理表的实体声明、系统表登记与结构版本迁移。**所有故事都依赖这一层。**

**⚠️ CRITICAL**: 本阶段完成前，任何用户故事任务都不能开始。

**为什么建表整体落在 Foundational 而不是按故事拆**：data-model.md §8 规定**单条迁移、全有或全无**，且表由 `SchemaManager`（`packages/rxdb/src/schema/SchemaManager.ts:61`）从 `SYSTEM_ENTITIES` 声明式建出——10 个类必须同批登记，拆开会让迁移无法原子完成。每条任务在描述里**显式标注该表的语义归属**（data-model.md §1 的归属列），归属故事在自己的阶段实现语义。建表时 `enabled = false`，全部捕获与门禁短路，满足 FR-046 的零行为差异。

### Tests for Foundational（先红）

- [x] T005 [P] 写红测试 `packages/rxdb/src/__tests__/system/working-tree-system-entities.spec.ts`：断言 10 个新实体类全部出现在 `SYSTEM_ENTITIES` 中、`isSystemEntity()` 为真、且每个类的 `log === false`（对应 conformance-suites.md §1.5 的静态存储契约）
- [x] T006 [P] 写红测试 `packages/rxdb/src/__tests__/system/working-tree-schema-migration.spec.ts`：断言 `RXDB_SYSTEM_SCHEMA_VERSION === 4`、水位为 `__rxdb_system_schema__:4`、迁移后每个既有分支各有一行 `rxdb_commit_branch_ref`（`headCommitId = null`、`headRevision = 0`）与一行 `rxdb_working_tree_state`（`workingTreeRevision = 0`、`entryCount = 0`），以及任一分支初始化失败时整库停在 v3
- [x] T007 [P] 写红测试 `packages/rxdb/src/__tests__/system/working-tree-storage-contract.spec.ts`：断言 `rxdb_working_tree_entry` 与 `rxdb_commit_change_set` 的 `relations` 中**不出现** `mappedEntity: 'RxDBChange'`（data-model.md §3：独立完整复制，不引用 change 表）

### Implementation for Foundational

- [x] T008 [P] 声明 `CommitCapabilityState`（表 `rxdb_commit_capability`，常量主键 `'default'`）在 `packages/rxdb/src/commit/commit-capability-state.entity.ts`，字段按 data-model.md §2.1；语义归属 **US-305**
- [x] T009 [P] 声明 `WorkingTreeActivationState`（表 `rxdb_working_tree_activation`，含 `activationRevision` 与 `branchGenerationSeq`）在 `packages/rxdb/src/working-tree/working-tree-activation-state.entity.ts`，按 data-model.md §2.2；语义归属 **US-305**（递增语义归 US-308）
- [x] T010 [P] 声明 `Commit`（表 `rxdb_commit`，含 `parentIds` json、冗余索引列 `firstParentId`、唯一 `operationId`、`changeSetCount`、`contentFingerprint`）在 `packages/rxdb/src/commit/commit.entity.ts`，按 data-model.md §2.3；语义归属 **US-305**
- [x] T011 [P] 声明 `CommitChangeSet`（表 `rxdb_commit_change_set`，完整不可变恢复数据，不引用 `RxDBChange`）在 `packages/rxdb/src/commit/commit-change-set.entity.ts`，按 data-model.md §2.4；语义归属 **US-305**
- [x] T012 [P] 声明 `CommitBranchRef`（表 `rxdb_commit_branch_ref`，含不可复用的不可变 `generation` 与 `status: 'ok' | 'corrupted_read_only'`）在 `packages/rxdb/src/commit/commit-branch-ref.entity.ts`，按 data-model.md §2.5；语义归属 **US-305**
- [x] T013 [P] 声明 `WorkingTreeState`（表 `rxdb_working_tree_state`，含 `workingTreeRevision` 与冗余列 `entryCount`）在 `packages/rxdb/src/working-tree/working-tree-state.entity.ts`，按 data-model.md §2.6；语义归属 **US-306 阶段 A**
- [x] T014 [P] 声明 `WorkingTreeEntry`（表 `rxdb_working_tree_entry`，`(branch, namespace, entity, entityId)` 唯一，独立完整复制 patch / inversePatch，`sourceChangeId` 仅诊断无外键）在 `packages/rxdb/src/working-tree/working-tree-entry.entity.ts`，按 data-model.md §2.7；语义归属 **US-306 阶段 A**
- [x] T015 [P] 声明 `WorkingTreeRestoreSession`（表 `rxdb_working_tree_restore_session`，用可空唯一列 `activeKey` 表达「每分支至多一个未结束会话」，不使用方言相关的部分索引）在 `packages/rxdb/src/working-tree/working-tree-restore-session.entity.ts`，按 data-model.md §2.8；语义归属 **US-306 阶段 B**
- [x] T016 [P] 声明 `WorkingTreeMaterializationStage`（表 `rxdb_working_tree_materialization_stage`，按 attempt 粒度）在 `packages/rxdb/src/working-tree/working-tree-materialization-stage.entity.ts`，按 data-model.md §2.9；语义归属 **US-308**
- [x] T017 [P] 声明 `WorkingTreeMaterializationPage`（表 `rxdb_working_tree_materialization_page`，attempt + page 粒度的分页 payload）在 `packages/rxdb/src/working-tree/working-tree-materialization-page.entity.ts`，按 data-model.md §2.10；语义归属 **US-308**
- [x] T018 把 T008–T017 的 10 个类按 data-model.md §1 的 1→10 顺序追加进 `packages/rxdb/src/system/system-entities.ts` 的 `SYSTEM_ENTITIES`（该文件注释原文：「清单只此一份」——漏登记的代价是新表被按库级 sync 配置送进它们从不参与的管道）
- [x] T019 把 `RXDB_SYSTEM_SCHEMA_VERSION` 从 `3` 改为 `4` 于 `packages/rxdb/src/system/migration.ts:22`，并写单条迁移（建表 + 每分支初始行 + capability/activation 单行，全有或全无）于 `packages/rxdb/src/system/migrations/0004-working-tree-commits.ts`，走既有 `runMigrations` 路径与 `rxdb_migration.name` 唯一索引互斥，不另开锁
- [x] T020 让新表的 patch / inversePatch 列复用既有 `packages/rxdb/src/system/change-codec.ts` 的同一份 codec（不写第二份），并保证 `PropertyType.encrypted === true` 的列跳过该 codec（`change-codec.ts:17`：加密自带 envelope，二次编码会把密文再包一层）
- [x] T021 在 `packages/rxdb/src/commit/commit-error-codes.ts` 定义跨故事共享的错误码常量与类型（`commit_capability_disabled`、`commit_capability_mismatch`、`commit_graph_corrupted`、`ambiguous_active_branch`、`branch_not_materializable`、`branch_not_materialized`、`mixed_versioned_cache_transaction`），逐条补 TSDoc，来源见 contracts/core-api.md §7

**Checkpoint**: T005–T007 转绿。库在 `enabled = false` 下行为与 v3 完全一致（FR-046），用户故事可以开工。

---

## Phase 3: User Story 1 — 提交图与 HEAD 持久化（US-305，Priority: P1）🎯 MVP

**Goal**: 把本地变更组织成可持久化的提交图：commit 元数据、`CommitBranchRef.headCommitId` 与 `headRevision` 跨刷新/重启/崩溃可恢复；已有数据库经一次显式启用迁移获得 baseline；损坏 fail-closed。

**Independent Test**: 在 PGlite 与另外 5 个 v1 后端上，对一个含既有 `RxDBChange` 历史的数据库调用 `enable()`，重启进程后 `listCommits()` 仍返回同一条父链且 HEAD 未漂移；人为破坏可达祖先后 `commit()` 稳定返回 `commit_graph_corrupted` 且 ref 与记录零变化。本阶段**无 UI**，全部由核心单测 + `workingTreeCommitConformanceSuite` 验证。

### Tests for User Story 1（先红）

- [x] T022 [P] [US1] 写红测试 `packages/rxdb/src/__tests__/commit/capability-enable.spec.ts`：启用是一次 CAS（`WHERE id='default' AND enabled=false`），重复启用命中 0 行即幂等不报错、不重置版本；启用后三个版本字段只读；版本不匹配走既有 `UnsupportedRxDBSystemVersionError` 语义 fail-closed（FR-037）
- [x] T023 [P] [US1] 写红测试 `packages/rxdb/src/__tests__/commit/commit-graph.spec.ts`：commit 元数据、父链、`changeSetCount`、`contentFingerprint` 可持久化并跨重启恢复；`firstParentId === parentIds[0] ?? null` 的不变量断言（冗余列不得成为第二份真相）（FR-002/003/027）
- [x] T024 [P] [US1] 写红测试 `packages/rxdb/src/__tests__/commit/commit-cas-idempotency.spec.ts`：同事务内以 expected `headRevision` 条件更新 ref；CAS 失败时 commit、ChangeSet、ref 三者全部不可见；相同 `operationId` 重试返回原 commit，字段不同则稳定报错不覆盖；同名重建分支用新 `generation` 不碰撞旧幂等键（FR-029/036）
- [x] T025 [P] [US1] 写红测试 `packages/rxdb/src/__tests__/commit/commit-empty-and-baseline.spec.ts`：普通 commit 要求 trim 后非空 message + `authorId` + `operationId`，无变更单元时失败且不产生空节点；`kind=baseline | branch_baseline` 是唯一的无作者/无消息且允许空 ChangeSet 的系统根节点（FR-008/009）
- [x] T026 [P] [US1] 写红测试 `packages/rxdb/src/__tests__/commit/enable-migration.spec.ts`：为每个本地可完整物化分支生成 baseline、保留旧 change 记录、保持激活分支与业务实体状态、失败可重试；Workspace 草稿不参与；metadata-only 远端分支不创建 baseline / ref（FR-021/049）
- [x] T027 [P] [US1] 写红测试 `packages/rxdb/src/__tests__/commit/active-branch-cardinality.spec.ts`：启用后 `RxDBBranch.activated` 恰好一行为真；零 active 沿用既有 main 恢复语义；多 active 返回 `ambiguous_active_branch` 并全量回滚；每次连接验证至少一个（FR-048）
- [x] T028 [P] [US1] 写红测试 `packages/rxdb/src/__tests__/commit/corruption-guard.spec.ts`：从每个 branch ref 遍历完整可达父链；孤立损坏只隔离记录、其他分支照常可用；HEAD 或可达祖先损坏时分支进入 `corrupted_read_only`，不自动回退到较早 commit / 空工作树 / 内存模式（FR-022/051、SC-013）
- [x] T029 [P] [US1] 写红测试 `packages/rxdb/src/__tests__/commit/commit-encryption.spec.ts`：commit / ChangeSet / baseline 持久化 dump 的明文哨兵零命中；错误、日志与摘要不含加密字段值（FR-038、SC-011）
- [x] T030 [P] [US1] 写红测试 `packages/rxdb/src/__tests__/commit/legacy-compat.spec.ts`：启用 commit 能力后 `RxDBChange`、undo/redo 与 `restoreEntity` 的既有行为逐条不变；durable commit 历史与会话级 redo 栈区分清楚——刷新后 redo 可清空，commit 与 HEAD 不清空（FR-018/019）

### Implementation for User Story 1

- [x] T031 [US1] 实现能力启用与版本协商于 `packages/rxdb/src/commit/commit-capability.ts`：`isEnabled()` / `enable()`、单行 CAS、连接时版本比对 fail-closed（FR-037，契约见 contracts/core-api.md §2）
- [x] T032 [US1] 实现 `RxDB.workingTree` 入口于 `packages/rxdb/src/working-tree/working-tree-facade.ts`：入口**恒存在**，未启用时每个方法以 `commit_capability_disabled` 拒绝（不是 `undefined`，契约见 contracts/core-api.md §1）
- [x] T033 [US1] 实现 `WorkingTreeActivationState` 的建行、初始化 `activationRevision = 0` 与连接时读取于 `packages/rxdb/src/working-tree/activation-state.ts`；**不得**复制第二份 active branch ID（当前分支仍由 `RxDBBranch.activated` 表示）；递增语义留给 US-308（FR-052）
- [x] T034 [US1] 实现变更单元模型与指纹于 `packages/rxdb/src/commit/change-unit.ts`：NEW / UPDATE / DELETE 与完整事务表示为可比较单元，各自保留实体身份、操作类型、基线版本与当前版本指纹（FR-003）
- [x] T035 [US1] 实现 commit 写入路径于 `packages/rxdb/src/commit/write-commit.ts`：单原子操作内写 ChangeSet、父 commit、数据库时间、摘要与新 HEAD；CAS 失败全量回滚（FR-008/010/029）
- [x] T036 [US1] 实现幂等约束于 `packages/rxdb/src/commit/commit-idempotency.ts`：唯一键 = database + immutable branch generation + `operationId`；复用 `packages/rxdb/src/system/migration.ts` 的 `isUniqueConstraintViolation()`，**只钉在你自己发出的那一条 INSERT 上**（其 TSDoc 已明确这一点）（FR-036）
- [x] T037 [US1] 实现历史查询于 `packages/rxdb/src/commit/list-commits.ts`：按 branch ref 父链可达性、实体与数据库时间过滤，返回单 commit 的变更详情与父节点关系；`originBranchId` 只用于审计，不得用于截断继承历史（FR-012）
- [x] T038 [US1] 实现**共享损坏守卫** `assertCommitGraphIntact()` 于 `packages/rxdb/src/commit/commit-graph-guard.ts`：区分孤立损坏与可达损坏，供 commit / restore / switch-to 在各自写事务内调用；US-306 阶段 B、US-307、US-308 **复用同一份**，不得各写一份（FR-051、R10）
- [x] T039 [US1] 实现一次性启用迁移于 `packages/rxdb/src/commit/enable-migration.ts`：逐分支生成 baseline、保留旧 change、失败可重试；「可完整物化」判定**复用既有分支物化路径**（沿 `RxDBChange` 链无缺口走到分支 tip），**MUST NOT** 另写第二套重放引擎（FR-021/049、R11）
- [x] T040 [US1] 实现 active 分支基数约束与连接时校验于 `packages/rxdb/src/commit/active-branch-guard.ts`，含 `ambiguous_active_branch` 全量回滚路径（FR-048）
- [ ] T041 [US1] 把 commit / ChangeSet / baseline 的加密列接到既有 at-rest 契约上于 `packages/rxdb/src/commit/commit-codec.ts`：持久化路径**不得**先解密再把明文写进新系统表（FR-038）
- [ ] T042 [US1] 实现 `workingTreeCommitConformanceSuite` 的 US-305 部分于 `packages/rxdb/src/working-tree/testing/working-tree-commit.suite.ts`：覆盖 conformance-suites.md §2.1（commit 图与 HEAD）、§2.2（一次性启用迁移）、§2.5（损坏守卫三入口同一份）
- [ ] T043 [US1] 在 6 个 v1 适配器包各建实际调用点 `src/__tests__/working-tree-commit-conformance.spec.ts`，复用各包既有 factory（如 `packages/rxdb-adapter-electron/src/__tests__/electron-adapter-factory.ts`、`packages/rxdb-adapter-sqliteai/src/__tests__/sqliteai-factory.ts`）调用 T042 的套件——「导出了但没人跑」等于没覆盖
- [ ] T044 [US1] 在 `scripts/audit/` 增加 `working-tree-suite-callsites.mjs` 与其 `.spec.mjs`：校验 6 个 v1 适配器包**各自**都有两套套件的调用点，缺一即门禁失败（conformance-suites.md §0、SC-006）
- [ ] T045 [US1] **复验（不重写）** FR-030 迁移发布门禁：跑 `node --test scripts/check-migration-release-gate.spec.mjs` 确认 39/39 绿，并用真实 tag 与真实 bridge manifest 跑一次 `node scripts/check-migration-release-gate.mjs`，把 `bridge.tag` 是祖先、`bridge.version` 严格新于 `LAST_INELIGIBLE_BRIDGE_VERSION` 的结论记进 `specs/001-working-tree-commits/quickstart.md` §5 的执行记录。**MUST NOT 修改该脚本**；**不触发任何发布动作**

**Checkpoint**: US-305 独立可交付。提交图与 HEAD 跨重启可恢复，损坏 fail-closed，6 后端提交套件（US-305 部分）全绿。**这是 MVP。**

---

## Phase 4: User Story 2 — 工作树捕获（US-306 阶段 A，Priority: P1）

**Goal**: 让**每一个**业务实体写入口都在同事务内落成完整 `WorkingTreeEntry`，使「HEAD + 工作树条目」能冷重放出业务表当前值。本阶段不暴露 status/diff/commit。

**Independent Test**: 冷重放不变量——清空进程内缓存后，由 HEAD + `WorkingTreeEntry` 重放出的净状态逐字段等于业务表当前值；对版本化实体发 raw 写与 `upsertMany()` 时在**语句执行前**被拒且业务表零变化。

**Depends on**: Phase 3（US-305）完成——捕获要写的 `workingTreeRevision` 与 active token 依赖已启用的能力状态。

### Tests for User Story 2 阶段 A（先红）

- [ ] T046 [P] [US2] 写红测试 `packages/rxdb/src/__tests__/working-tree/capture-mount-points.spec.ts`：4 个挂载点各自成组——`transaction`（rxdb-adapter.ts:134）、**本地** `mergeChanges`（:200）、`switchBranch`（:182）、`upsertMany`/`deleteByIds`（:239/:255）；断言**远端** `mergeChanges` 重载（:322）**不在**表内，重载按签名而非函数名区分（adapter-contract.md §1）
- [ ] T047 [P] [US2] 写红测试 `packages/rxdb/src/__tests__/working-tree/cold-replay.spec.ts`：冷重放不变量作为「捕获是否完备」的**唯一**判据，不靠计数相等（conformance-suites.md §1.1、SC-009）
- [ ] T048 [P] [US2] 写红测试 `packages/rxdb/src/__tests__/working-tree/write-entry-matrix.spec.ts`：spec.md「写入口语义矩阵」**每一行**至少一条用例，含「只更新 `remoteId` / 同步水位 / 审计时间 → 不创建单元、不递增 revision」与「`cleanupExpired()` 过期删除 → 落 `origin='remote_sync'` DELETE 单元并递增 revision」（FR-046、conformance-suites.md §1.2）
- [ ] T049 [P] [US2] 写红测试 `packages/rxdb/src/__tests__/working-tree/observable-gate.spec.ts`：`upsertMany()` / `deleteByIds()` 返回 `Observable<void>`，门禁必须在**返回 Observable 之前同步拒绝**，断言调用方从不订阅时业务表同样零变化（adapter-contract.md §1.1）
- [ ] T050 [P] [US2] 写红测试 `packages/rxdb/src/__tests__/working-tree/raw-bypass-judgment.spec.ts`：5 步判定每步一组用例；第 4 步断言**业务表零变化**（执行前拒绝，不是写完回滚）；用「列集无法解析」的语句断言 fail-closed（adapter-contract.md §2）
- [ ] T051 [P] [US2] 写红测试 `packages/rxdb/src/__tests__/working-tree/untracked-domain.spec.ts`：三类 untracked 各一组 + 「清单外的实体默认 tracked」；tracked 与 untracked 混进同一事务抛 `mixed_versioned_cache_transaction` 且**整事务回滚**；`origin='remote_sync'` **不是** untracked；untracked 是静态属性（conformance-suites.md §1.4）
- [ ] T052 [P] [US2] 写红测试 `packages/rxdb/src/__tests__/working-tree/entry-fold.spec.ts`：同一实体多次写入的折叠规则——patch 取最新、**inversePatch 取首次捕获值**、INSERT+DELETE 相抵、origin 取最新、**不做值级归零**；`entryCount` 与实际条目数的不变量断言（data-model.md §2.7）
- [ ] T053 [P] [US2] 写红测试 `packages/rxdb/src/__tests__/working-tree/crud-transaction.spec.ts`：每次普通 CRUD 在同事务内校验 active branch token、写业务实体、写/合并完整 `WorkingTreeEntry`、递增 `workingTreeRevision`；任一步失败全部回滚；**禁止**只靠内存 dirty set 重建（FR-039）
- [ ] T054 [P] [US2] 写红测试 `packages/rxdb/src/__tests__/working-tree/entry-encryption.spec.ts`：`WorkingTreeEntry` 延续字段加密 at-rest；解锁后读取可返回明文业务值，但持久化 dump / 错误 / 摘要无明文（FR-045）
- [ ] T055 [P] [US2] 写红测试 `packages/rxdb/src/__tests__/working-tree/trusted-callsite-registry.spec.ts`：登记表 9 行与真实代码一致；漂移扫描能报出「调用 `upsertMany` 但目标实体不是 QueryCache」的新增调用点；扫描排除 `dist/`、`out-tsc/`、`**/__tests__/**`、`*.suite.ts`、`*.spec.ts`（SC-010、adapter-contract.md §3）

### Implementation for User Story 2 阶段 A

- [ ] T056 [US2] 实现**单一份**版本化域清单于 `packages/rxdb/src/working-tree/versioned-domain.ts`：「版本化业务实体表」与「untracked 字段域」两个集合与 spec.md「版本化域」同源，**不得另建第二份**；QueryCache 实体完整排除（adapter-contract.md §2 实现约束）
- [ ] T057 [US2] 实现工作树条目写入与折叠于 `packages/rxdb/src/working-tree/write-entry.ts`，按 T052 的折叠规则，并同事务维护 `entryCount`（data-model.md §2.7）
- [ ] T058 [US2] 在 `packages/rxdb/src/rxdb-adapter.ts` 的 `transaction()`（:134）挂载捕获：提供原子边界，整事务共享同一 `unitId`（adapter-contract.md §1 挂载点 1）
- [ ] T059 [US2] 在 `packages/rxdb/src/rxdb-adapter.ts` 的**本地** `mergeChanges(actions, localChanges?, disableTriggers?)`（:200）挂载捕获，按签名与远端重载（:322）区分；`disableTriggers` 为真时**仍**写 `origin='remote_sync'` 单元且不形成 push echo（FR-046、挂载点 2）
- [ ] T060 [US2] 在 `packages/rxdb/src/rxdb-adapter.ts` 的 `switchBranch(options)`（:182）挂载捕获：分支物化与 redo 失效**不产生**单元，undo/redo **产生**单元（挂载点 3）
- [ ] T061 [US2] 在 `packages/rxdb/src/rxdb-adapter.ts` 的 `upsertMany()`（:239）与 `deleteByIds()`（:255）显式挂门禁，并在**返回 Observable 之前同步拒绝**；入参是整行而非列集，故对版本化实体一律落第 4 步（挂载点 4、adapter-contract.md §1.1）
- [ ] T062 [US2] 实现**共享的** 5 步 bypass 判定于 `packages/rxdb/src/working-tree/raw-write-judgment.ts`（含大小写 / 引号标识符 / schema 限定的词法归一化层，解析不出目标表或列集即按命中第 4 步的保守口径处理）（R4、adapter-contract.md §2）
- [ ] T063 [US2] 从 `packages/rxdb/src/index.ts` 导出 T062 的判定入口（`Commit*` / `WorkingTree*` 前缀），供适配器调用；`rawQuery?()` 在 `packages/rxdb/src/rxdb-adapter.ts:94` 是**可选方法**，判定不得假设它普遍存在
- [ ] T064 [US2] 在 6 个 v1 适配器各自的 `rawQuery` 实现中调用 T062 的共享判定（`packages/rxdb-adapter-pglite/src/`、`-wa-sqlite/src/`、`-sqlite-wasm/src/`、`-sqlite/src/`、`-sqliteai/src/`、`-electron/src/`）——**一份判定，六处调用**，不各写一份；没有 `rawQuery` 的适配器不因此获得豁免，其 `upsertMany` / `deleteByIds` 仍受 T061 约束
- [ ] T065 [US2] 给 9 个受信调用点加显式意图枚举（内部契约，**不进**公开 api-baseline）：`packages/rxdb/src/version/` 下的 `VersionManager.ts·switchBranch`、`restore-entity.ts·restore_entity`、`HistoryManager.ts·invalidateRedoStack`、`undo-redo-apply.ts·applyUndoRedoHistories`、`merge-branch.ts·merge_branch`（逐条与压缩**各一行**）、`pull-batch.ts·pullBatchOnce`、`pull-repository.ts·pullSingleRepository`、`cleanup-expired.ts·cleanupExpired`（adapter-contract.md §3）
- [ ] T066 [US2] 在 `scripts/audit/` 增加 `working-tree-callsite-drift.mjs` 与其 `.spec.mjs`：登记键 = 文件 + 符号 + 意图（符号取最内层具名函数，不是委托门面，不用行号）；未携带意图标记的批量重写一律按未知入口拒绝（R5、SC-010）
- [ ] T067 [US2] 实现 `workingTreeCaptureConformanceSuite` 于 `packages/rxdb/src/working-tree/testing/working-tree-capture.suite.ts`：覆盖 conformance-suites.md §1.1–§1.5 全部小节，每组末尾都跑冷重放不变量
- [ ] T068 [US2] 在 6 个 v1 适配器包各建实际调用点 `src/__tests__/working-tree-capture-conformance.spec.ts`，复用各包既有 factory 调用 T067 的套件（T044 的门禁会校验这 6 个调用点存在）

**Checkpoint**: 阶段 A 独立可验证。捕获完备（冷重放不变量全绿），raw / 批量写敞口被在执行前堵死，6 后端捕获套件全绿。

---

## Phase 5: User Story 2 — status / diff / commit / discard（US-306 阶段 B，Priority: P1）

**Goal**: 把已捕获的工作树暴露成可读可提交的操作面：**唯一一条** `HEAD ↔ 工作树` diff 轴、全量 commit（无 selection 入参）、整体 discard，并以调用方捕获型 CAS 保证跨 realm 正确性。

**Independent Test**: 修改 3 个实体后 `status()` 报 3 个未提交单元；`commit(message)` 之后工作树回到 clean 且新 commit 含**全部** 3 个单元；在 `status()` 与 `commit()` 之间由另一个 realm 写入工作树，本次 `commit()` 返回 `CommitConflict` 而非静默提交。

**Depends on**: Phase 4（阶段 A）——没有捕获就没有可读的工作树。

### Tests for User Story 2 阶段 B（先红）

- [ ] T069 [P] [US2] 写红测试 `packages/rxdb/src/__tests__/working-tree/status.spec.ts`：至少区分 clean / 有未提交变更 / 恢复中 / 冲突；普通命令 CAS 失败只返回一次性 `CommitConflict`，**不形成 durable conflicted**；`conflicted` 只由仍存在且 revision 已分叉的 `WorkingTreeRestoreSession` 重建（FR-004）
- [ ] T070 [P] [US2] 写红测试 `packages/rxdb/src/__tests__/working-tree/diff.spec.ts`：面向实体或完整事务的 diff，**只有 `HEAD ↔ 工作树` 一条轴**；断言不存在第二条轴的任何入口（FR-005）
- [ ] T071 [P] [US2] 写红测试 `packages/rxdb/src/__tests__/working-tree/commit-full-scope.spec.ts`：`commit()` 的签名**没有 selection 入参**（类型层断言），提交范围恒为当前分支工作树全部未提交单元；成功后**全部**已提交单元被清除、工作树回 clean、以新 commit 为基线，不存在残量与 rebase（FR-011/041、硬裁决 1）
- [ ] T072 [P] [US2] 写红测试 `packages/rxdb/src/__tests__/working-tree/commit-cas-captured.spec.ts`：commit 校验 active branch token + expected head + **调用方捕获的** expected `workingTreeRevision`，三者任一不匹配即全量回滚返回 `CommitConflict`；断言**不得**放宽为只校验 head；另含 SC-008 必备用例「另一个 Tab 在 status 与 commit 之间 `save()`」（FR-031）
- [ ] T073 [P] [US2] 写红测试 `packages/rxdb/src/__tests__/working-tree/crud-not-captured-cas.spec.ts`：**普通 CRUD 使用事务内读改写型 CAS，不得使用调用方捕获型**——与 FR-032 冲突的回归测试（R3、conformance-suites.md §2.3）
- [ ] T074 [P] [US2] 写红测试 `packages/rxdb/src/__tests__/working-tree/writer-identity-neutral.spec.ts`：工作树中的实体编辑不按 writer 身份分叉；跨 realm 与本 realm 平等成为同一份工作树的未提交变更；writer 身份不是提交正确性的必要条件（FR-032）
- [ ] T075 [P] [US2] 写红测试 `packages/rxdb/src/__tests__/working-tree/discard.spec.ts`：`discardWorkingTree()` 把当前分支工作树整体回到当前 HEAD；已 clean 时是 no-op；同样校验 active token 与 expected working-tree revision（FR-016/031）
- [ ] T076 [P] [US2] 写红测试 `packages/rxdb/src/__tests__/working-tree/commit-atomicity.spec.ts`：commit 中途崩溃后恢复，**不出现**半个 commit、半个事务或半清空的工作树（FR-010、SC-007、conformance-suites.md §2.4）
- [ ] T077 [P] [US2] 写红测试 `packages/rxdb/src/__tests__/working-tree/commit-corruption-entry.spec.ts`：`commit()` 复用 US-305 的**同一份**守卫（T038），可达损坏时拒绝、保留原 ref、不删记录（FR-051、横切约束 6）

### Implementation for User Story 2 阶段 B

- [ ] T078 [US2] 实现 `status()` 于 `packages/rxdb/src/working-tree/status.ts`，用 `WorkingTreeState.entryCount` 冗余列做常数时间摘要（SC-001 的预算依赖这一点），并配 `entryCount` 与实际条目数的不变量断言（data-model.md §2.6）
- [ ] T079 [US2] 实现 `diff()` 于 `packages/rxdb/src/working-tree/diff.ts`：单轴 `HEAD ↔ 工作树`，支持实体与完整事务两种粒度（FR-005，接口见 contracts/core-api.md §3）
- [ ] T080 [US2] 实现 `commit(message, options)` 于 `packages/rxdb/src/working-tree/commit-command.ts`：`CommitOptions` 必填 `authorId` / `operationId`，metadata 只放扩展审计字段，不得覆盖 parent / 时间 / 作者 / operation ID / schema-codec manifest / 变更数量；**签名中没有 selection 入参——这是 v1 硬裁决，不是签名未完成**（FR-041，契约见 contracts/core-api.md §4）
- [ ] T081 [US2] 实现同事务清空全部已提交工作树单元于 `packages/rxdb/src/working-tree/commit-command.ts`（与 T080 同文件，接在写 commit 之后）：清空与写 commit 在**同一事务**，不得异步或延迟（FR-011、SC-007）
- [ ] T082 [US2] 定义 `CommitConflict` 类型、补齐 TSDoc、登记进 `requirements/api-baseline/rxdb.json` 于 `packages/rxdb/src/working-tree/commit-conflict.ts`：从失败操作、对象 ID、expected/actual revision 与建议动作派生；**它是一次失败命令的类型化诊断值，不是持久状态**，不得建第二张可漂移的冲突表，**也不得自动重试**（FR-035 由首个使用者定义，contracts/core-api.md §4.1、data-model.md §7）
- [ ] T083 [US2] 实现 `discardWorkingTree()` 于 `packages/rxdb/src/working-tree/discard-command.ts`（FR-016）
- [ ] T084 [US2] 在 `commit()` 与 `discard()` 的写事务内调用 T038 的共享损坏守卫（`packages/rxdb/src/working-tree/commit-command.ts` / `discard-command.ts`），不另写判定（FR-051）
- [ ] T085 [US2] 扩展 `packages/rxdb/src/working-tree/testing/working-tree-commit.suite.ts`：补 conformance-suites.md §2.3（两类 CAS 分开 + FR-032 回归）与 §2.4（commit 原子性），6 个适配器的既有调用点（T043）自动带上新用例

**Checkpoint**: 阶段 B 独立可交付。status / diff / commit / discard 语义完整，跨 realm CAS 生效，6 后端两套套件全绿。

---

## Phase 6: User Story 2 — 三框架入口与 benchmark（US-306 阶段 C，Priority: P1）

**Goal**: 把阶段 B 的核心操作面对称地暴露到 Angular / React / Vue，并冻结性能门禁基线。

**Independent Test**: 三端各自的 `*.spec.ts` 覆盖 tri-framework-api.md §3 清单每一项；`bench-working-tree` 产出符合 contracts/benchmark-report.md §2 的 JSON，且相对门禁在 PR CI 上可执行。

**Depends on**: Phase 5（阶段 B）。

### Tests for User Story 2 阶段 C（先红）

- [ ] T086 [P] [US2] 写红测试 `packages/rxdb-angular/src/__tests__/use-working-tree.spec.ts`：覆盖 tri-framework-api.md §3 清单每一项（`isEnabled`/`enable`、`status` 及响应式形式、`diff`、`commit`、`discard`、`listCommits`、`restore`、`restoreSession`、`switchBranch` 的 `WorkingTreeSwitchBranchOptions`）
- [ ] T087 [P] [US2] 写红测试 `packages/rxdb-react/src/__tests__/use-working-tree.spec.ts`：同上清单
- [ ] T088 [P] [US2] 写红测试 `packages/rxdb-vue/src/__tests__/use-working-tree.spec.ts`：同上清单
- [ ] T089 [P] [US2] 写红测试 `packages/rxdb/src/__tests__/working-tree/async-state.spec.ts`：命令暴露 loading / success / error，查询在无结果时额外暴露 empty；**不给无 empty 语义的命令伪造 empty**——`commit()` 没有「空成功」，零未提交变更时是明确的 no-op 结果（FR-023、tri-framework-api.md §4）

### Implementation for User Story 2 阶段 C

- [ ] T090 [US2] 实现 Angular 入口 `useWorkingTree()` 于 `packages/rxdb-angular/src/use-working-tree.ts` 并从 `packages/rxdb-angular/src/index.ts` 导出：运行期形态按框架惯例（signal / computed），共享核心类型**再导出不重定义**（tri-framework-api.md §1）
- [ ] T091 [US2] 实现 React 入口 `useWorkingTree()` 于 `packages/rxdb-react/src/use-working-tree.ts` 并从 `packages/rxdb-react/src/index.ts` 导出
- [ ] T092 [US2] 实现 Vue 入口 `useWorkingTree()` 于 `packages/rxdb-vue/src/use-working-tree.ts` 并从 `packages/rxdb-vue/src/index.ts` 导出
- [ ] T093 [US2] 更新三份公开面基线 `requirements/api-baseline/rxdb-{angular,react,vue}.json`：三端无 `Workspace*` 新导出、不复用既有 `SwitchBranchOptions`、`useWorkingTree()` 按负向规则合规（SC-014、tri-framework-api.md §2）
- [ ] T094 [US2] 写固定 fixture 于 `benchmarks/working-tree-fixture.ts`：10,000 实体 / 100 commit / 每 commit 100 单元 / 当前工作树 100 未提交单元，并输出 `contentHash`（内容 hash，不是行数）（benchmark-report.md §1）
- [ ] T095 [US2] 写 `benchmarks/working-tree.bench.ts`：Node + PGlite memory、WARMUP=5 / SAMPLES=50，测完整 status、完整 diff、一次提交 100 单元的 commit；每项配**同一次运行内**采样的 control CRUD（相同实体数量与事务边界），输出 p50/p95/max/ratio 与 `runnerProfileHash`，JSON 结构照 benchmark-report.md §2
- [ ] T096 [US2] 在 `benchmarks/project.json` 增加 `bench-working-tree` target（照既有 `bench-encryption` / `bench-hot-path` 形态：`nx:run-commands` + `dependsOn: ["typecheck", "^build"]`）
- [ ] T097 [US2] 冻结 reference 并落盘 `benchmarks/reports/working-tree-reference.json`：**10 次独立运行取 median ratio**，同批写入 `frozenAbsolute.commit`（commit 的绝对预算由首个绿色实现的中位数冻结，**不套用 status/diff 的 100 ms**——已批准的宪法例外，见 plan.md Complexity Tracking）；接上相对门禁（ratio ≤ reference median 的 110%，PR CI 的**唯一**硬门禁）。**reference 必须先于发布候选签入**；review 不接受该中位数时回到 plan.md 更新例外或改设计，**不得在失败后重算基线**

**Checkpoint**: US-306 三个阶段全部关闭。三端对称、性能门禁可执行。

---

## Phase 7: User Story 3 — 历史恢复会话（US-307，Priority: P2）

**Goal**: 把可达历史 commit 恢复进当前工作树，成为与手写变更同形的未提交变更；不移动 HEAD、不改写历史。

**Independent Test**: 在 clean 工作树上 `restore('HEAD~1')` 后，`listCommits()` 的父链与 HEAD 完全未变，而 `status()` 报出恢复产生的未提交单元；随后 `commit(message)` 把工作树整体落成新 commit，restore session 原子转为 `committed`。

**Depends on**: Phase 5（阶段 B）——核心持久层语义**可与 Phase 6（阶段 C）并行开工**；但 T109/T110 的三框架入口 **MUST** 排在 Phase 6 之后。

### Tests for User Story 3（先红）

- [ ] T098 [P] [US3] 写红测试 `packages/rxdb/src/__tests__/working-tree/restore-basic.spec.ts`：恢复可达历史 commit 到当前工作树；默认**不移动 HEAD、不删历史**；会话持久化；不提供 detached HEAD / checkout 到历史 commit（FR-013、contracts/core-api.md §5）
- [ ] T099 [P] [US3] 写红测试 `packages/rxdb/src/__tests__/working-tree/restore-dirty-guard.spec.ts`：恢复前检测 dirty 工作树；未显式处理未提交变更时拒绝并保持原状；判定口径只有 clean / dirty 两态（FR-014）
- [ ] T100 [P] [US3] 写红测试 `packages/rxdb/src/__tests__/working-tree/restore-entry-shape.spec.ts`：恢复结果写成普通 `WorkingTreeEntry`，与手写变更**同形、同表、同 revision 轴**；不存在「已恢复但未暂存」这一额外状态；`commit()` 不接受任何只提交恢复结果子集的参数（FR-015）
- [ ] T101 [P] [US3] 写红测试 `packages/rxdb/src/__tests__/working-tree/restore-compat-precheck.spec.ts`：在任何持久写入前选定确定性物化路径，校验路径上**每个** ChangeSet 的 schema fingerprint manifest 与 change codec version 与当前客户端完全相等；拒绝时持久状态零变化；错误稳定返回首个不兼容 commit ID、重放方向、实体与版本 manifest；检查期间不解码或写入后续 ChangeSet（FR-033/050）
- [ ] T102 [P] [US3] 写红测试 `packages/rxdb/src/__tests__/working-tree/restore-session-cas.spec.ts`：初次 restore 要求 clean、成功只递增 working-tree revision、CAS 失败全部回滚且不创建 session；已有 session 的 commit/discard CAS 失败时保留工作树与 session，并由 expected/actual revision 派生 conflicted，**不自动选择任一 writer 的状态**；会话上的 commit 同样是**调用方捕获型** CAS（FR-034）
- [ ] T103 [P] [US3] 写红测试 `packages/rxdb/src/__tests__/working-tree/restore-noop.spec.ts`：restore 产生的完整 diff 为空时返回 no-op，不创建 session、不创建条目、不递增任何 revision（FR-042）
- [ ] T104 [P] [US3] 写红测试 `packages/rxdb/src/__tests__/working-tree/restore-encryption.spec.ts`：restore 物化与 session 持久化保持加密 envelope；错误、摘要与 session 诊断无明文（FR-043）

### Implementation for User Story 3

- [ ] T105 [US3] 实现兼容性预检于 `packages/rxdb/src/working-tree/restore-precheck.ts`：覆盖**完整** commit 路径而非只有目标节点，先检查后写入，命中不兼容即零变化返回（FR-033/050）
- [ ] T106 [US3] 实现 `restore()` 与会话持久化于 `packages/rxdb/src/working-tree/restore-command.ts`：写普通 `WorkingTreeEntry`、用 `activeKey` 可空唯一列保证每分支至多一个未结束会话、在写事务内调用 T038 的共享损坏守卫（FR-013/015/034/051、data-model.md §2.8）
- [ ] T107 [US3] 实现会话终态转换于 `packages/rxdb/src/working-tree/restore-session-transitions.ts`：`commit()` 与 session 的 `committed` 转换**原子提交**；`discard` 路径对称；新 commit 不改写被恢复的历史节点（FR-015）
- [ ] T108 [US3] 扩展 `packages/rxdb/src/working-tree/testing/working-tree-commit.suite.ts` 的 conformance-suites.md §2.6（restore）小节；6 个适配器既有调用点自动带上
- [ ] T109 [US3] 在 `benchmarks/working-tree.bench.ts` 增加 restore 测量项：恢复含 100 个完整变更单元的 `HEAD~1`，WARMUP=5 / SAMPLES=50，记录 runner profile；接入相对门禁，绝对 p95 ≤ 1 s 只在 `runnerProfileHash` 匹配的固定性能 runner 上作为发布硬门禁（FR-026b、SC-004）
- [ ] T110 [US3] **（排在 Phase 6 之后）** 把 `restore()` / `restoreSession()` 接进三端入口 `packages/rxdb-{angular,react,vue}/src/use-working-tree.ts`，并补三端 `*.spec.ts` 用例；任一端缺一项 = 未完成（tri-framework-api.md §3）

**Checkpoint**: US-307 独立可交付。恢复语义完整且不改写历史。

---

## Phase 8: User Story 4 — 分支隔离与跨 realm 冲突检测（US-308，Priority: P2）

**Goal**: 分支各自持有独立工作树与 HEAD，切换、删除、metadata-only 远端分支首次物化都在持久 CAS 保护下进行。

**Independent Test**: 两个分支各自积累未提交变更后互相切换，各自工作树不串；删除并同名重建分支后，旧 `operationId` 不与新 generation 碰撞（ABA）；metadata-only 远端分支首次 switch 在分页崩溃后可恢复，依据不足时以 `branch_not_materialized` 全量回滚且来源分支保持 active。

**Depends on**: Phase 5（阶段 B）——核心持久层语义**可与 Phase 6（阶段 C）并行开工**；但 T123 的三框架入口 **MUST** 排在 Phase 6 之后。

### Tests for User Story 4（先红）

- [ ] T111 [P] [US4] 写红测试 `packages/rxdb/src/__tests__/version/switch-branch-working-tree.spec.ts`：`createBranch(branchId)` 从当前物化状态创建并复制独立 working-tree snapshot、共享当前 HEAD；`createBranch(branchId, fromChangeId)` 以 `kind=branch_baseline` 锚定；分支**不共享可变 HEAD / 工作树**；切换恢复目标分支状态（FR-017）
- [ ] T112 [P] [US4] 写红测试 `packages/rxdb/src/__tests__/version/switch-branch-options.spec.ts`：clean 检查由 `WorkingTreeSwitchBranchOptions.requireClean` **显式提供**，不带选项仍无条件切换；类型层断言新选项**不复用**既有 `SwitchBranchOptions`（`packages/rxdb/src/rxdb-adapter.ts:55`）（FR-017、R6、SC-014）
- [ ] T113 [P] [US4] 写红测试 `packages/rxdb/src/__tests__/working-tree/activation-cas.spec.ts`：持久化 activation / head / working-tree revision CAS 阻止跨标签页静默覆盖；普通 CRUD 校验实体/realm **捕获的** active branch token；不得在事务中重新读取新 active branch 后把旧实体归到新分支；不得只依赖 `BroadcastChannel` 或内存状态（FR-020）
- [ ] T114 [P] [US4] 写红测试 `packages/rxdb/src/__tests__/working-tree/remove-branch-aba.spec.ts`：`removeBranch()` 原子删除该分支全部可变状态与 materialization attempt，**保留不可变 commit**；同名重建使用新 `generation`，旧幂等键不碰撞（FR-044、data-model.md §2.5）
- [ ] T115 [P] [US4] 写红测试 `packages/rxdb/src/__tests__/version/metadata-only-branch-switch.spec.ts`：`syncBranches()` 只同步 metadata 时不提前伪造 baseline / ref；没有 `CommitBranchRef` 的 metadata-only 远端分支**不是空 HEAD**；首次 switch 用独立 durable staging 冻结目标分支、终止水位与完整配置 sync scope，逐页持久化 payload/fingerprint 且**不触碰当前投影**（FR-044/049）
- [ ] T116 [P] [US4] 写红测试 `packages/rxdb/src/__tests__/version/materialization-barrier.spec.ts`：「复核 active token、目标身份、水位/scope/fingerprint、完整物化、创建 `kind=branch_baseline`、创建 ref、切换 active、递增 activation revision、删除 staging」在**同一提交屏障**内；依据不足以 `branch_not_materialized` 全量回滚、来源分支保持 active；分页崩溃可恢复、staging 可按 attempt 清理（FR-044）
- [ ] T117 [P] [US4] 写红测试 `packages/rxdb/src/__tests__/working-tree/switch-to-corruption.spec.ts`：switch-to 复用 T038 的**同一份**守卫，可达损坏时返回 `commit_graph_corrupted`、不改指针、不删记录；「切离」损坏分支不受影响（FR-051、SC-013）

### Implementation for User Story 4

- [ ] T118 [US4] 定义 `WorkingTreeSwitchBranchOptions` 于 `packages/rxdb/src/working-tree/switch-branch-options.ts` 并作为**可选第二形参**加进 `packages/rxdb/src/version/VersionManager.ts:740` 的 `switchBranch(branchId)`（纯扩展，既有调用点零改动）（FR-017、R6、contracts/core-api.md §6）
- [ ] T119 [US4] 实现 activation revision 递增与 token 校验于 `packages/rxdb/src/working-tree/activation-cas.ts`（表行由 T009/T033 提供），并把 activation 维度**扩展进**已有的 `CommitConflict`（T082）——**不重新定义类型、不新建并行诊断类型**（FR-020/035）
- [ ] T120 [US4] 实现分支创建与切换时的独立工作树快照于 `packages/rxdb/src/version/create-branch.ts` 与 `packages/rxdb/src/version/switch-branch-actions.ts`（复用既有 `switch_branch_actions` / `get_switch_version_actions` / `find_switch_branch_step`，不另写重放引擎）（FR-017、R11）
- [ ] T121 [US4] 实现 `removeBranch()` 的原子清理与 generation 推进于 `packages/rxdb/src/version/remove-branch.ts`：删可变状态与 materialization attempt，保留不可变 commit，从 `WorkingTreeActivationState.branchGenerationSeq` 取新 generation（FR-044）
- [ ] T122 [US4] 实现 metadata-only 远端分支首次物化于 `packages/rxdb/src/working-tree/branch-materialization.ts`：staging + 分页 payload（表由 T016/T017 提供）、单一提交屏障、`branch_not_materialized` 全量回滚、按 attempt 清理；扩展 `working-tree-commit.suite.ts` 的 conformance-suites.md §2.7（分支隔离与 ABA）（FR-044/049）
- [ ] T123 [US4] **（排在 Phase 6 之后）** 把 `switchBranch` 的 `WorkingTreeSwitchBranchOptions` 接进三端入口 `packages/rxdb-{angular,react,vue}/src/use-working-tree.ts`，并补三端 `*.spec.ts` 用例（tri-framework-api.md §3）

**Checkpoint**: 四条故事全部独立可用。

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T124 [P] 在 `packages/rxdb/README.md` 与 `website/` 公开文档写清**六项**：数据库级显式启用、工作树与 `@aiao/rxdb-plugin-workspace` 草稿缓存的区别、恢复语义、历史保留敏感旧值的风险、加密边界、不改写历史的承诺；并**明示远端同步会产生 `origin=remote_sync` 的未提交变化**（SC-015）
- [ ] T125 [P] 在公开文档写明能力边界：绕过 adapter 的外部数据库句柄拦不住，v1 也不承诺拦得住（adapter-contract.md §4）——不假装拦得住比拦不住更重要
- [ ] T126 [P] 跑 `node scripts/audit/api-surface.mjs` 与 `requirements/api-baseline/rxdb.json` 比对，确认核心新增导出全部 `Commit*` / `WorkingTree*` 前缀、**零 `Index*` 新导出**、无 `Workspace*` 新导出（SC-014、contracts/core-api.md §0）
- [ ] T127 [P] 跑 `node scripts/audit/coverage-check.mjs`（覆盖率**单一真相源**，不另设阈值），补齐未达标模块的单测
- [ ] T128 [P] 三端 a11y：Playwright 跑 `apps/dev-rxdb-{angular,react,vue}-e2e` 的工作树面板用例，WCAG 2.1 AA（键盘可达、焦点可见、状态变化对读屏可感知），并记录**首次可见状态耗时**（SC-005、tri-framework-api.md §4）
- [ ] T129 [P] 跑 `node scripts/audit/requirements-consistency.mjs`，更新 `requirements/status-overview.md` 与四条 story 的状态位（SC-016：US-306 的阶段 A / B / C 全部关闭，交付阶段与边界表逐条有归属）
- [ ] T130 全矩阵回归：`pnpm nx run-many -t test --projects=rxdb,rxdb-adapter-pglite,rxdb-adapter-wa-sqlite,rxdb-adapter-sqlite-wasm,rxdb-adapter-sqlite,rxdb-adapter-sqliteai,rxdb-adapter-electron` 确认 6 后端 × 2 套件双双全绿（SC-006）
- [ ] T131 按 `specs/001-working-tree-commits/quickstart.md` §3 逐条跑完 3.1–3.10 十个验证场景，把结果记进该文件的执行记录
- [ ] T132 最终性能门禁：跑 `pnpm nx run benchmarks:bench-working-tree`，确认相对 ratio ≤ reference median 的 110%；若在 `runnerProfileHash` 匹配的固定性能 runner 上，另行确认 status/diff p95 ≤ 100 ms、restore p95 ≤ 1 s（commit 按 T097 冻结的绝对中位数，不套用 100 ms）
- [ ] T133 发布说明补一条**已知影响**：`RXDB_SYSTEM_SCHEMA_VERSION` 3 → 4 之后，旧版本客户端打开该库会按既有 `UnsupportedRxDBSystemVersionError` 拒绝（2 → 3 同样如此，不是新增危险面）——写进 `requirements/release-plan.md`。**本任务只写说明，不执行任何发布动作**

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**：无依赖，可立即开始
- **Foundational (Phase 2)**：依赖 Setup — **阻塞所有用户故事**
- **US-305 (Phase 3)**：依赖 Foundational
- **US-306 阶段 A (Phase 4)**：依赖 Phase 3
- **US-306 阶段 B (Phase 5)**：依赖 Phase 4
- **US-306 阶段 C (Phase 6)**：依赖 Phase 5
- **US-307 (Phase 7)** / **US-308 (Phase 8)**：核心持久层任务依赖 Phase 5，**可与 Phase 6 并行**；但 **T110 与 T123 两个三框架入口任务 MUST 排在 Phase 6 之后**
- **Polish (Phase 9)**：依赖上述全部

### 交付顺序（硬约束）

```text
US-305 ──► US-306 阶段 A ──► US-306 阶段 B ──┬──► US-306 阶段 C ──┬──► T110（US-307 三端入口）
                                              │                    └──► T123（US-308 三端入口）
                                              ├──► US-307 核心（T098–T109）
                                              └──► US-308 核心（T111–T122）
```

### 关键跨任务依赖

- T018（`SYSTEM_ENTITIES` 追加）依赖 T008–T017 全部完成——单文件顺序修改，**不可并行**
- T019（schema 3→4 单条迁移）依赖 T018；全有或全无，任一分支初始化失败即停在 v3
- T038（共享损坏守卫）是 T077 / T084 / T106 / T117 的共同前置——**四处复用同一份，不得各写一份**
- T056（单一版本化域清单）是 T062 与 T067 的前置——**不得另建第二份清单**
- T062（共享 5 步判定）是 T064 六处调用的前置
- T082（`CommitConflict` 定义）是 T119（activation 维度扩展）的前置——扩展既有类型，不新建并行类型
- T042 / T067（两套套件）是 T043 / T068（6 适配器调用点）的前置；T044（调用点门禁）在两者之后
- T097（reference 冻结）**必须先于任何发布候选签入**，且 T109 的 restore 测量项接入同一份 reference

### Within Each User Story

- 测试先写、先看红，再写实现
- 实体声明 → 写入路径 → 命令面 → 套件 → 适配器调用点
- 故事收口后再进入下一优先级

### Parallel Opportunities

- Phase 1 的 T002 / T003 / T004 可并行（不同文件）
- Phase 2 的 T005–T007（三份红测试）与 T008–T017（十个实体类，各自独立文件）可并行；**T018 起串行**
- 每个故事的测试任务组（T022–T030、T046–T055、T069–T077、T086–T089、T098–T104、T111–T117）各自组内可并行
- T090 / T091 / T092 三端实现可并行（三个包互不依赖）
- US-307 核心（T098–T109）与 US-308 核心（T111–T122）可由两人并行推进
- Phase 9 的 T124–T129 可并行；T130–T133 串行收口

---

## Parallel Example: Foundational（Phase 2）

```bash
# 先并行写三份红测试：
Task: "断言 10 个新实体在 SYSTEM_ENTITIES 中且 log===false，in packages/rxdb/src/__tests__/system/working-tree-system-entities.spec.ts"
Task: "断言 schema 3→4 与每分支初始行，in packages/rxdb/src/__tests__/system/working-tree-schema-migration.spec.ts"
Task: "断言两张表不引用 RxDBChange，in packages/rxdb/src/__tests__/system/working-tree-storage-contract.spec.ts"

# 看到红之后，并行声明十个实体类（各自独立文件）：
Task: "声明 CommitCapabilityState in packages/rxdb/src/commit/commit-capability-state.entity.ts"
Task: "声明 WorkingTreeActivationState in packages/rxdb/src/working-tree/working-tree-activation-state.entity.ts"
Task: "声明 Commit in packages/rxdb/src/commit/commit.entity.ts"
Task: "声明 CommitChangeSet in packages/rxdb/src/commit/commit-change-set.entity.ts"
Task: "声明 CommitBranchRef in packages/rxdb/src/commit/commit-branch-ref.entity.ts"
Task: "声明 WorkingTreeState in packages/rxdb/src/working-tree/working-tree-state.entity.ts"
Task: "声明 WorkingTreeEntry in packages/rxdb/src/working-tree/working-tree-entry.entity.ts"
Task: "声明 WorkingTreeRestoreSession in packages/rxdb/src/working-tree/working-tree-restore-session.entity.ts"
Task: "声明 WorkingTreeMaterializationStage in packages/rxdb/src/working-tree/working-tree-materialization-stage.entity.ts"
Task: "声明 WorkingTreeMaterializationPage in packages/rxdb/src/working-tree/working-tree-materialization-page.entity.ts"

# 然后串行：T018（追加 SYSTEM_ENTITIES）→ T019（单条迁移 + 版本 bump）
```

## Parallel Example: 6 适配器接入（Phase 4 / T064）

```bash
Task: "在 rawQuery 中调用共享 5 步判定 in packages/rxdb-adapter-pglite/src/"
Task: "在 rawQuery 中调用共享 5 步判定 in packages/rxdb-adapter-wa-sqlite/src/"
Task: "在 rawQuery 中调用共享 5 步判定 in packages/rxdb-adapter-sqlite-wasm/src/"
Task: "在 rawQuery 中调用共享 5 步判定 in packages/rxdb-adapter-sqlite/src/"
Task: "在 rawQuery 中调用共享 5 步判定 in packages/rxdb-adapter-sqliteai/src/"
Task: "在 rawQuery 中调用共享 5 步判定 in packages/rxdb-adapter-electron/src/"
```

---

## Implementation Strategy

### MVP First（只做 US-305）

1. 完成 Phase 1 Setup
2. 完成 Phase 2 Foundational（**关键——阻塞所有故事**）
3. 完成 Phase 3 US-305
4. **停下来验证**：按 quickstart.md §3.1 独立验证 US-305——启用后重启，提交图与 HEAD 可恢复；未启用时行为与 v3 逐条相同
5. 可交付：一个能持久化提交图与 HEAD、损坏 fail-closed 的核心底座（**无 UI**）

### Incremental Delivery

1. Setup + Foundational → 地基就绪（`enabled=false`，零行为差异）
2. US-305 → 独立验证 → **MVP**
3. US-306 阶段 A → 冷重放不变量全绿 → 捕获完备
4. US-306 阶段 B → status / diff / commit / discard 可用
5. US-306 阶段 C → 三端对称 + 性能基线冻结
6. US-307 与 US-308 → 恢复会话与分支隔离（核心可并行，三端入口在阶段 C 之后）
7. Polish → 文档、门禁、全矩阵回归

### Parallel Team Strategy

阶段 B 完成后（T085 绿）：

- 开发者 A：US-306 阶段 C（T086–T097，三端入口 + benchmark）
- 开发者 B：US-307 核心（T098–T109）
- 开发者 C：US-308 核心（T111–T122）
- A 收口后，B 与 C 各自补 T110 / T123 的三端入口

---

## Notes

- `[P]` = 不同文件、无未完成依赖
- `[Story]` 标签用于可追溯性；映射见文首表
- 每个故事独立可完成、可测试
- **先验证测试是红的再写实现**（constitution v2.0.2 II）
- 提交时机由维护者决定；本任务链不含任何 `git commit` / `git push` / npm release 步骤
- 遇到任何「是不是该加个暂存区就好办了」的诱惑：**不加**。spec.md 硬裁决 3 已把 `CommitConflict` 的代价明确接受为 v1 的已知代价
