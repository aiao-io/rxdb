# Contract: 一致性套件

**Feature**: [../spec.md](../spec.md) | **Adapter contract**: [./adapter-contract.md](./adapter-contract.md)

**两套具名套件，没有第三套。** US-305 的 commit 图与迁移断言**并入提交套件**，不另起套件名——第三个名字会让「哪套是权威」重新变成开放问题。

> 旧 conformance-suites.md 的 staging / 依赖闭包 / 环检测 / `HEAD ↔ index` 用例**全部作废**。

## 0. 两套套件

| 套件                                 | 导出位置                        | 覆盖                                                           | 归属               |
| ------------------------------------ | ------------------------------- | -------------------------------------------------------------- | ------------------ |
| `workingTreeCaptureConformanceSuite` | `packages/rxdb`（`*.suite.ts`） | 捕获完备性、写入口语义矩阵、bypass 判定、untracked 域          | US-306 阶段 A      |
| `workingTreeCommitConformanceSuite`  | `packages/rxdb`（`*.suite.ts`） | commit 图、HEAD 持久化、迁移、CAS、损坏守卫、restore、分支隔离 | US-305 + 阶段 B 起 |

调用形状（两套一致）：

```ts
workingTreeCaptureConformanceSuite({
  name: 'pglite',
  createDatabase: async () => /* 返回已启用提交能力的 RxDB 实例 */,
});
```

**运行矩阵 = 6 个 v1 适配器 × 2 套套件。** 套件文件按 `*.suite.ts` 命名，因此被命名门禁与漂移扫描排除，但**必须**被每个适配器包的 `*.spec.ts` 实际调用——「导出了但没人跑」等于没覆盖，套件自身要断言这一点的反面：CI 校验 6 个适配器包各自都有调用点。

## 1. `workingTreeCaptureConformanceSuite`

### 1.1 捕获完备性（4 个挂载点各自成组）

| 组                         | 断言                                                                  |
| -------------------------- | --------------------------------------------------------------------- |
| `transaction`              | 普通 CRUD / 显式事务落 `origin='local'` 单元；整事务共享同一 `unitId` |
| 本地 `mergeChanges`        | restore / merge / 同步应用各自落对应 origin 的单元                    |
| `switchBranch`             | 分支物化与 redo 失效**不产生**单元；undo/redo **产生**单元            |
| `upsertMany`/`deleteByIds` | 版本化实体 → 同步拒绝；QueryCache 实体 → 放行                         |

**冷重放不变量**（每组末尾都跑）：清空进程内缓存后，`HEAD + WorkingTreeEntry` 重放出的净状态必须逐字段等于业务表当前值。这是「捕获是否完备」的**唯一**判据，不靠计数相等。

### 1.2 写入口语义矩阵逐行

spec.md「写入口语义矩阵」的**每一行**对应至少一条用例，包含：

- 只更新 `remoteId` / 同步水位 / 审计时间 → **不创建单元、不递增 revision**。
- `cleanupExpired()` 的过期删除 → 落 `origin='remote_sync'` 的 DELETE 单元并递增 revision。
- metadata-only 目标分支预取 → 只写 staging 与独立水位，**不动**当前分支同步状态与业务表。
- QueryCache upsert/delete/孤儿清理与离线出站重放 → 不进 baseline / status / diff / commit。
- `EntityManager.notifyExternalUpdate()` 对版本化实体 → 抛 `commit_capability_mismatch`；对 QueryCache 实体行为不变。
- 未知入口 → **默认拒绝**（不能先改业务表再靠事件补记）。

### 1.3 bypass 判定 5 步

每一步一组用例；第 4 步必须断言**业务表零变化**（执行前拒绝，不是写完回滚），并且用「列集无法解析」的语句断言 fail-closed。

### 1.4 untracked 域

