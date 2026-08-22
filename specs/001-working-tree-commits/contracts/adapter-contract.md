# Contract: 适配器与写入口契约

**Feature**: [spec.md](../spec.md) | **Research**: [research.md](../research.md) | **Date**: 2026-08-15

本文件冻结 6 个 v1 后端必须满足的适配器契约，以及写入口的受信登记全集。

---

## 1. v1 后端矩阵

| #   | 后端                | 包                                       | SQL 方言   | 运行环境           |
| --- | ------------------- | ---------------------------------------- | ---------- | ------------------ |
| 1   | PGlite              | `rxdb-adapter-pglite`                    | PostgreSQL | 浏览器 + Node      |
| 2   | wa-sqlite           | `rxdb-adapter-wa-sqlite`                 | SQLite     | 浏览器（OPFS/IDB） |
| 3   | sqlite-wasm         | `rxdb-adapter-sqlite-wasm`               | SQLite     | 浏览器             |
| 4   | sqlite（官方 wasm） | `rxdb-adapter-sqlite`                    | SQLite     | 浏览器             |
| 5   | sqliteai            | `rxdb-adapter-sqliteai`                  | SQLite     | 浏览器             |
| 6   | Electron 桌面       | `rxdb-adapter-electron`（`node:sqlite`） | SQLite     | Electron 主进程    |

**任一后端缺席 = 整个故事未完成**（SC-003）。2–6 共享 [`rxdb-adapter-sqlite-core`](../../../packages/rxdb-adapter-sqlite-core/) 的 SQL 实现，因此 SQL 层实际只有**两处**实现：PGlite 与 sqlite-core。

**明确不承诺**（v1 非目标）：Tauri Rust 宿主、小程序运行时。二者不在一致性矩阵内，也不作为验收依据。

---

## 2. 适配器必须新增的原语

