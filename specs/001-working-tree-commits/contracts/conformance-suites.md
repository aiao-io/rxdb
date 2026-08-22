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

## 2. `workingTreeCaptureConformanceSuite`（US2 / US-306 阶段 A）

覆盖工作树捕获与冷重放。

| 组                | 断言                                                                                                                                                                                                                                                                                                                                         | 溯源                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| C-1 启用开关      | 未启用库中新表数量 = 0；未启用库行为与升级前逐项一致                                                                                                                                                                                                                                                                                         | FR-011、SC-008、INV-10                                                                          |
| C-2 能力协商      | 未启用写入方打开已启用库 → `commit_capability_mismatch`，拒绝写入而非降级                                                                                                                                                                                                                                                                    | FR-011                                                                                          |
| C-3 事务原子性    | 业务写 + 条目写同事务；回调内抛错 → 两者同时不存在                                                                                                                                                                                                                                                                                           | FR-018、SC-002                                                                                  |
| C-4 崩溃一致性    | 事务中途注入错误 → `disconnect()` → `connect()` → 只见上一次完整状态                                                                                                                                                                                                                                                                         | FR-019、[R-012](../research.md#r-012-崩溃恢复与并发的确定性测试手法)                            |
| C-5 意图分派      | 11 个受信入口逐个触发，断言条目「产生 / 不产生」与登记表一致                                                                                                                                                                                                                                                                                 | FR-020、[adapter-contract §4](./adapter-contract.md#4-写入口受信登记)                           |
| C-6 查询缓存排除  | `SyncType.QueryCache` 实体在 **11 张新表**中出现次数 = 0                                                                                                                                                                                                                                                                                     | FR-021、INV-9                                                                                   |
| C-7 混写拒绝      | 同事务混写查询缓存与版本化实体 → `mixed_versioned_cache_transaction` + 整事务回滚                                                                                                                                                                                                                                                            | FR-022                                                                                          |
| C-8 冷重放不变式  | 任意操作序列后，「HEAD 链 + 条目按 `sequence` 重放」逐字段等于当前业务数据                                                                                                                                                                                                                                                                   | FR-023、INV-4、SC-002                                                                           |
| C-9 revision 分类 | 普通 CRUD 与远端应用的 `workingTreeRevision` 在并发下**不**失败                                                                                                                                                                                                                                                                              | FR-032                                                                                          |
| C-10 加密信封     | 启用加密时 5 个落盘位置的明文哨兵命中数 = 0                                                                                                                                                                                                                                                                                                  | FR-055、INV-8、SC-009                                                                           |
| C-11 冲突裁决重算 | `KEEP_LOCAL` / 无净变化 → 工作树与三个 revision 变化量均为 **0**；`KEEP_REMOTE` → 该单元条目**就地重算**为远端值（`origin = 'remote_sync'`、`sequence` 取新最大值）、`rxdb_index_entry` **逐字段不变**、`workingTreeRevision` 递增；净差为空且未暂存 → 删行，净差为空但已暂存 → **保留**行。四种组合（裁决 × staged）后冷重放与 INV-6 均成立 | FR-020、INV-4、INV-6、[data-model §4.4](../data-model.md#44-远端冲突裁决--工作树净差重算已裁决) |
| C-12 bypass 门禁  | `rawQuery` 写版本化实体表 → `commit_capability_mismatch` 且**业务表零变化**；写 FTS5 影子表 / 查询缓存实体表 / `SELECT` 版本化表 → 放行；目标表无法确定的动态 SQL → 拒绝；受信 `intent` 路径 → 放行；**未启用** commit 能力时以上全部放行                                                                                                    | [adapter-contract §4.6](./adapter-contract.md#46-raw-sql--adapter-直写的-bypass-门禁已裁决)     |

---

## 3. `workingTreeCommitConformanceSuite`（US3 / US-306 阶段 B，吸收 US1）

覆盖提交图、迁移、缓存区与提交状态机。**US1 的提交图与迁移断言并入本套件**，不另立套件——避免出现「两套都绿、交界处无人测」的缝隙。

### 3.1 提交图与迁移（原 US-305）

| 组                    | 断言                                                                                                                                                                      | 溯源                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| G-1 基线唯一          | 每分支恰好一条 `kind = 'baseline'` 且 `parentId IS NULL` 的提交                                                                                                           | FR-002、INV-2                                          |
| G-2 DAG 可达          | `headCommitId` 可达 `baselineCommitId`；伪造断链 → `commit_graph_corrupted`                                                                                               | FR-004/005、INV-3                                      |
| G-3 HEAD 单源         | 全库不存在第二份持久化 HEAD 或当前分支 id                                                                                                                                 | FR-001/015                                             |
| G-4 激活基数          | 直写两行 `activated = TRUE` 被数据库约束拒绝；迁移前存在多行 → `ambiguous_active_branch` 且迁移整体失败                                                                   | FR-012、INV-1                                          |
| G-6 迁移幂等          | 分页物化中途崩溃 → 重连后续做或整体回滚，无半状态                                                                                                                         | FR-013                                                 |
| G-7 空提交拒绝        | `unitCount = 0` 的 `normal` 提交被拒                                                                                                                                      | FR-006                                                 |
| G-8 幂等键            | 同键同内容 → 返回原提交且 HEAD 不推进；同键不同内容 → `idempotency_key_reused` 且原记录不变                                                                               | FR-009、INV-7                                          |
| G-9 分支代次          | 同名分支删除后重建，旧 `operationId` 不再碰撞                                                                                                                             | FR-009                                                 |
| G-10 历史查询         | 排序为拓扑序 → `createdAt` → `sequence`；游标分页无重复无遗漏；未物化分支 → `branch_not_materialized`                                                                     | FR-007                                                 |
| G-11 可达性而非归属   | 子分支 `log()` 含继承自父分支的提交；把 `originBranchId` 当过滤条件的实现会漏掉它们 → 该断言 MUST 失败                                                                    | FR-007                                                 |
| G-12 损坏按分支隔离   | 构造一条损坏分支后：该分支提交/恢复/切入被拒并返回**首个**损坏节点与修复建议；**另一条健康分支** `status()`/`stage()`/`commit()` 全部正常；原引用与原始记录未被改动或删除 | FR-014                                                 |
| G-13 能力状态协商     | `rxdb_commit_capability_state` 全库恰好 1 行；每次连接校验协议/schema/编解码三个版本；`supported = false` 的写入方在**首笔业务写入前**失败                                | FR-011                                                 |
| G-14 确定性根节点 id  | 同一「数据库 + 分支 + `enableMigrationId` + schema/编解码 manifest」下重跑迁移或重试物化，`baseline` / `branch_baseline` 的 id 逐位相同；`normal` 提交为 UUID v7          | FR-002、[R-008](../research.md#r-008-提交-id-与幂等键) |
| G-15 元数据分支不物化 | 仅有元数据的远端分支 MUST NOT 创建基线或 `rxdb_commit_branch_ref` 行，且 MUST NOT 被解释为空 HEAD                                                                         | FR-013                                                 |
| G-16 迁移前零激活     | 迁移前不存在激活分支时沿用既有主分支恢复语义；每次连接校验至少存在一行                                                                                                    | FR-012、INV-1                                          |
| G-17 物化尝试可恢复   | 分支物化中断后重连：据持久 `CommitBranchMaterializationAttempt` 续做或整体回滚；成功后尝试行被**删除**                                                                    | FR-052、INV-12                                         |

> G-5（迁移 fencing）已随跨 realm writer lease 于 2026-08-16 取消而删除；编号保留空位以免既有引用错位。

### 3.2 缓存区与状态机（US3）

| 组                            | 断言                                                                                                                                                                                               | 溯源                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| S-1 依赖闭包正向              | 点名子实体 → 闭包自动含父实体新增；`closure ⊇ requested` 且如实回传                                                                                                                                | FR-029、[R-007](../research.md#r-007-依赖闭包算法) |
| S-2 跨事务扩展                | T1 建父、T2 建子，仅点名 T2 → 闭包含 T1                                                                                                                                                            | US3-AC4                                            |
| S-3 反向移除                  | unstage 父 → 依赖它的子也被移出                                                                                                                                                                    | FR-030                                             |
| S-4 自包含不变式              | 任意 stage/unstage 序列后，缓存区内每条目的前置依赖均在 HEAD 或缓存区内                                                                                                                            | FR-030、INV-5                                      |
| S-5 环处理                    | 不可拆分关系环整体纳入；无法形成合法闭包 → `index_dependency_cycle` 且缓存区**零变化**                                                                                                             | FR-031                                             |
| S-6 稳定排序                  | 相同输入多次 stage 产生逐位相同的 `sequence`                                                                                                                                                       | FR-030                                             |
| S-7 CAS 冲突                  | 两实例读同一 `indexRevision` 后并发提交 → 恰好 1 个成功，另一个拿到含 expected/actual 的冲突                                                                                                       | FR-034、SC-005                                     |
| S-8 激活校验                  | 所有捕获型写操作在 `activationRevision` 不匹配时 → `stale_active_branch`                                                                                                                           | FR-053                                             |
| S-9 无操作零副作用            | stage 空集 / unstage 不存在项 / discard 已 clean → 三个 revision 变化量均为 0                                                                                                                      | FR-035、SC-007                                     |
| S-10 残量 rebase              | 提交后未暂存条目按新 HEAD 重新基线化而非丢弃；冷重放仍成立                                                                                                                                         | FR-033                                             |
| S-11 状态迁移                 | `clean → modified → staged → clean` 全路径与 `restoring` / `conflicted` 的进入退出条件                                                                                                             | [data-model §4.3](../data-model.md#43-状态迁移)    |
| S-12 提交崩溃                 | 提交中途崩溃 → 重连后要么完整提交、要么完全未提交                                                                                                                                                  | FR-036                                             |
| S-13 显式删除可见             | 显式删除某单元后，该删除同时出现在 `headToWorkingTree` 与（暂存后）`headToIndex` 两条差异线上，`type = 'delete'`                                                                                   | US3-AC10                                           |
| S-14 `clearIndex` 字段级隔离  | `clearIndex()` 只清空缓存区并递增 `indexRevision`；工作树条目、`workingTreeRevision`、`activationRevision` 变化量均为 **0**（此断言要求 `rxdb_index_state` 与 `rxdb_working_tree_state` **分表**） | FR-034                                             |
| S-15 提交不因工作树变动而失败 | 提交只对 `indexRevision` + `activationRevision` 做捕获型校验；期间仅 `workingTreeRevision` 前进 **MUST NOT** 导致提交失败                                                                          | FR-031、FR-032                                     |
| S-16 恢复会话表随本故事交付   | 恢复会话的建表与 schema 迁移在**本套件**所在批次即可用（US5 只填生命周期），未启用 US5 时表已存在且为空                                                                                            | FR-036                                             |

### 3.3 恢复与分支隔离（US5 / US6 持久层）

| 组                        | 断言                                                                                                                                                                                                                                                                                                                                                                                                                      | 溯源           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| R-1 恢复不动 HEAD         | 恢复只产生**未暂存**工作树条目与会话行；HEAD 与历史提交行逐字段未被改写                                                                                                                                                                                                                                                                                                                                                   | FR-042、FR-043 |
| R-2 提交原子性            | 用户暂存闭包后走普通 `commit()`，新提交以**原 HEAD** 为父，会话在**同一事务内**转 `committed`；未暂存时提交仍按空缓存区拒绝                                                                                                                                                                                                                                                                                               | FR-042         |
| R-3 前置 clean            | 工作树非空或缓存区非空 → 拒绝；「仅已暂存」不得被误报为 clean                                                                                                                                                                                                                                                                                                                                                             | FR-043         |
| R-4 无操作                | 完整差异为空 → 返回 `{ kind: 'noop' }`，不建会话、不产生条目、三个 revision 变化量均为 **0**                                                                                                                                                                                                                                                                                                                              | FR-046         |
| R-5 CAS 非对称            | 初次恢复 CAS 失败 → 全量回滚且**不创建会话**；已存在会话的提交/丢弃 CAS 失败 → 保留会话与工作树并派生 `conflicted`                                                                                                                                                                                                                                                                                                        | FR-045         |
| R-6 revision 范围         | 初次恢复只递增 `workingTreeRevision`；丢弃仅在用户后来暂存过时才清空缓存区并递增 `indexRevision`；丢弃**删除**会话行                                                                                                                                                                                                                                                                                                      | FR-045         |
| R-7 路径级 schema 预检    | 先冻结物化路径，再逐个校验路径上**每个** change set；拒绝时返回**首个**不兼容提交 id、重放方向与双方 manifest，且不解码/写入后续 change set，零写入                                                                                                                                                                                                                                                                       | FR-044         |
| R-8 目标合法性            | 目标不存在 / 不可达 / 属于其他数据库 → 拒绝且工作树不变                                                                                                                                                                                                                                                                                                                                                                   | FR-044         |
| R-9 恢复断点              | 中途崩溃 → 据 `appliedUnitCount` 续做或整体回滚，两种终态都无半状态                                                                                                                                                                                                                                                                                                                                                       | FR-045         |
| B-1 分支隔离              | 分支 A 的工作树/缓存区在分支 B 上完全不可见                                                                                                                                                                                                                                                                                                                                                                               | FR-050         |
| B-2 **默认行为不变**      | `switchBranch(branchId)` 单参调用**仍编译**且**无条件切换**（脏工作树不阻断），与本特性上线前逐项一致；`public-type-compatibility` 同步断言适配器 `SwitchBranchOptions` 公开形态未变                                                                                                                                                                                                                                      | FR-048         |
| B-3 clean 检查是显式选项  | 仅当显式传入 `requireClean: true` 时才校验；非 clean → `working_tree_not_clean`，且 `recovery` 与真实成因一一对应（未暂存 / 仅已暂存 / 恢复会话三种成因给出三种不同建议）；历史上一次失败的普通条件更新 **MUST NOT** 构成非 clean                                                                                                                                                                                         | FR-048         |
| B-4 未物化分支            | 切换到未物化**本地**分支 → `branch_not_materialized`，不自动物化。唯一例外是 FR-052 的仅元数据远端分支（`local=false, remote=true`），它走 [core-api §8.6](./core-api.md#86-仅元数据远端分支的首次物化fr-052) 的首次物化路径；两条腿都要断言                                                                                                                                                                              | FR-047、FR-052 |
| B-5 切换 CAS              | 并发切换恰好 1 个成功，其余 `stale_active_branch`                                                                                                                                                                                                                                                                                                                                                                         | FR-053         |
| B-6 切换只动激活 revision | 切换成功后**只**递增 `activationRevision`；两分支的 `workingTreeRevision` / `indexRevision` 变化量均为 **0**                                                                                                                                                                                                                                                                                                              | FR-049         |
| B-7 createBranch          | **一参** `createBranch(branchId)`：`baseHeadCommitId` 与源分支相同，源分支未提交工作树条目**逐条复制为新分支独立行**，源分支已 staged 条目在新分支**转 unstaged**（缓存区为空），新分支三个 revision 从 0 起、源分支三个 revision 变化量均为 **0**，全程同一事务。**两参** `createBranch(branchId, fromChangeId)`：工作树与缓存区**都为空**。断言依 [core-api §8.4](./core-api.md#一参-createbranch-的脏工作树语义已裁决) | FR-051、FR-048 |
| B-8 removeBranch          | 删除该分支工作树/缓存区/状态行/分支引用行，孤儿条目数量 = **0**；**不**删除提交行与 change set 行；删除当前激活分支 → 拒绝                                                                                                                                                                                                                                                                                                | FR-051         |

---

## 4. 确定性要求（宪法 II）

- **禁止** `setTimeout`、禁止依赖真实时序、禁止依赖 BroadcastChannel 送达时机。
- 崩溃用**事务回调内确定性位点注入错误** + `disconnect()` / `connect()` 模拟。
- 并发用**同进程双实例同物理库** + 确定性交错顺序（A 读 revision → B 写 → A 写）。
- 分页崩溃用「第 N 页后抛错」参数化，N 是显式常量而非随机值。

---

## 5. 覆盖率门禁

| 包                                  | 阈值  |
| ----------------------------------- | ----- |
| `packages/rxdb`                     | ≥ 90% |
| `packages/rxdb-test`                | ≥ 80% |
| `packages/rxdb-adapter-*`           | ≥ 80% |
| `packages/rxdb-{angular,react,vue}` | ≥ 80% |

由既有 `pnpm audit:coverage` 执行。
