# Contract: 适配器义务

**Feature**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md) | **Research**: [../research.md](../research.md)

本文件冻结 6 个 v1 适配器必须履行的义务。**能履行 = 通过 [conformance-suites.md](./conformance-suites.md) 的两套套件**，不靠自述。

> 旧 adapter-contract.md 中与缓存区、依赖闭包、`HEAD ↔ index` 有关的义务**全部作废**。

## 0. v1 支持矩阵

| 适配器                     | 宿主               | 入 v1 矩阵 |
| -------------------------- | ------------------ | ---------- |
| `rxdb-adapter-pglite`      | 浏览器 / Node      | ✅         |
| `rxdb-adapter-wa-sqlite`   | 浏览器 OPFS        | ✅         |
| `rxdb-adapter-sqlite-wasm` | 浏览器             | ✅         |
| `rxdb-adapter-sqlite`      | Node               | ✅         |
| `rxdb-adapter-sqliteai`    | 浏览器 WASM        | ✅         |
| `rxdb-adapter-electron`    | `node:sqlite` host | ✅         |
| `rxdb-adapter-tauri`       | Rust host          | ❌ 不入 v1 |
| `rxdb-adapter-miniprogram` | 小程序             | ❌ 不入 v1 |

不入矩阵 ≠ 允许被破坏：它们仍必须在**未启用**提交能力时零行为差异（FR-046）。

## 1. 捕获挂载点（4 个，不是 1 个）

捕获必须挂在**适配器写原语**上，不能挂在 Repository 层——Repository 拿不到同事务的原子边界，也覆盖不了同步与撤销路径。

| #   | 原语                                                     | 位置                                  | 为什么必须挂                                 |
| --- | -------------------------------------------------------- | ------------------------------------- | -------------------------------------------- |
| 1   | `transaction(fun, transactionLog?)`                      | `rxdb-adapter.ts:134`                 | 普通 CRUD 与显式事务的共同入口，提供原子边界 |
| 2   | `mergeChanges(actions, localChanges?, disableTriggers?)` | `rxdb-adapter.ts:200`（**本地**重载） | restore / merge / 同步的实体应用             |
| 3   | `switchBranch(options)`                                  | `rxdb-adapter.ts:182`                 | 分支物化、redo 失效标记、undo/redo 应用      |
| 4   | `upsertMany()` / `deleteByIds()`                         | `rxdb-adapter.ts:239` / `:255`        | **不经 `rawQuery`**，不显式挂载就是一个敞口  |

`mergeChanges` 的**远端重载**（`rxdb-adapter.ts:322`，签名 `(actions, branchId?, changes?)`）**不属于**本表——它推送到远端，不写本地业务投影。重载必须**按签名**区分，不能按函数名。

### 1.1 `upsertMany` / `deleteByIds` 返回 `Observable`

两者返回 `Observable<void>` 而不是 `Promise`。因此门禁必须在**返回 Observable 之前同步拒绝**，而不是在 `subscribe` 时才抛。否则「执行前拒绝、业务表零变化」不成立——调用方可能永远不订阅，也可能订阅时表已被别的路径改过。

## 2. raw 写路径的 bypass 判定（4 步，6 后端同一份实现）

每次 raw 调用在**语句执行前**顺序判定：

1. 提交能力**未启用** → 放行，零行为差异。
2. 非写语句 → 放行。
3. 写目标表 ∩ 版本化业务实体表 ≠ ∅ **且** 被写列集 ⊄ untracked 字段域 → 抛 `commit_capability_mismatch`，**业务表零变化**。列集无法确定时按「不是子集」处理。
4. 其余写目标（FTS 虚拟表与影子表、系统表、QueryCache 实体表、临时表），以及第 3 步中**只**触及 untracked 字段域的写入 → 放行；后者放行后不创建工作树单元、不递增 revision。

**没有「受信 `intent` 豁免」这一步。** 判定曾有过一步「携带内部受信 `intent` → 放行」，2026-09-23 连同上下文槽位一并删除：§3 登记表的条目全部走**带类型的**写原语（`switchBranch` / `mergeChanges` / `transaction`），一个 raw 调用点都没有，那一步在生产里永远取不到真值——却是整条防线上唯一无条件放行的一步。未来真要内部受信 raw 写路径，先补一条能证明身份的传递通道，见 [../threat-model.md](../threat-model.md) §3。

**实现约束**：

