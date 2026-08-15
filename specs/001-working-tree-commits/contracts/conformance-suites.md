# Contract: 跨后端一致性套件

**Feature**: [spec.md](../spec.md) | **Data Model**: [data-model.md](../data-model.md) | **Date**: 2026-08-15

两套具名套件，位于 `packages/rxdb-test/src/working-tree/`，经**新增 subpath** `@aiao/rxdb-test/working-tree` 导出，沿用既有 [`@aiao/rxdb-test/transaction`](../../../packages/rxdb-test/src/transaction/index.ts) 的 runner 模式（[R-011](../research.md#r-011-跨后端一致性套件的组织)）。**不设第三套套件。**

---

## 1. 导出契约

```
// @aiao/rxdb-test/working-tree
export function workingTreeCaptureConformanceSuite(factory: AdapterFactory): void
export function workingTreeCommitConformanceSuite(factory: AdapterFactory): void
```

`AdapterFactory` 沿用 [`rxdb-adapter-sqlite-core/src/testing.ts`](../../../packages/rxdb-adapter-sqlite-core/src/testing.ts) 中的既有定义。每个后端在自己包内新增一个 spec 文件调用两个 runner：

```
// packages/rxdb-adapter-<backend>/src/__tests__/working-tree-conformance.spec.ts
workingTreeCaptureConformanceSuite(factory)
workingTreeCommitConformanceSuite(factory)
```

**6 个后端全部接入，缺一即整故事失败**（SC-003）。

---

## 2. `workingTreeCaptureConformanceSuite`（US2 / US-306a）

覆盖工作树捕获与冷重放。

| 组 | 断言 | 溯源 |
| --- | --- | --- |
| C-1 启用开关 | 未启用库中新表数量 = 0；未启用库行为与升级前逐项一致 | FR-011、SC-008、INV-10 |
| C-2 能力协商 | 未启用写入方打开已启用库 → `commit_capability_mismatch`，拒绝写入而非降级 | FR-011 |
| C-3 事务原子性 | 业务写 + 条目写同事务；回调内抛错 → 两者同时不存在 | FR-018、SC-002 |
| C-4 崩溃一致性 | 事务中途注入错误 → `disconnect()` → `connect()` → 只见上一次完整状态 | FR-019、[R-012](../research.md#r-012-崩溃恢复与并发的确定性测试手法) |
| C-5 意图分派 | 11 个受信入口逐个触发，断言条目「产生 / 不产生」与登记表一致 | FR-020、[adapter-contract §4](./adapter-contract.md#4-写入口受信登记) |
| C-6 查询缓存排除 | `SyncType.QueryCache` 实体在 5 张新表中出现次数 = 0 | FR-021、INV-9 |
| C-7 混写拒绝 | 同事务混写查询缓存与版本化实体 → `mixed_versioned_cache_transaction` + 整事务回滚 | FR-022 |
| C-8 冷重放不变式 | 任意操作序列后，「HEAD 链 + 条目按 `sequence` 重放」逐字段等于当前业务数据 | FR-023、INV-4、SC-002 |
| C-9 revision 分类 | 普通 CRUD 与远端应用的 `workingTreeRevision` 在并发下**不**失败 | FR-032 |
| C-10 加密信封 | 启用加密时 5 个落盘位置的明文哨兵命中数 = 0 | FR-055、INV-8、SC-009 |

---

## 3. `workingTreeCommitConformanceSuite`（US3 / US-306b，吸收 US1）

覆盖提交图、迁移、缓存区与提交状态机。**US1 的提交图与迁移断言并入本套件**，不另立套件——避免出现「两套都绿、交界处无人测」的缝隙。

### 3.1 提交图与迁移（原 US-305）

| 组 | 断言 | 溯源 |
| --- | --- | --- |
| G-1 基线唯一 | 每分支恰好一条 `kind = 'baseline'` 且 `parentId IS NULL` 的提交 | FR-002、INV-2 |
| G-2 DAG 可达 | `headCommitId` 可达 `baselineCommitId`；伪造断链 → `commit_graph_corrupted` | FR-004/005、INV-3 |
| G-3 HEAD 单源 | 全库不存在第二份持久化 HEAD 或当前分支 id | FR-001/015 |
| G-4 激活基数 | 直写两行 `activated = TRUE` 被数据库约束拒绝；迁移前存在多行 → `ambiguous_active_branch` 且迁移整体失败 | FR-012、INV-1 |
| G-5 迁移 fencing | 落后写入方在 epoch 推进后 → `writer_fenced` | FR-008 |
| G-6 迁移幂等 | 分页物化中途崩溃 → 重连后续做或整体回滚，无半状态 | FR-013 |
| G-7 空提交拒绝 | `unitCount = 0` 的 `normal` 提交被拒 | FR-006 |
| G-8 幂等键 | 同键同内容 → 返回原提交且 HEAD 不推进；同键不同内容 → `idempotency_key_reused` 且原记录不变 | FR-009、INV-7 |
| G-9 分支代次 | 同名分支删除后重建，旧 `operationId` 不再碰撞 | FR-009 |
| G-10 历史查询 | 排序为拓扑序 → `createdAt` → `sequence`；游标分页无重复无遗漏；未物化分支 → `branch_not_materialized` | FR-007、FR-014 |

### 3.2 缓存区与状态机（US3）

| 组 | 断言 | 溯源 |
| --- | --- | --- |
| S-1 依赖闭包正向 | 点名子实体 → 闭包自动含父实体新增；`closure ⊇ requested` 且如实回传 | FR-029、[R-007](../research.md#r-007-依赖闭包算法) |
| S-2 跨事务扩展 | T1 建父、T2 建子，仅点名 T2 → 闭包含 T1 | US3-AC4 |
| S-3 反向移除 | unstage 父 → 依赖它的子也被移出 | FR-030 |
| S-4 自包含不变式 | 任意 stage/unstage 序列后，缓存区内每条目的前置依赖均在 HEAD 或缓存区内 | FR-030、INV-5 |
| S-5 环处理 | 不可拆分关系环整体纳入；无法形成合法闭包 → `index_dependency_cycle` 且缓存区**零变化** | FR-031 |
| S-6 稳定排序 | 相同输入多次 stage 产生逐位相同的 `sequence` | FR-030 |
| S-7 CAS 冲突 | 两实例读同一 `indexRevision` 后并发提交 → 恰好 1 个成功，另一个拿到含 expected/actual 的冲突 | FR-034、SC-005 |
| S-8 激活校验 | 所有捕获型写操作在 `activationRevision` 不匹配时 → `stale_active_branch` | FR-053 |
| S-9 无操作零副作用 | stage 空集 / unstage 不存在项 / discard 已 clean → 三个 revision 变化量均为 0 | FR-035、SC-007 |
| S-10 残量 rebase | 提交后未暂存条目按新 HEAD 重新基线化而非丢弃；冷重放仍成立 | FR-033 |
| S-11 状态迁移 | `clean → modified → staged → clean` 全路径与 `restoring` / `conflicted` 的进入退出条件 | [data-model §4.3](../data-model.md#43-状态迁移) |
| S-12 提交崩溃 | 提交中途崩溃 → 重连后要么完整提交、要么完全未提交 | FR-036 |

### 3.3 恢复与分支隔离（US5 / US6 持久层）

| 组 | 断言 | 溯源 |
| --- | --- | --- |
| R-1 恢复即新提交 | `status = completed` 时必然存在对应新提交；历史提交行逐字段未被改写 | FR-043 |
| R-2 恢复断点 | 中途崩溃 → 据 `appliedUnitCount` 续做或整体回滚 | FR-045 |
| R-3 恢复幂等 | 同 `operationId` 重复触发 → 不产生第二条恢复提交 | FR-046 |
| R-4 schema 不兼容 | 目标提交 schema 不兼容 → `incompatible_schema`，零写入 | FR-047 |
| B-1 分支隔离 | 分支 A 的工作树/缓存区在分支 B 上完全不可见 | FR-048/049 |
| B-2 脏树切换 | 缺省 `onDirty: 'reject'` 拒绝；`carryOver` 显式指定时按约定迁移 | FR-050 |
| B-3 未物化分支 | 切换到未物化分支 → `branch_not_materialized` | FR-051 |
| B-4 切换 CAS | 并发切换恰好 1 个成功 | FR-052 |

---

## 4. 确定性要求（宪法 II）

- **禁止** `setTimeout`、禁止依赖真实时序、禁止依赖 BroadcastChannel 送达时机。
- 崩溃用**事务回调内确定性位点注入错误** + `disconnect()` / `connect()` 模拟。
- 并发用**同进程双实例同物理库** + 确定性交错顺序（A 读 revision → B 写 → A 写）。
- 分页崩溃用「第 N 页后抛错」参数化，N 是显式常量而非随机值。

---

## 5. 覆盖率门禁

| 包 | 阈值 |
| --- | --- |
| `packages/rxdb` | ≥ 90% |
| `packages/rxdb-test` | ≥ 80% |
| `packages/rxdb-adapter-*` | ≥ 80% |
| `packages/rxdb-{angular,react,vue}` | ≥ 80% |

由既有 `pnpm audit:coverage` 执行。
