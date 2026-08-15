# Quickstart: 本地工作树与提交历史 — 验证指南

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-08-15

本文件是**验证/运行指南**，不含实现代码。按交付顺序逐段执行，每段给出前置条件、命令与预期判据。实现细节归 `tasks.md` 与实现阶段。

---

## 阶段 0：bridge tag 前置门禁（阻塞项）

本特性必然把 `RXDB_SYSTEM_SCHEMA_VERSION` 从 3 递增到 4，迁移发布门禁会直接挡住。**必须先做完这一步**（[R-015](./research.md#r-015-bridge-tag-前置条件)）。

```bash
pnpm check-migration-release-gate
```

**当前预期**：失败。[`requirements/migration-release.json`](../../requirements/migration-release.json) 的 `bridge.tag` 与 `bridge.version` 都是 `null`。

**通过判据**：产出一个**新的非迁移 bridge tag**、更新该 JSON 后，`git merge-base --is-ancestor <bridge-tag> <release-commit>` 成立且上述命令退出码为 0。

**禁止**：重打、移动或伪造已发布标签；禁止把 `oldBundlePolicy.enforced` 关掉绕过。

---

## 阶段 1：提交图与启用迁移（US1）

### 1.1 未启用路径必须零差异

```bash
pnpm nx test rxdb -- --testNamePattern="commit capability|未启用"
```

**判据**：未启用数据库中新增系统表数量 = **0**（SC-008、INV-10）；未启用库的行为与升级前逐项一致。

### 1.2 提交图不变式

```bash
pnpm nx test rxdb -- --testNamePattern="commit graph|baseline|idempotency"
```

**判据**：
- 每分支恰好一条基线提交（INV-2）
- `headCommitId` 可达 `baselineCommitId`（INV-3）
- 直写两行 `activated = TRUE` 被**数据库约束**拒绝（INV-1）
- 同幂等键同内容返回原提交且 HEAD 不推进；同键不同内容 → `idempotency_key_reused`（INV-7）
- 空提交被拒

### 1.3 跨后端

```bash
pnpm nx run-many -t test --projects=tag:adapter
```

**判据**：6 个后端全部执行 `workingTreeCommitConformanceSuite` 的 G-1..G-10 组并通过。任一后端缺席 = 未完成（SC-003）。

---

## 阶段 2：工作树捕获（US2）

### 2.1 写入口捕获与意图分派

```bash
pnpm nx test rxdb -- --testNamePattern="write intent|capture"
node scripts/audit/write-intent-drift.mjs
```

**判据**：
- 11 个受信调用点逐个触发，条目「产生 / 不产生」与登记表逐项一致（[adapter-contract §4](./contracts/adapter-contract.md#4-写入口受信登记)）
- 漂移扫描：未登记调用点数量 = **0**（SC-004）；登记了但已不存在的条目数量 = **0**
- 扫描排除 `dist/` 与测试文件，且能区分 `mergeChanges` 的本地/远端两个重载

### 2.2 事务原子性与冷重放

```bash
pnpm nx run-many -t test --projects=tag:adapter -- --testNamePattern="workingTreeCapture"
```

**判据**：
- 事务回滚后业务数据与工作树条目**同时不存在**，半状态率 = **0**（SC-002）
- 任意操作序列后，「HEAD 链 + 条目按 `sequence` 重放」逐字段等于当前业务数据（INV-4）
- `SyncType.QueryCache` 实体在 5 张新表中出现次数 = **0**（INV-9）
- 同事务混写 → `mixed_versioned_cache_transaction` + 整事务回滚

### 2.3 加密

```bash
pnpm nx test rxdb-adapter-encrypted -- --testNamePattern="working tree|commit"
```

**判据**：启用加密时 5 个落盘位置的明文哨兵命中数 = **0**（SC-009、INV-8）。

---

## 阶段 3：缓存区与提交状态机（US3）

```bash
pnpm nx run-many -t test --projects=tag:adapter -- --testNamePattern="workingTreeCommit"
```

**判据**（对应 [conformance-suites §3.2](./contracts/conformance-suites.md#32-缓存区与状态机us3)）：
- `closure ⊇ requested` 且如实回传；跨事务父子依赖被自动扩展
- 任意 stage/unstage 序列后缓存区**自包含**（INV-5）
- 无法形成合法闭包 → `index_dependency_cycle` 且缓存区**零变化**
- 相同输入多次 stage 产生逐位相同的 `sequence`
- 并发提交恰好 **1** 个成功（SC-005）
- 语义无操作时三个 revision 变化量均为 **0**（SC-007）
- 提交后未暂存残量按新 HEAD 重新基线化，冷重放仍成立
- `activationRevision` 不匹配 → `stale_active_branch`

**确定性要求**：全程无 `setTimeout`、无真实时序依赖。崩溃用事务回调内确定性注入错误 + `disconnect()`/`connect()`；并发用同进程双实例同物理库的确定性交错。

---

## 阶段 4：三框架交互面与性能门禁（US4）

### 4.1 对称门禁

```bash
node scripts/audit/tri-framework-check.mjs
pnpm nx run-many -t lint test --projects=tag:js-lib
```

**判据**：跨端缺失导出数量 = **0**（SC-010）。任一共享类型或 `useWorkingTree()` 只在一到两端导出 → **整个故事失败**，不得把单端实现记为 Done。

### 4.2 三端等价行为

```bash
pnpm nx run-many -t test --projects=rxdb-angular,rxdb-react,rxdb-vue
```

**判据**：同一 fixture 下三端返回相同状态、依赖闭包、commit 摘要与错误 code。

### 4.3 E2E 与 a11y

```bash
pnpm nx run-many -t e2e --projects=dev-rxdb-angular-e2e,dev-rxdb-react-e2e,dev-rxdb-vue-e2e
```

**判据**：`status → stage → refresh → commit` 主流程 + 失败/empty 路径通过；仅键盘可完成全流程；焦点顺序与可见性、名称与状态公告达到 WCAG 2.1 AA；最长实体名与错误文本在窄视口下不溢出、不遮挡、不改变固定工具栏尺寸。

### 4.4 性能门禁

```bash
pnpm nx run benchmarks:bench-working-tree
```

**前置**：`benchmarks/reports/working-tree-reference.json` 已签入。

**判据**（[benchmark-report.md §5](./contracts/benchmark-report.md#5-三态门禁)）：
- 归一化 ratio ≤ reference median 的 **110%**
- `runnerProfileHash` 匹配时追加绝对判据 p95 ≤ **100 ms**
- 不匹配时产出 `benchmark_environment_mismatch` 并**跳过**绝对判据 —— 不得放宽为通过（SC-012）
- **失败后禁止重算基线转绿**

---

## 阶段 5：恢复会话（US5）与分支隔离（US6）

两者相互独立，可并行。持久层部分可与阶段 4 并行；三框架与 benchmark 部分必须在阶段 4 之后。

```bash
pnpm nx run-many -t test --projects=tag:adapter -- --testNamePattern="restore|branch isolation"
pnpm nx run benchmarks:bench-working-tree     # 含 US5 追加的 restore 场景
```

**判据**：
- 恢复以**新提交**表达；历史提交行逐字段未被改写（FR-043）
- 中途崩溃 → 据 `appliedUnitCount` 续做或整体回滚，两种终态都无半状态
- 同 `operationId` 重复触发不产生第二条恢复提交
- schema 不兼容 → `incompatible_schema` 且零写入
- 分支 A 的工作树/缓存区在分支 B 上完全不可见
- 脏工作树切换缺省被拒（`onDirty: 'reject'`）
- 未物化目标分支 → `branch_not_materialized`
- 并发切换恰好 1 个成功
- `restore` p95 ≤ **1 s**（已登记的宪法 IV 例外）

---

## 全量门禁

```bash
pnpm test-all
pnpm audit:api-surface
pnpm audit:coverage
pnpm check-migration-release-gate
```

**判据**：
- 零 ESLint 警告、TS strict 通过、嵌套 ≤ 3 层
- `packages/rxdb` 覆盖率 ≥ **90%**，其余包 ≥ **80%**
- 每个新公开导出都有 TSDoc
- API 基线变更已在 `requirements/api-baseline/` 中显式更新并说明
- 迁移发布门禁通过

---

## 命名纪律自查

| 项 | 要求 |
| --- | --- |
| 新增公开导出 | **禁止** `Workspace*` 前缀（已被 `@aiao/rxdb-plugin-workspace` 占用） |
| 切换分支选项 | 公开新类型固定为 `WorkingTreeSwitchBranchOptions`；**不得**复用既有内部 `SwitchBranchOptions` |
| 内部意图字段 | `SwitchBranchOptions.intent` 是内部适配器契约扩展，不进公开 API 基线 |
