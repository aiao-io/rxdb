# Quickstart: 验证「本地工作树与提交历史」

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Contracts**: [contracts/](./contracts/)

本文件是**验证指南**，不是实现指南。每个场景给出：怎么跑、看什么、绿的判据是什么。实现细节属于 `tasks.md` 与实现阶段。

> 旧 quickstart.md 里的 `stage` / `unstage` / 部分提交流程**全部作废**——v1 没有暂存区。

## 0. 前置

```bash
# Node 26 是硬性前置：不切 PATH 时 preinstall 直接失败
node -v          # 必须 v26+
pnpm -v          # 必须 10+
pnpm install
```

三个心智模型先对齐，否则场景全看不懂：

| 层                 | 是什么                    | 存哪                 |
| ------------------ | ------------------------- | -------------------- |
| 草稿缓存           | 编辑器未保存 buffer       | 插件独立 IndexedDB   |
| **工作树**         | working directory         | **主库业务表当前值** |
| **提交**           | commit                    | 主库 commit 图       |
| ~~index / 暂存区~~ | **v1 没有对照物，被裁掉** | —                    |

`entity.save()` ≈ Ctrl+S，**不等于** commit。保存后的内容对**全部查询立即可见**。

## 1. 单元与集成（每个阶段的主验证手段）

```bash
# TDD 循环：先红后绿
pnpm nx test rxdb --watch

# 核心包一轮
pnpm nx run-many -t lint test build --projects=tag:js-lib
```

**看什么**：新增用例先红再绿。`nx build` 报绿**不代表**类型无误——类型要单独看 `typecheck`。

## 2. 6 后端 × 2 套件（SC-006）

```bash
pnpm nx run-many -t test --projects=rxdb-adapter-pglite,rxdb-adapter-wa-sqlite,rxdb-adapter-sqlite-wasm,rxdb-adapter-sqlite,rxdb-adapter-sqliteai,rxdb-adapter-electron
```

**绿的判据**：6 个包各自都实际调用了 `workingTreeCaptureConformanceSuite` 与 `workingTreeCommitConformanceSuite`（导出了但没人跑 = 没覆盖）。套件内容见 [contracts/conformance-suites.md](./contracts/conformance-suites.md)。

## 3. 场景验证

### 3.1 启用与零行为差异（US-305 / FR-046）

1. 打开一个**未启用**提交能力的既有数据库，跑既有回归。
2. **期望**：行为与未安装本特性逐字节一致；`workingTree` 上除 `enable()` / `isEnabled()` 外一律 `commit_capability_disabled`。
3. 调 `enable()`，再调一次。
4. **期望**：第二次**幂等命中**，不报错、不重置版本；每个既存分支都有 ref / state 初始行，`generation` 互不相同。

### 3.2 捕获完备性 —— 冷重放不变量（US-306 阶段 A / SC-009）

1. 依次做：普通 CRUD、显式事务、`mergeBranch()`、undo / redo、`pull()`、`pullRepository()`、`cleanupExpired()`。
2. 清空进程内缓存，用 `HEAD + WorkingTreeEntry` 重放。
3. **期望**：重放出的净状态**逐字段等于**业务表当前值。计数相等**不算**通过。
4. **期望**：`cleanupExpired()` 的过期删除落 `origin='remote_sync'` 的 DELETE 单元——远端同步**会**弄脏工作树，不按来源豁免。

### 3.3 status / diff 只有一条轴（US-306 阶段 B）

1. 改几条实体，`status()` 再 `diff()`。
2. **期望**：`diff()` **没有**第二个 range 参数；输出只描述 `HEAD ↔ 工作树`。
3. **期望**：`status().byOrigin` 同时展示 `local` 与 `remote_sync`。

### 3.4 提交是全量的（硬裁决 1）

1. 工作树里有 5 个未提交单元，`commit('msg')`。
2. **期望**：5 个**全部**进同一个 commit；`commit()` 上**没有** selection 入参；提交后工作树条目为 0、`entryCount` 为 0。
3. 想隔离一条工作线？用分支：`createBranch()` → 改 → `mergeBranch()` 或 `removeBranch()`。

### 3.5 `CommitConflict` 是返回值（SC-008，必须有这条用例）

