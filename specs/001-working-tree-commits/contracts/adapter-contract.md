# Contract: 适配器与写入口契约

**Feature**: [spec.md](../spec.md) | **Research**: [research.md](../research.md) | **Date**: 2026-08-15

本文件冻结 6 个 v1 后端必须满足的适配器契约，以及写入口的受信登记全集。

---

## 1. v1 后端矩阵

| # | 后端 | 包 | SQL 方言 | 运行环境 |
| --- | --- | --- | --- | --- |
| 1 | PGlite | `rxdb-adapter-pglite` | PostgreSQL | 浏览器 + Node |
| 2 | wa-sqlite | `rxdb-adapter-wa-sqlite` | SQLite | 浏览器（OPFS/IDB） |
| 3 | sqlite-wasm | `rxdb-adapter-sqlite-wasm` | SQLite | 浏览器 |
| 4 | sqlite（官方 wasm） | `rxdb-adapter-sqlite` | SQLite | 浏览器 |
| 5 | sqliteai | `rxdb-adapter-sqliteai` | SQLite | 浏览器 |
| 6 | Electron 桌面 | `rxdb-adapter-electron`（`node:sqlite`） | SQLite | Electron 主进程 |

**任一后端缺席 = 整个故事未完成**（SC-003）。2–6 共享 [`rxdb-adapter-sqlite-core`](../../../packages/rxdb-adapter-sqlite-core/) 的 SQL 实现，因此 SQL 层实际只有**两处**实现：PGlite 与 sqlite-core。

**明确不承诺**（v1 非目标）：Tauri Rust 宿主、小程序运行时。二者不在一致性矩阵内，也不作为验收依据。

---

## 2. 适配器必须新增的原语

