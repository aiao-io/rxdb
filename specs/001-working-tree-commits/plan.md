# Implementation Plan: 本地工作树与提交历史

**Branch**: `next-0912` | **Date**: 2026-09-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-working-tree-commits/spec.md`

> **本轮是就地重生成**。旧 plan.md 及其全部下游 artifact 按已作废的「工作树 → 缓存区 → 提交」三层模型写成（169 处陈旧命中），整体改写为 v1 的**无暂存区**模型。旧文中关于 index 自包含重放、依赖闭包、环检测（`index_dependency_cycle`）、staged snapshot 冻结、`HEAD ↔ index` 第二条 diff 轴的全部结论**作废**，不在本文件中承接。

## Summary

把 RxDB 的本地变更组织成 Git 式工作流：提交图与 HEAD 持久化、工作树捕获全部业务写入口、`status` / `diff` / `commit` / `discard`、历史恢复（restore）、分支隔离与跨 realm 冲突检测；刷新、重启与崩溃后语义一致。不引入远程仓库、权限与代码评审。

技术路线（依据见 [research.md](./research.md)）：

1. **捕获挂在适配器写原语层**，不是 Repository 层——唯一能同时覆盖 4 个原语（`transaction` / 本地 `mergeChanges` / `switchBranch` / `upsertMany`·`deleteByIds`）并拿到同事务原子边界的位置（R1）。
2. **`WorkingTreeEntry` 独立完整复制** patch / inverse patch，不复用也不只引用 `RxDBChange`——后者会被四条既有路径删除或失效（R2）。
3. **两类 CAS 分开**：commit / restore / discard / switch / merge / undo / redo / create·remove branch 是**调用方捕获型**；普通 CRUD 与 remote entity apply 是**事务内读改写型**。普通 CRUD 用捕获型会直接违反 FR-032（R3）。
4. **一份 bypass 判定，6 后端共用**，方言差异只在词法归一化层；`upsertMany()` / `deleteByIds()` 因不经 `rawQuery` 必须显式挂载，且因返回 `Observable` 必须在订阅前同步拒绝（R4）。
5. **损坏守卫单一实现**，commit / restore / switch-to 三入口在各自写事务内调用同一份（R10）。

交付顺序是硬约束：**US-305 → US-306 阶段 A → 阶段 B → 阶段 C →（US-307 ∥ US-308）**。US-307 / US-308 的核心持久层语义可与阶段 C 并行开工，但其三框架入口必须排在阶段 C 之后。

## Technical Context

**Language/Version**: TypeScript 6.0+ strict, ESM

**Primary Dependencies**: Nx 23 + pnpm 10；RxJS 7.8+；Angular 22+ / React 19+ / Vue 3.5+

**Storage**: SQL / PGlite 主库是 commit 与工作树元数据的**唯一一致性边界**。v1 支持矩阵 **6 个后端**：PGlite、wa-sqlite、sqlite-wasm、sqlite、sqliteai、Electron `node:sqlite` host。Workspace 插件的 NEW 草稿留在独立 IndexedDB，不参与系统 schema 事务。

**Testing**: Vitest（unit / integration，`*.spec.ts` 与源码同目录）+ Playwright（e2e / a11y）。两套具名 conformance 套件 `workingTreeCaptureConformanceSuite` / `workingTreeCommitConformanceSuite` 跨 6 后端运行（R7）。

**Target Platform**: 浏览器（OPFS / IDB）+ Node 26+ + Electron。`rxdb-adapter-tauri`（Rust host）与 `rxdb-adapter-miniprogram` **不入 v1 矩阵**。

**Project Type**: Library monorepo（核心包 + 三框架绑定 + 多存储适配器）

**Performance Goals**: 双门禁（R8）。普通 PR CI **唯一**硬门禁 = 归一化 ratio ≤ 冻结 reference median 的 110%。绝对 p95 **仅发布门禁**且仅在 `runnerProfileHash` 匹配的固定性能 runner 上：status / diff ≤ 100 ms、restore ≤ 1 s。**commit 不套用 100 ms**（已批准例外，见 Complexity Tracking）。

**Constraints**: 无暂存区；只有一条 diff 轴 `HEAD ↔ 工作树`；`commit()` 无 selection 入参；禁止 `Index*` / `Workspace*` 前缀导出；不得复活 `stagedChange` / `unstageChange` / `stagedCount` / `WorkspaceCacheEntry.staged`；`switchBranch()` 现有默认行为不变；加密 at-rest envelope 不降级；损坏分支 fail-closed。

**Scale/Scope**: 4 条 story（2×P1 + 2×P2），US-306 分 3 个不可并行阶段；45 条生效 FR + 7 条墓碑编号；17 条 SC；9 行受信调用点登记表；6 后端 × 2 套件。

## Constitution Check

_GATE: 依据 [.specify/memory/constitution.md](../../.specify/memory/constitution.md) v2.0.2。Phase 0 前已过，Phase 1 设计后已复检。_

### I. Code Quality — ✅ PASS

- TS strict 零错误 / 零 ESLint 警告 / 嵌套 ≤ 3 层 / 禁 `any`：常规约束，无本特性专属豁免。
- **TSDoc 覆盖每个 `packages/*` 导出符号**：本特性新增导出集中在 `packages/rxdb`（核心契约）与三框架包（入口）。`CommitConflict` 的 TSDoc 与 api-baseline 登记归 **US-306 阶段 B**（首个使用者），US-308 只扩展 activation 维度，不重新定义。
- **无防御性兜底**：与本特性的 fail-closed 立场一致——bypass 判定「解析不确定即拒绝」、损坏分支「不自动回退到较早 commit / 空工作树 / 内存模式」、迁移「任一分支不可物化即整体失败」。这些是**显式拒绝**，不是 fallback。
- **无无关联 issue 的 TODO**：7 个裁撤 FR 编号以墓碑形式记录在 spec.md，不留 TODO。

### II. Testing Standards — ✅ PASS

- **TDD 红 → 绿 → 重构强制**。每个阶段先写失败测试：阶段 A 先写「写入口未捕获 → 重放缺项」的红测试，阶段 B 先写「status 后 save 再 commit → 必须 `CommitConflict`」的红测试（SC-008 点名要求这条用例）。
- **覆盖率单一真相源 = [scripts/audit/coverage-check.mjs](../../scripts/audit/coverage-check.mjs)**：`rxdb` / `rxdb-angular` / `rxdb-react` / `rxdb-vue` 四指标 ≥ 90%，其余包 ≥ 80%。本特性不新增阈值、不改基线口径。
- **测试确定性**：benchmark 的环境指纹机制（`runnerProfileHash` 不匹配即 `benchmark_environment_mismatch`）正是为避免把环境差异伪装成回归；conformance 套件跨 6 后端跑同一份断言。
- `*.spec.ts` 与源码同目录；扫描门禁排除 `*.spec.ts` / `*.suite.ts` / `__tests__/` / `dist/` / `out-tsc/`。

### III. UX Consistency — ✅ PASS

- **三框架功能等价强制**：US-306 阶段 C、US-307、US-308 的用户操作面必须三端齐全，单端缺失 = 未完成。US-305 与 US-306 阶段 A/B 是无 UI 核心底座，只要求核心公开类型、TSDoc 与类型契约测试（spec.md 横切约束 1 已按故事界定适用范围）。
- **公开 API 形状对称**：三端同名同语义；运行时形状按各框架既有约定（R12）。命名门禁对三框架包只适用**负向**规则，`useWorkingTree()` 合规。
- **loading / empty / error / a11y WCAG 2.1 AA**：横切约束 2、3 + FR-023 + SC 对应项。不给无 empty 语义的命令伪造 empty。
- **Never break userspace**：`VersionManager.switchBranch(branchId)` 当前**无 options 形参**（`VersionManager.ts:740`），新增**可选**第二形参 `WorkingTreeSwitchBranchOptions`，不带该选项时行为与今天逐字节一致（FR-017、R6）。未启用提交能力的数据库**零行为差异**（FR-046 第 13 条场景）。

### IV. Performance Requirements — ⚠️ PASS WITH APPROVED EXCEPTION

- 默认预算 query < 16 ms、DB op < 100 ms、bundle < 50 KB gz、first paint < 1.5 s。
- status / diff 采纳 100 ms 绝对上限（SC-001 / SC-002）；restore 采纳 1 s（SC-004，跨多 ChangeSet 重放，宪法未定义该类操作的默认预算）。
- **`commit` 免除 100 ms DB op 预算**——constitution 第四条允许「plan 记录已批准例外」。完整论证见 Complexity Tracking。

### Delivery Workflow — ✅ PASS

spec → plan → tasks → implementation 顺序执行中。本轮为 plan 阶段；`tasks.md` 尚不存在，由 `/speckit-tasks` 生成。**重生成完成前 US-305 不得开工**（epic-006 依赖顺序第 2 步）。

### Governance — ✅ PASS

唯一例外已在 Complexity Tracking 按要求四要素记录：违反的原则、为什么需要、被拒绝的更简单方案、批准路径。

### Post-Design Re-Evaluation（Phase 1 完成后复检）

Phase 1 产出 [data-model.md](./data-model.md)、[contracts/](./contracts/) 五份、[quickstart.md](./quickstart.md) 之后重跑上述四条原则：

| 原则                | 复检结论      | 设计阶段新引入的、需要盯住的点                                                                                                                                                         |
| ------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Code Quality     | ✅ 仍 PASS    | data-model 引入了两个冗余列（`WorkingTreeState.entryCount`、`Commit.firstParentId`）。冗余列是第二份真相的温床，因此各自配了不变量断言（计数 ↔ 行数、首父 ↔ `parentIds[0]`），不靠约定 |
| II. Testing         | ✅ 仍 PASS    | 新增两条**静态**断言（`relations` 中无 `RxDBChange`、新表 `log === false`）进 capture 套件——它们是存储契约的唯一可执行形式                                                             |
| III. UX Consistency | ✅ 仍 PASS    | tri-framework 契约按故事界定了适用范围（US-305 与阶段 A/B 无 UI 面），并明确「对称 ≠ 形状全等」，避免把一致做成别扭                                                                    |
| IV. Performance     | ⚠️ 例外未扩大 | 设计阶段**没有**新增例外。`commit` 仍是唯一免除项；`entryCount` 冗余列正是为了让 `status()` 走常数时间而不申请第二个例外                                                               |

**Gate 结论：通过。** 唯一例外仍是 Complexity Tracking 里那一条，范围未扩大。

## Project Structure

### Documentation (this feature)

```text
specs/001-working-tree-commits/
├── plan.md                          # 本文件（Phase 1 输出）
├── spec.md                          # 已重生成（449 行，v1 无暂存区模型）
├── research.md                      # Phase 0 输出：R1–R12
├── data-model.md                    # Phase 1 输出：8 张逻辑状态 + staging 的物理落地
├── quickstart.md                    # Phase 1 输出：可运行验证场景
├── checklists/
│   └── requirements.md              # 规格质量检查单（已过）
├── contracts/
│   ├── core-api.md                  # 核心公开契约
│   ├── adapter-contract.md          # 适配器义务与 bypass 判定
│   ├── conformance-suites.md        # 两套具名套件
│   ├── tri-framework-api.md         # 三端对称契约
│   └── benchmark-report.md          # benchmark JSON 契约与门禁
└── tasks.md                         # Phase 2 输出（由 /speckit-tasks 生成，当前不存在）
```

### Source Code (repository root)

```text
packages/rxdb/src/
├── rxdb-adapter.ts                  # 改：SwitchBranchOptions(55) 不动；新增 4 个原语的捕获义务
│                                    #     mergeChanges 本地重载(200) / switchBranch(182)
│                                    #     upsertMany(239) / deleteByIds(255) 显式挂门禁
├── version/
│   ├── VersionManager.ts            # 改：switchBranch(740) 增可选第二形参
│   ├── switch-branch-actions.ts     # 复用：switch_branch_actions(16) / get_switch_version_actions(122)
│   ├── find-switch-branch-step.ts   # 复用：find_switch_branch_step(76)
│   ├── restore-entity.ts            # 登记受信点 #2
│   ├── HistoryManager.ts            # 登记受信点 #3
│   ├── undo-redo-apply.ts           # 登记受信点 #4
│   ├── merge-branch.ts              # 登记受信点 #5、#6（两个策略分支各一行）
│   ├── pull-batch.ts                # 登记受信点 #7
│   ├── pull-repository.ts           # 登记受信点 #8
│   └── cleanup-expired.ts           # 登记受信点 #9
├── commit/                          # 新：commit 图、HEAD、迁移、损坏守卫（US-305）
├── working-tree/                    # 新：捕获、status/diff/commit/discard、restore session
└── index.ts                         # 新导出（Commit* / WorkingTree* 前缀）

packages/rxdb-adapter-{pglite,wa-sqlite,sqlite-wasm,sqlite,sqliteai,electron}/
└── src/                             # 各自接入共享 bypass 判定与系统表迁移

packages/rxdb-{angular,react,vue}/src/
└── ...                              # 新：三端对称入口（阶段 C）

benchmarks/                          # 已存在（benchmarks/project.json）
└── src/                             # 新增 bench-working-tree target

scripts/
├── check-migration-release-gate.mjs # 已实现 + 39/39 单测绿 —— MUST NOT 重写，只复验
└── audit/
    ├── api-surface.mjs              # 命名门禁宿主（SC-014）
    └── coverage-check.mjs           # 覆盖率单一真相源
```

**Structure Decision**：沿用既有 monorepo 布局，不新建顶层目录。核心逻辑落在 `packages/rxdb/src/` 下**两个新目录** `commit/`（US-305 的不可变图与迁移）与 `working-tree/`（US-306 起的可变工作树面），与既有 `version/` 并列——`version/` 保持原职责（分支、撤销、同步），本特性只在其中 8 个文件上登记受信调用点，不搬迁。6 个适配器包各自接入**同一份**共享判定，不各写一份（R4）。三框架包只新增入口，不承载核心逻辑。

## Complexity Tracking

| Violation                                                                                        | Why Needed                                                                                                                                                                                                                                                                                                                                                                                                                                       | Simpler Alternative Rejected Because                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`commit` 免除 constitution IV 的「DB op < 100 ms」预算**（违反：IV. Performance Requirements） | `commit` 的工作量与宪法预算的假想对象不是同一量级：基准 fixture 下它要在**单个事务内**写入 100 个 ChangeSet 单元、CAS 推进 branch ref、并清空全部 100 个工作树条目（FR-011 要求同事务清空）。100 ms 是为单次实体读写设定的。**替代预算**：由**首个绿色实现的 reference 中位数冻结**，与相对门禁（≤ median ratio 110%）同批签入，因此仍是可验收的硬数字，不是「不设限」。status / diff / restore **不适用**本例外，各自照常受 100 ms / 1 s 约束。 | **①「让 commit 也进 100 ms」**：会逼实现把工作树清空改成异步或延迟，直接违反 FR-011 的同事务语义与 SC-007 的「不出现半清空的工作树」——把性能数字买在正确性头上。**②「缩小 fixture 让数字好看」**：违反 R8 的固定 fixture 口径，门禁自证其绿。**③「commit 不设绝对预算，只看相对门禁」**：会漏掉「所有操作一起变慢」的整体回归，故仍冻结绝对中位数。 |

**批准路径**：本例外由 epic-006「性能预算的口径」一节授权（「commit 不套用 100ms，其绝对预算由首个绿色实现的 reference 中位数冻结」），并已在 spec.md SC-003 固化为可验收判据。实施时随首个绿色实现的 reference JSON 一并提交 review；若 review 不接受该中位数，需回到本表更新例外或改设计，不得在失败后重算基线。

**其余无例外**：本特性未引入新架构分层、未新增顶层项目、未偏离既有 monorepo 约定。