- 「版本化业务实体表」与「untracked 字段域」两个集合与 spec.md「版本化域」引用**同一份清单**，不得另建第二份。
- 判定实现**只有一份**，落在 `packages/rxdb-plugin-working-tree`（核心 `packages/rxdb` 只留 `gateRawWrite()` 的接缝，不认识域也不认识表名）；方言差异只体现在词法归一化层（大小写、引号标识符、schema 限定在比对前归一化）。
- 解析取**保守口径（fail-closed）**：解析不出目标表或列集就当作命中第 3 步。
- `rawQuery?()` 在 `rxdb-adapter.ts:163` 上是**可选方法**。因此判定不能假设每个适配器都实现了它：共享判定由插件导出，**由各适配器自己的 `rawQuery` 实现调用**；没有 `rawQuery` 的适配器不因此获得豁免——它的 `upsertMany` / `deleteByIds` 仍受第 1 节约束。
- `upsertMany()` / `deleteByIds()` 复用同一份清单与同一判定，但入参是**整行**而非列集，因此对版本化实体**一律落第 3 步**。

## 3. 受信调用点登记表（已与真实代码核对，2026-09-16）

登记键固定为**「文件 + 符号 + 意图」**，符号取实际发起该次批量重写的**最内层具名函数**，不是委托门面，也不是行号。行号仅供本次核对存档。

文件一列只写**基名**：US-025 抽包把 #1~#9 从核心 `packages/rxdb/src/version/` 搬进了两个插件（#1~#6 → `@aiao/rxdb-plugin-history/src/`，#7~#9 → `@aiao/rxdb-plugin-sync/src/`），登记键必须跨这种搬迁存活，所以它不含目录。#10 / #11 从一开始就在 `@aiao/rxdb-plugin-working-tree/src/`。登记表本身仍在 `packages/rxdb/src/trusted-write/trusted-write-intent.ts`——它是 `declareTrustedWrite()` 的准入名单，而那道门禁在核心。

| #   | 文件（基名）            | 符号                        | 写原语                            | 行  | 意图          | 产生工作树单元 |
| --- | ----------------------- | --------------------------- | --------------------------------- | --- | ------------- | -------------- |
| 1   | `VersionManager.ts`     | `switchBranch`              | `adapter.switchBranch`            | 280 | 分支物化      | **不产生**     |
| 2   | `restore-entity.ts`     | `restore_entity`            | `executor.mergeChanges(…, false)` | 94  | 实体恢复      | **必须产生**   |
| 3   | `HistoryManager.ts`     | `invalidateRedoStack`       | `adapter.switchBranch`            | 537 | redo 失效标记 | **不产生**     |
| 4   | `undo-redo-apply.ts`    | `applyUndoRedoHistories`    | `adapter.switchBranch`            | 171 | 撤销 / 重做   | **必须产生**   |
| 5   | `merge-branch.ts`       | `merge_branch`（逐条分支）  | `executor.mergeChanges(…, false)` | 134 | 逐条合并      | **必须产生**   |
| 6   | `merge-branch.ts`       | `merge_branch`（压缩分支）  | `executor.mergeChanges(…, false)` | 174 | 压缩合并      | **必须产生**   |
| 7   | `pull-batch.ts`         | `pullBatchOnce`             | `executor.mergeChanges(…, true)`  | 349 | `remote_sync` | **必须产生**   |
| 8   | `pull-repository.ts`    | `pullSingleRepository`      | `executor.mergeChanges(…, true)`  | 627 | `remote_sync` | **必须产生**   |
| 9   | `cleanup-expired.ts`    | `cleanupExpired`            | `executor.mergeChanges(…, true)`  | 208 | `remote_sync` | **必须产生**   |
| 10  | `materialize-branch.ts` | `switchWithMaterialization` | `adapter.switchBranch`            | 313 | 分支物化      | **不产生**     |
| 11  | `materialize-branch.ts` | `applyMaterializedActions`  | `executor.mergeChanges(…, true)`  | 360 | 分支物化      | **不产生**     |

**核对结论**：#1~#9 符号全部存在、签名未漂移（2026-09-16 整表核对）；#10 是 2026-09-25 补登的一行（metadata-only 接管路径的物化屏障原先没有自报意图，挂载点 1 把整份快照按 `crud` 记成了一批未提交变更）；2026-09-26 接管路径改为自己发起一次 `adapter.switchBranch()`、把屏障放进它的 `prepare`（物化与切 active 同一个事务），#10 随之改登那次切换，屏障里落投影的 `executor.mergeChanges` 另登 #11，只核对了这两行。同一文件里语义不同的两个策略分支（#5 / #6）各占一行，合并成一行会让其中一条策略失去登记。