| 原语                 | 语义                                                                            | 已有？                                                                         |
| -------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 条件更新回传影响行数 | `UPDATE ... WHERE rev = :expected` 返回 `rowsAffected`，`0` 即 CAS 冲突         | ✅ 已有并有一致性套件覆盖                                                      |
| 部分唯一索引         | `CREATE UNIQUE INDEX ... WHERE <col> = <const>`                                 | ❌ 需新增（[R-003](../research.md#r-003-head-的唯一真相源与激活分支基数约束)） |
| 写入意图透传         | `mergeChanges` / `switchBranch` 携带 `RxDBWriteIntent` 并在同事务内落工作树条目 | ❌ 需新增（[R-006](../research.md#r-006-写入意图枚举与受信登记)）              |
| 系统 schema v4 建表  | **11 张新表**（[data-model §8](../data-model.md)），仅在启用时创建              | ❌ 需新增                                                                      |

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

登记表位于 `packages/rxdb/src/working-tree/write-intent.ts`，键为 `{ file, symbol, intent }` 三元组（**不含行号**）。以下 11 项为 v1 全集，逐条对应真实生产代码调用点。

**符号取实际发起该次批量重写的最内层具名函数**，不是把调用委托出去的公开门面方法——门面方法不出现在扫描
结果里，用它当键会让 §4.5 的双向差集永远报「登记了但不存在」。本节链接**一律不带行号锚点**：键本身不含行号，
链接带锚点会让读者误以为行号是键的一部分，且锚点本身会漂移。

### 4.1 经 `mergeChanges`（本地重载）

| #   | 文件                                                                                  | 符号                                                  | 语义             | intent           | 产生工作树条目 |
| --- | ------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------- | ---------------- | -------------- |
| 1   | `transaction/*TransactionExecutor`                                                    | `mergeChanges` 常规提交路径                           | 普通 CRUD        | `local`          | ✅             |
| 2   | [`version/merge-branch.ts`](../../../packages/rxdb/src/version/merge-branch.ts)       | `merge_branch`（逐条路径，`executor.mergeChanges`）   | 合并分支         | `merge`          | ✅             |
| 3   | [`version/merge-branch.ts`](../../../packages/rxdb/src/version/merge-branch.ts)       | `merge_branch`（squash 路径，`adapter.mergeChanges`） | 合并分支         | `merge`          | ✅             |
| 4   | [`version/pull-repository.ts`](../../../packages/rxdb/src/version/pull-repository.ts) | `pullSingleRepository`                                | 远端拉取应用     | `remoteSync`     | ✅             |
| 5   | [`version/pull-batch.ts`](../../../packages/rxdb/src/version/pull-batch.ts)           | `pullBatchOnce`                                       | 远端拉取分批应用 | `remoteSync`     | ✅             |
| 6   | [`version/cleanup-expired.ts`](../../../packages/rxdb/src/version/cleanup-expired.ts) | `cleanupExpired`                                      | 过期数据清理     | `expiredCleanup` | ✅             |

第 2、3 项**同文件、同符号、同 intent，但调用点不同**（一个走 `executor.mergeChanges`、一个走
`adapter.mergeChanges`），两条都必须登记。因此漂移扫描 MUST 按**调用点**计数，不得按 `{ file, symbol, intent }`
三元组去重——去重会让其中一条被静默吞掉，扫描仍报绿。

### 4.2 经 `switchBranch`

| #   | 文件                                                                                | 符号                         | 语义                            | intent                  | 产生工作树条目 |
| --- | ----------------------------------------------------------------------------------- | ---------------------------- | ------------------------------- | ----------------------- | -------------- |
| 7   | [`version/HistoryManager.ts`](../../../packages/rxdb/src/version/HistoryManager.ts) | `#apply_undo_redo_histories` | undo / redo 应用                | `undoRedo`              | ✅             |
| 8   | [`version/restore-entity.ts`](../../../packages/rxdb/src/version/restore-entity.ts) | `restore_entity`             | 单条 change 恢复                | `restore`               | ✅             |
| 9   | [`version/VersionManager.ts`](../../../packages/rxdb/src/version/VersionManager.ts) | `switchBranch`               | 切换分支物化                    | `branchMaterialization` | ❌             |
| 10  | [`version/HistoryManager.ts`](../../../packages/rxdb/src/version/HistoryManager.ts) | `invalidateRedoStack`        | 仅写 `redoInvalidatedAt` 元数据 | `metadataOnly`          | ❌             |

第 8 项的文件是 **`restore-entity.ts`**，不是 `VersionManager.ts`：`VersionManager.restoreEntity()` 只把调用
委托给 `restore_entity()`，真正的 `adapter.switchBranch` 发生在后者。

### 4.3 新增

| #   | 文件                         | 语义                 | intent                    | 产生工作树条目 |
| --- | ---------------------------- | -------------------- | ------------------------- | -------------- |
| 11  | `commit/enable-migration.ts` | 启用迁移内的基线物化 | `baselineMaterialization` | ❌             |

### 4.4 明确不在范围内

[`version/push-repository.ts`](../../../packages/rxdb/src/version/push-repository.ts) 的 `mergePushBatch` 调用的是**远端重载** `mergeChanges(actions, branchId, changes)`，写的是远端库，不产生本地工作树条目，也不参与登记。漂移扫描必须能区分这两个同名重载：本地重载第 2 参是 `localChanges`、第 3 参是 `disableTriggers`；远端重载第 2 参是 `branchId`。仅凭方法名匹配会把 `mergePushBatch` 误报成「未登记调用点」，让门禁永远红。

### 4.5 漂移门禁

`scripts/audit/write-intent-drift.mjs`：

- 扫描 `packages/*/src/**/*.ts`，**排除** `dist/`、`*.spec.ts`、`*.suite.ts`。
- 对登记表与实际调用点求**双向差集**：未登记的调用点 → 失败；登记了但已不存在的条目 → 失败（防止登记表烂掉）。
- 判据：未登记调用点数量为 **0**（SC-004）。

### 4.6 raw SQL / adapter 直写的 bypass 门禁（已裁决）

§4.1–§4.3 的登记只能约束 RxDB **自己的内部路径**。[`rawQuery?()`](../../../packages/rxdb/src/rxdb-adapter.ts) 是 `IRxDBAdapter` 的**公开可选原语**，用途明确包含绕过 ORM 的条件 UPDATE，6 个 v1 后端全部实现（SQLite 五家共用 `RxDBAdapterSqliteBase`，PGlite 单独实现）。本节冻结它与 epic-006 写入口矩阵最后一行的对应机制。

**「启用后 rawQuery 整体只读」已被否决**：[`@aiao/rxdb-plugin-search`](../../../packages/rxdb-plugin-search/src/core/fts5-runtime.ts) 的 FTS5 建表与回填本身就走 `rawQuery` 写虚拟表，整体只读会连带打死搜索插件。

**裁决：按目标表判定 + 受信 intent 豁免。** 每次 `rawQuery` 调用在**语句执行前**按下列顺序判定：

1. commit 能力**未启用** → 原样放行，零行为差异（与 INV-10 同一口径）。
2. 调用携带内部受信 `intent`（非公开参数，仅 §4.1–§4.3 登记表内的路径可传）→ 放行。
3. 非写语句（`SELECT` / `EXPLAIN` / 只读 `PRAGMA` / `WITH … SELECT`）→ 放行。
4. 写目标表 ∩ **版本化业务实体表** ≠ ∅ → 抛 `commit_capability_mismatch`，**业务表零变化**（拒绝发生在执行前，不是写完回滚）。
5. 其余写目标（FTS5 虚拟表与影子表、`rxdb_*` 系统表、查询缓存实体表、临时表）→ 放行。

**「版本化业务实体表」**= 已注册实体中 `sync.type !== SyncType.QueryCache` 的那些的 SQL 表名——与 INV-9 / FR-021 引用的是同一个集合，**MUST NOT** 另建第二份清单。

**解析取保守口径（fail-closed）**：

- 目标表**无法确定**（动态拼接、多语句串、方言不认识的构造）→ 按**拒绝**处理。宁可误伤，不可放过。
- 大小写、引号标识符（SQLite 的 `` ` `` / `[]`、PG 的 `""`）、schema 限定（`public.x`）在比对前归一化。
- 6 个后端共用**同一份**判定实现，方言差异只体现在词法层，不得每个后端各写一套。

**能力边界（写进公开文档，不假装拦得住）**：本门禁只覆盖**经 adapter 的 `rawQuery`**。绕过 adapter 的外部数据库句柄——另开 `sqlite3` 连接、直接打开 OPFS 文件、用 psql 连 PGlite——**拦不住**，v1 也不承诺拦得住；启用提交能力的数据库 MUST 在文档中声明「业务表只能经 RxDB 写入」。

**为什么不做数据库 trigger fail-closed**：那是唯一能拦住外部句柄的方案，但受信标记的载体在 6 个后端不统一（PGlite 用 session GUC、SQLite 侧需 temp table 或 pragma 承载），且每张版本化表要挂 3 个 trigger。成本与 v1 收益不匹配，**留作后续故事，不在本特性范围内**。

**一致性 fixture（6 个后端各一份，SC-003）**：

| 场景                             | 期望                                        |
| -------------------------------- | ------------------------------------------- |
| `rawQuery` 写版本化实体表        | `commit_capability_mismatch` 且业务表零变化 |
| `rawQuery` 写 FTS5 影子表        | 放行（搜索插件回归）                        |
| `rawQuery` 写查询缓存实体表      | 放行                                        |
| `rawQuery` `SELECT` 版本化实体表 | 放行                                        |
| 目标表无法确定的动态 SQL         | 拒绝                                        |
| 受信 `intent` 路径写版本化实体表 | 放行，是否产生工作树条目按 §4.1–§4.3 登记表 |
| **未启用** commit 能力时以上全部 | 一律放行                                    |

---

## 5. 事务原子性契约

所有后端 MUST 保证：

1. 业务数据写入与工作树条目写入在**同一物理事务**内提交（FR-018）。
2. 事务回滚 ⇒ 两者同时不存在；不存在「业务数据已落、条目未落」或其逆的半状态（SC-002 判据：半状态率 0）。
3. 崩溃后重连 ⇒ 只能看到上一次**完整一致**的状态。
4. 同一回调事务内混写查询缓存实体与版本化实体 ⇒ 抛 `mixed_versioned_cache_transaction` 并回滚整个事务（FR-022）。

---

## 6. 迁移契约

- 系统 schema 由 3 迁到 4，走既有 watermark + `rxdb_migration` 认领执行权机制；执行权竞争 → `RxDBMigrationClaimConflictError` 重试。
- 迁移期间的排他性只由后端排他锁（SQLite `BEGIN EXCLUSIVE` / PGlite 表锁）承担；不存在跨 realm 的写入方 lease 或 epoch fencing，落后写入方一律走领域版本号条件更新失败路径（FR-008）。
- 建部分唯一索引前校验 INV-1；违反 → 整个迁移失败并返回 `ambiguous_active_branch`。
- 建表与基线物化在同一迁移事务内，基线物化本身可重试且幂等。
- 分页物化的中途崩溃 ⇒ 重连后要么续做、要么整体回滚，两种终态都无半状态。

---

## 7. 损坏检测与降级（**按分支隔离**）

FR-014 的降级单位是**分支**，不是数据库。检出某分支可达路径上的提交图不变式破坏（INV-2 / INV-3）时：

1. 抛 `commit_graph_corrupted`，携带被破坏的不变式标识、**首个**损坏节点 id 与修复建议。
2. **仅该分支**进入 `corrupted_read_only`：阻止该分支的提交、恢复与切入；保留读取与诊断导出能力。
3. 保留原分支引用与原始记录：**不**自动修复、**不**自动改指针、**不**删除任何提交行或 change set 行。
4. **其他健康分支照常可用**——MUST NOT 整库降级、MUST NOT 阻断未受影响分支的普通 CRUD。

一致性套件对应断言见 [conformance-suites.md](./conformance-suites.md) G 组：构造一条损坏分支后，另一条健康分支的 `status()` / `stage()` / `commit()` 全部正常返回。