| 原语 | 语义 | 已有？ |
| --- | --- | --- |
| 条件更新回传影响行数 | `UPDATE ... WHERE rev = :expected` 返回 `rowsAffected`，`0` 即 CAS 冲突 | ✅ 已有并有一致性套件覆盖 |
| 部分唯一索引 | `CREATE UNIQUE INDEX ... WHERE <col> = <const>` | ❌ 需新增（[R-003](../research.md#r-003-head-的唯一真相源与激活分支基数约束)） |
| 写入意图透传 | `mergeChanges` / `switchBranch` 携带 `RxDBWriteIntent` 并在同事务内落工作树条目 | ❌ 需新增（[R-006](../research.md#r-006-写入意图枚举与受信登记)） |
| 系统 schema v4 建表 | 7 张新表，仅在启用时创建 | ❌ 需新增 |

除此之外**不引入任何新的跨方言原语**——这是把跨后端一致性风险压到最低的硬约束。

---

## 3. 索引元数据扩展

[`EntityIndexMetadataOptions`](../../../packages/rxdb/src/entity/metadata-options.interface.ts#L801) 追加：

```
EntityIndexMetadataOptions {
  properties?: string[]
  normalized?: boolean
  unique?: boolean
  where?: { property: string; equals: boolean | null }   // 新增
}
```

- `where` 只允许「某列等于某布尔常量或 NULL」这一种形态，禁止任意 SQL 串。
- 两处 SQL 实现各自把它翻译成 `WHERE <col> = TRUE` / `WHERE <col> IS NULL`。
- 未声明 `where` 的既有索引行为完全不变（向后兼容）。

---

## 4. 写入口受信登记

登记表位于 `packages/rxdb/src/working-tree/write-intent.ts`，键为 `{ file, symbol, intent }` 三元组（**不含行号**）。以下 11 项为 v1 全集，逐条对应真实生产代码调用点：

### 4.1 经 `mergeChanges`（本地重载）

| # | 文件 | 语义 | intent | 产生工作树条目 |
| --- | --- | --- | --- | --- |
| 1 | `transaction/*TransactionExecutor` 常规提交路径 | 普通 CRUD | `local` | ✅ |
| 2 | [`version/merge-branch.ts`](../../../packages/rxdb/src/version/merge-branch.ts#L127) 逐条路径 | 合并分支 | `merge` | ✅ |
| 3 | [`version/merge-branch.ts`](../../../packages/rxdb/src/version/merge-branch.ts#L151) squash 路径 | 合并分支 | `merge` | ✅ |
| 4 | [`version/pull-repository.ts`](../../../packages/rxdb/src/version/pull-repository.ts#L629) | 远端拉取应用 | `remoteSync` | ✅ |
| 5 | [`version/pull-batch.ts`](../../../packages/rxdb/src/version/pull-batch.ts#L380) | 远端拉取分批应用 | `remoteSync` | ✅ |
| 6 | [`version/cleanup-expired.ts`](../../../packages/rxdb/src/version/cleanup-expired.ts#L201) | 过期数据清理 | `expiredCleanup` | ✅ |

### 4.2 经 `switchBranch`

| # | 文件 | 语义 | intent | 产生工作树条目 |
| --- | --- | --- | --- | --- |
| 7 | [`version/HistoryManager.ts`](../../../packages/rxdb/src/version/HistoryManager.ts#L1472) | undo / redo 应用 | `undoRedo` | ✅ |
| 8 | [`version/VersionManager.ts`](../../../packages/rxdb/src/version/VersionManager.ts#L936) | 单条 change 恢复 | `restore` | ✅ |
| 9 | [`version/VersionManager.ts`](../../../packages/rxdb/src/version/VersionManager.ts#L769) | 切换分支物化 | `branchMaterialization` | ❌ |
| 10 | [`version/HistoryManager.ts`](../../../packages/rxdb/src/version/HistoryManager.ts#L948) | 仅写 `redoInvalidatedAt` 元数据 | `metadataOnly` | ❌ |

### 4.3 新增

| # | 文件 | 语义 | intent | 产生工作树条目 |
| --- | --- | --- | --- | --- |
| 11 | `commit/enable-migration.ts` | 启用迁移内的基线物化 | `baselineMaterialization` | ❌ |

### 4.4 明确不在范围内

[`version/push-repository.ts:534`](../../../packages/rxdb/src/version/push-repository.ts#L534) 调用的是**远端重载** `mergeChanges(actions, branchId, changes)`，写的是远端库，不产生本地工作树条目，也不参与登记。漂移扫描必须能区分这两个同名重载。

### 4.5 漂移门禁

`scripts/audit/write-intent-drift.mjs`：

- 扫描 `packages/*/src/**/*.ts`，**排除** `dist/`、`*.spec.ts`、`*.suite.ts`。
- 对登记表与实际调用点求**双向差集**：未登记的调用点 → 失败；登记了但已不存在的条目 → 失败（防止登记表烂掉）。
- 判据：未登记调用点数量为 **0**（SC-004）。

---

## 5. 事务原子性契约

所有后端 MUST 保证：

1. 业务数据写入与工作树条目写入在**同一物理事务**内提交（FR-018）。
2. 事务回滚 ⇒ 两者同时不存在；不存在「业务数据已落、条目未落」或其逆的半状态（SC-002 判据：半状态率 0）。
3. 崩溃后重连 ⇒ 只能看到上一次**完整一致**的状态。
4. 同一回调事务内混写查询缓存实体与版本化实体 ⇒ 抛 `mixed_versioned_cache_transaction` 并回滚整个事务（FR-022）。

---

## 6. 迁移契约

- 系统 schema 由 3 迁到 4，走既有 watermark + `rxdb_migration` 占坑机制；占坑冲突 → `RxDBMigrationClaimConflictError` 重试。
- 迁移期间 `rxdb_upgrade_guard` / `rxdb_writer_lease` 的 epoch **仅**用于 fencing 落后写入方（FR-008）；落后写入方得到 `writer_fenced`。epoch **不得**被复用为工作树/缓存区的并发控制。
- 建部分唯一索引前校验 INV-1；违反 → 整个迁移失败并返回 `ambiguous_active_branch`。
- 建表与基线物化在同一迁移事务内，基线物化本身可重试且幂等。
- 分页物化的中途崩溃 ⇒ 重连后要么续做、要么整体回滚，两种终态都无半状态。

---

## 7. 损坏检测与降级

检出提交图不变式破坏（INV-2 / INV-3）时：

1. 抛 `commit_graph_corrupted`，携带被破坏的不变式标识与涉及的提交 id。
2. 数据库进入 `corrupted_read_only` 降级：拒绝一切写入，保留读取与诊断导出能力。
3. **不**自动修复、**不**自动删除任何提交行。