- 三类 untracked 各一组；**第四类必须先改 epic-006**——套件里放一条「清单外的实体默认 tracked」的断言把这条规则钉死。
- tracked 与 untracked 混进同一事务 → `mixed_versioned_cache_transaction` 且**整事务回滚**。
- `origin='remote_sync'` **不是** untracked：它照常产生单元。
- untracked 判定是**静态属性**：同一实体不得在一条入口 tracked、另一条 untracked。

### 1.5 存储契约静态断言

- `rxdb_working_tree_entry` 与 `rxdb_commit_change_set` 的 `relations` 中**不得出现** `mappedEntity: 'RxDBChange'`。
- 全部新系统表 `log === false`。
- 全部新系统表出现在 `SYSTEM_ENTITIES` 中且 `isSystemEntity()` 为真。

## 2. `workingTreeCommitConformanceSuite`

### 2.1 commit 图与 HEAD（US-305）

- 提交节点只追加：任何路径都不 UPDATE / DELETE `rxdb_commit`。
- 同一 `operationId` 重复提交 → **幂等命中现有节点**，不产生第二个。
- 重启 / 刷新 / 崩溃后 HEAD 与工作树语义一致。
- `CommitChangeSet` 自带完整恢复数据：**删掉全部 `rxdb_change` 行后**，历史仍可完整重放——这条用例是「不引用可能被删的 change」的实测形式。

### 2.2 一次性启用迁移（US-305）

- 已有数据库启用后：每个既存分支都有 ref / state 初始行；`generation` 互不相同。
- 迁移**全有或全无**：注入任一分支初始化失败 → 整体回滚，`RXDB_SYSTEM_SCHEMA_VERSION` 停在 3。
- 未启用的数据库：全部捕获与门禁短路，**行为与未安装本特性逐字节一致**（FR-046）。

### 2.3 CAS 两类分开

| 类别           | 用例                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------- |
| 调用方捕获型   | `status()` → 另一连接 `save()` → `commit()` **必须**返回 `CommitConflict`（SC-008 点名） |
| 事务内读改写型 | 高并发普通 CRUD **不得**因并发失败（否则违反 FR-032）                                    |

第二条是防回归用例：一旦有人把普通 CRUD 改成捕获型，它立刻红。

### 2.4 commit 原子性

- 四步同事务；注入「写完 changeSet 后崩溃」→ 恢复后**要么全有要么全无**，绝不出现半清空的工作树。
- `entryCount` 与实际行数在任何时刻一致。

### 2.5 损坏守卫（三入口同一份）

- 孤立损坏 → 只隔离记录，其他分支照常可用。
- HEAD 或可达祖先损坏 → 分支进入 `corrupted_read_only`；`commit()` / `restore()` / switch-to **三条入口各自**返回 `commit_graph_corrupted`，**不改指针、不删记录**。
- 不依赖重放的当前投影读取、诊断导出、「切离」该分支**不受影响**。

### 2.6 restore（US-307）

- restore 写回的是**新的未提交变更**：HEAD 不动、历史不变。
- 没有 `checkout()`、没有 detached HEAD——套件断言公开面上不存在这类符号。
- `status().conflicted` 只由仍存在的 `WorkingTreeRestoreSession` 派生；`CommitConflict` **不会**让它变真。
- 一分支至多一个未结束会话（`activeKey` 唯一索引的行为断言）。

### 2.7 分支隔离与跨 realm 冲突（US-308）

- 分支各自独立的工作树；切换不泄漏。
- `switchBranch(branchId)` **不带** options 时行为与今天一致。
- 物化 staging 只写目标分支快照，不写当前业务投影；成功后 staging 整体删除。
- 半份 payload 不得被当作完整快照物化。
- 删分支后同名重建拿到新 `generation`：持旧 `(branchId, headRevision)` 的 CAS **必须**失败（ABA 防护）。

## 3. 套件之外

性能不进 conformance——它在 [benchmark-report.md](./benchmark-report.md)。三框架对称不进 conformance——它在 [tri-framework-api.md](./tri-framework-api.md)。覆盖率不进 conformance——单一真相源是 `scripts/audit/coverage-check.mjs`。