**登记表跨两个写原语**：#1 / #3 / #4 / #10 走 `switchBranch`，其余走 `mergeChanges`。**只在 `mergeChanges` 上挂门禁会整体漏掉撤销与分支物化面**；接管路径两边各占一行——#10 的声明由挂载点 3 在调 `prepare` 之前同步取走，屏障里每一批 #11 再由挂载点 2 各自取走，两张声明互不相碰。`adapter.transaction` 仍是登记表认得的原语（没声明的 `transaction()` 是普通 CRUD，只在自报了意图时才进本表），但今天一行都没用它。

**`mergeChanges` 那 7 行全部绑在事务执行器上，没有一行绑适配器实例。** 声明存在一个 WeakMap 里，每个作用域只存一条；而工作树的 `interceptMergeChanges()` 是排队拿到事务之后才取声明的。绑适配器实例时两个并发的 `mergeChanges` 会互相覆盖——先执行的取到后声明者的意图，后执行的取不到声明被当作未知入口拒绝。#2 与 #6 原先是适配器级（各自只有一次写，本不需要事务），2026-09-24 改为先开事务再按执行器声明；并发用例在 `packages/rxdb-plugin-history/src/__tests__/trusted-write-concurrency.spec.ts`。`switchBranch` 不在此列：它在调用钩子时**同步**消费声明，声明与取用之间没有排队窗口，因此仍以适配器实例为作用域。#11 在 `prepare` 交出来的那个执行器上逐批声明、逐批当场取用，与 #10 那张适配器级声明不共用作用域。

**静态扫描跑在 `pnpm audit:callsite-drift`（`scripts/audit/working-tree-callsite-drift.mjs`）里**，扫的是整个 `packages/`——11 处声明与 8 处 QueryCache 批量写分散在 rxdb / rxdb-plugin-history / rxdb-plugin-sync / rxdb-plugin-working-tree / rxdb-plugin-querycache 五个包里，只扫单个包的门禁会全绿地什么都看不见。核心包内的 chromium 测试只核对这张表与登记表逐格一致，外加「核心自身零受信写、零批量写」。**静态扫描**必须排除 `dist/`、`out-tsc/`、`**/__tests__/**`、`*.suite.ts`、`*.spec.ts`。写路径必须携带显式意图枚举（内部契约，**不进**公开 api-baseline）；未携带标记的批量重写一律按未知入口拒绝。

## 4. 能力边界（写进公开文档，不假装拦得住）

本门禁只覆盖**经 adapter 的 raw 写路径与 adapter 公开批量写方法**。

- 绕过 adapter 的外部数据库句柄（直接打开同一个 SQLite 文件、另起一个 PGlite 实例、DevTools 里手写 SQL）**拦不住**，v1 也**不承诺**拦得住。
- 启用提交能力的数据库必须在文档中声明：**业务表只能经 RxDB 写入**。
- 这句话进 SC-015 的六项公开文档说明，不是免责声明的注脚。

## 5. 事务与原子性义务

| 义务                                                 | 违反的后果                                       |
| ---------------------------------------------------- | ------------------------------------------------ |
| 工作树条目与业务数据在**同一事务**内写入             | 崩溃后工作树与业务表不一致，冷重放缺项           |
| commit 的四步（节点 / changeSet / CAS / 清空）同事务 | 出现半清空的工作树，违反 SC-007                  |
| 完整事务的全部实体共享**同一个 `unitId`**            | 部分恢复会把一个原子操作劈成两半                 |
| 损坏守卫在**调用方自己的写事务内**执行               | 检查与写入之间出现窗口，守卫形同虚设             |
| `log: false` 加在全部新系统表上                      | 写工作树条目又触发记录，无限递归                 |
| 新表登记进 `SYSTEM_ENTITIES`                         | 新表被按库级 sync 配置送进它们从不参与的同步管道 |

## 6. 加密与编解码义务

- 新表的 `patch` / `inversePatch` **复用** `change-codec.ts` 的同一份编解码；不得写第二份。
- `PropertyType.encrypted === true` 的列跳过 codec（`change-codec.ts:17`），加密 envelope **不被二次包裹、不降级**。
- `CommitCapabilityState.codecVersion` 与 `RXDB_CHANGE_CODEC_VERSION` 不一致时 fail-closed，**不做**降级读取。
