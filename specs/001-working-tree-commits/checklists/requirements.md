# Specification Quality Checklist: 本地工作树与提交历史

**Purpose**: Validate specification completeness and quality before proceeding to planning

**Created**: 2026-09-12

**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## 本特性专属门禁（epic-006 依赖顺序第 2 步的复核项）

- [x] **无暂存区模型已贯穿全文**：没有 stage / unstage / 部分提交 / staged snapshot；`commit()` 无 selection 入参（FR-041）
- [x] **只有一条 diff 轴** `HEAD ↔ 工作树`；`HEAD ↔ index` 已显式裁撤（FR-005）
- [x] **无 `index_dependency_cycle`**，也无依赖闭包 / residual rebase（仅作为 FR-047 墓碑与非目标论据出现）
- [x] **无 `Index*` 前缀导出**要求已进命名裁决与 SC-014
- [x] **裁撤编号 FR-006 / 007 / 024 / 025 / 028 / 040 / 047 全部以墓碑形式保留**，标注「编号不得复用」，且未被任何新条目占用
- [x] **FR-001…FR-052 + FR-026b 编号与 epic-006 逐一对应**，无新编、无重编（脚本核对通过）
- [x] **受信调用点登记表的登记键**（文件 + 符号 + 意图）与扫描排除规则已入规格，SC-010 有对应漂移门禁
- [x] **调用方捕获型 vs 事务内读改写型**两类 CAS 已分开，普通 CRUD 明确不得用捕获型（FR-031 / FR-039 / revision 校验矩阵）
- [x] **`origin=remote_sync` 不按来源豁免**已在写入口矩阵、Edge Cases、FR-046 与 SC-015 四处一致
- [x] **6 个 v1 后端 + Tauri Rust host 不入矩阵**已入 Assumptions 与 SC-006
- [x] **性能口径而非裸墙钟数字**：相对门禁（≤ reference median 110%）是普通 CI 唯一硬门禁，绝对 p95 仅在 `runnerProfileHash` 匹配的 runner 上生效，commit 不套用 100 ms（SC-001…SC-004）
- [x] **FR-030 明确 MUST NOT 重写 [check-migration-release-gate.mjs](../../../scripts/check-migration-release-gate.mjs)**，且不得重打 / 移动 / 伪造已发布 tag
- [x] **损坏守卫是同一份共享实现**（FR-051 + 横切约束 6 + SC-013），三条入口各自复用而非各写一份
- [x] **非目标照抄 epic-006 全部条目**，含三条显式裁决的「要改结论必须先改 epic-006 非目标一节」条款

## Notes

### 关于「No implementation details」的判定口径

本规格出现了若干**既有**符号名：`commit()`、`discardWorkingTree()`、`switchBranch()`、`createBranch()` / `removeBranch()` / `mergeBranch()`、`syncBranches()`、`pull()` / `pullRepository()` / `cleanupExpired()`、`upsertMany()` / `deleteByIds()`、`notifyExternalUpdate()`、`RxDBChange` / `RxDBBranch.activated`、`WorkspaceCacheEntry.staged`、`SwitchBranchOptions`。这**不违反**该检查项，理由有三：

1. 它们全部是**仓库中已存在**的公开或内部契约，规格引用它们是为了界定「哪些既有行为不能变」（FR-017 / FR-018）与「哪些入口必须挂门禁」（FR-046），属于 WHAT 的边界描述，不是新设计。
2. 命名裁决本身就是一条**需求**（SC-014 是可执行门禁）：不写出被禁用的具体前缀与被禁止复活的具体符号，该门禁不可验收。
3. 真正属于 plan 阶段的内容——物理表名、字段、索引、外键、加密 envelope 格式、迁移版本号、SQL 方言——**已在 Key Entities 开头显式声明推迟冻结**，全文未出现任何一处。

### 关于「Written for non-technical stakeholders」

本特性的受众是**库的使用者与实现者**，不是终端业务用户；epic-006 本身即以「Git 概念对照」为共同语言。规格保留了四层分层对照表作为入门锚点，使不熟悉实现的读者也能判断某条需求归属哪一层。

### 验证轮次

第 1 轮：全部 16 项通过，未进入修订循环。

### 交付前提醒

- `tasks.md` 尚不存在，`plan.md` / `data-model.md` / `research.md` / `quickstart.md` / `contracts/*` 仍是按旧三层模型写的，**必须随后由 `/speckit-plan` 与 `/speckit-tasks` 一并重生成**，否则本规格与下游 artifact 不一致。
- 本目录重生成完成前，US-305 不得开工（epic-006 依赖顺序第 2 步）。