1. Tab A：`status()` 拿到 `workingTreeRevision`。
2. Tab B：`save()` 改一条实体。
3. Tab A：带着第 1 步的 revision `commit()`。
4. **期望**：返回 `{ ok: false, conflict: { kind: 'working_tree_revision', … } }`——**不是**静默提交、**不是**抛异常、**不是**自动重试。
5. **期望**：`status().conflicted` **仍为 false**——它只由未结束的 restore session 派生，`CommitConflict` 不入库。
6. 恢复动作就是重新 `status()` → 复核 → 重新 `commit()`。

### 3.6 restore 不动历史（US-307）

1. `restore({ commitId: '<HEAD~1>' })`。
2. **期望**：内容作为**新的未提交变更**回到工作树；HEAD **没有移动**；历史**没有改写**；公开面上**不存在** `checkout()` 或 detached HEAD。
3. **期望**：`status().conflicted` 在会话存续期间为 true，会话 `committed` 后回到 false。

### 3.7 raw 写被挡在执行前（SC-010 / adapter 契约）

1. 用 `rawQuery` 直接 UPDATE 一张版本化业务实体表。
2. **期望**：抛 `commit_capability_mismatch`，且**业务表零变化**（执行前拒绝，不是写完回滚）。
3. 换成只改 `remoteId` / 同步水位 / 审计时间。
4. **期望**：放行，且**不创建单元、不递增 revision**。
5. 调 `upsertMany()` 写版本化实体。
6. **期望**：**返回 Observable 之前**同步拒绝——不订阅也必须已经拒绝。
7. **边界**：绕过 adapter 的外部数据库句柄**拦不住**，v1 不承诺拦得住。

### 3.8 崩溃恢复（SC-007）

1. 在「写完 changeSet 之后、CAS 之前」注入崩溃。
2. **期望**：恢复后**要么全有要么全无**；不出现半个 commit、半个事务或半清空的工作树；`entryCount` 与实际行数一致。

### 3.9 损坏 fail-closed（SC-013）

1. 损坏 HEAD 可达的某个祖先节点。
2. **期望**：该分支进入 `corrupted_read_only`；`commit()` / `restore()` / switch-to **三条入口各自**返回 `commit_graph_corrupted`，**不改指针、不删记录**。
3. **期望**：不依赖重放的当前投影读取、诊断导出、以及「切离」该分支**照常可用**；其他分支不受影响。

### 3.10 分支 ABA（US-308）

1. 记下分支 `b` 的 `(branchId, headRevision)`。
2. `removeBranch('b')`，再 `createBranch('b')`。
3. 用第 1 步的值做 CAS。
4. **期望**：**失败**——`generation` 不复用。

## 4. 三框架对称（阶段 C 收口）

```bash
pnpm nx run-many -t test --projects=rxdb-angular,rxdb-react,rxdb-vue
pnpm nx serve dev-rxdb-angular   # 手动看 loading / empty / error
```

**绿的判据**：[contracts/tri-framework-api.md](./contracts/tri-framework-api.md) §3 的清单**三端齐全**，任一端缺一项 = 阶段 C 未完成。a11y 走 Playwright，WCAG 2.1 AA。

## 5. 门禁

```bash
# 覆盖率（单一真相源，不另设阈值）
node scripts/audit/coverage-check.mjs

# 公开面 / 命名门禁（SC-014）
node scripts/audit/api-surface.mjs

# 性能
pnpm nx run benchmarks:bench-working-tree

# 迁移发布门禁（FR-030）—— 只复验，不重写
node --test scripts/check-migration-release-gate.spec.mjs
```

**判据**：

- 覆盖率：`rxdb` / `rxdb-angular` / `rxdb-react` / `rxdb-vue` 四指标 ≥ 90%，其余包 ≥ 80%。
- 命名：核心新增导出全部 `Commit*` / `WorkingTree*`；无 `Index*`；三框架包无 `Workspace*`、不复用 `SwitchBranchOptions`；`useWorkingTree()` 合规。
- 性能：普通 PR 只卡**归一化 ratio ≤ 冻结 median 的 110%**；绝对 p95 仅在 `runnerProfileHash` 匹配的 runner 上作为发布门禁；`commit` **不套用 100 ms**。profile 不匹配 → `benchmark_environment_mismatch`，**不得**当成性能回归。
- 发布门禁脚本已实现且 39/39 单测绿，**MUST NOT 重写**；只在真实 tag 与真实清单上复验。

## 6. 发布

**npm release 由维护者手动控制**，不是本特性的任务链的一环，也不是开工前置。本 quickstart 不提供发布命令。
