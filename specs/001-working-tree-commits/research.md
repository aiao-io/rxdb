# Phase 0 Research: 本地工作树与提交历史

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-08-15

spec.md 的 Assumptions 段落把 5 项决策显式挂起到计划阶段；本文件逐条冻结它们，并补齐设计过程中新暴露的 10 项。每条给出**决策 / 理由 / 已否决的备选**。所有 `NEEDS CLARIFICATION` 在此清零。

---

## R-001 工作树条目的存储载体

**Decision**: 新建独立表 `rxdb_working_tree_entry`，完整复制补丁与逆补丁，**不**复用既有 `rxdb_change`，也不只存对 `rxdb_change.id` 的外键引用。

**Rationale**: FR-023 要求「任意时刻业务数据能仅凭 HEAD 与工作树条目完整重放」。`rxdb_change` 的行在四种既有路径下会消失或失效：[remove-branch.ts](../../packages/rxdb/src/version/remove-branch.ts) 删分支时级联删除、[compact-changes.ts](../../packages/rxdb/src/version/compact-changes.ts) 压缩合并、`revertChangeId` / `revertChangedAt` 标记回滚、`redoInvalidatedAt` 标记重做失效。任何一条都会让「只引用不复制」的工作树在冷重放时缺项——这正是 FR-023 明令禁止的形态。

**Alternatives rejected**:

- _复用 `rxdb_change` + 加一个 `stagedAt` 列_：最省表，但压缩与删分支会静默吞掉条目，且把「审计历史」与「未提交真相源」两个生命周期不同的概念绑死。
- _只存 `changeId` 外键_：同上，且外键在压缩后指向被合并掉的行。
- _只存计数与 revision_：spec Assumptions 已明确「只存计数与版本号不算满足」。

---

## R-002 提交与变更集的表切分

**Decision**: 拆两张表——`rxdb_commit`（提交元数据，一行一提交）与 `rxdb_commit_change_set`（变更单元，一行一单元，`commitId` 外键 + 事务分组列）。变更单元内容整体复制，不引用 `rxdb_change`。

**Rationale**: 历史列表查询（FR-007）只读元数据表，避免为渲染一屏历史反序列化上万条补丁 JSON；SC-012 的 status/diff p95 ≤ 100 ms 也依赖这一点。变更单元独立成行才能按实体维度建索引以支撑「按实体查询历史」（FR-007）。

**Alternatives rejected**: _单表 + `changes` JSON 列_：写入更简单，但按实体查历史退化为全表 JSON 扫描，且单行体积随提交规模线性膨胀，在 SQLite 上触碰单行大小上限风险。

---

## R-003 HEAD 的唯一真相源与激活分支基数约束

**Decision**:

- 当前分支继续由既有 [`RxDBBranch.activated`](../../packages/rxdb/src/system/branch.ts) 表示；HEAD 从 `rxdb_commit_branch_ref.headCommitId` 派生。**不**新增任何持久化的第二份 HEAD 或第二份「当前分支 id」。
- 「至多一个激活分支」用**部分唯一索引**落成数据库约束：`UNIQUE (activated) WHERE activated = TRUE`。
- 为此扩展 [`EntityIndexMetadataOptions`](../../packages/rxdb/src/entity/metadata-options.interface.ts#L801) 一个窄化、可移植的谓词字段 `where?: { property: string; equals: boolean | null }`，只允许「某布尔列等于某常量」这一种形态。

**Rationale**: 索引列取 `activated` 自身、谓词限定 `activated = TRUE` —— 该索引下所有行的键值恒为 TRUE，唯一性即等价于「至多一行」。这个写法**不需要常量表达式索引**，PostgreSQL 16（PGlite）与 SQLite 3.8+（四个 SQLite 后端）都原生支持，无需任何 per-dialect 特例。谓词形态收窄成 `{property, equals}` 而非任意 SQL 串，保证可静态校验、可跨方言生成，不给注入留口子。

**Alternatives rejected**:

- _`CREATE UNIQUE INDEX ON t ((TRUE)) WHERE activated`_：PG 可用，SQLite **不支持常量表达式索引**，跨后端直接破。
- _加一个可空的 `activationSlot` 列 + 普通 UNIQUE_：所有后端可用，但 `activated ⟺ activationSlot` 的双向一致性无法用现有装饰器表达（无 CHECK 约束支持），退化为代码纪律 —— 与 spec「不引入会漂移的第二份状态」冲突。
- _单行 `RxDBWorkingTreeActivationState` 里存当前分支 id_：直接违反 FR-001 / FR-015 的「不复制第二份标识」。

**Consequence**: 这是对既有系统表索引集的变更，须递增 `RXDB_SYSTEM_SCHEMA_VERSION`（见 R-004）；建索引前若发现多行 `activated = TRUE`，迁移整体失败并返回 `ambiguous_active_branch`（FR-012），不按查询顺序任选一个。

---

## R-004 系统 schema 版本与启用迁移

**Decision**:

- `RXDB_SYSTEM_SCHEMA_VERSION` 由 `3` 递增到 `4`，沿用既有 [`migration.ts`](../../packages/rxdb/src/system/migration.ts) 的 watermark + `rxdb_migration` 占坑机制，占坑冲突继续走 `RxDBMigrationClaimConflictError` 重试。
- 新表的**建表**随 schema 版本 4 一起发生（仅当启用时），**基线生成**是独立的、可重试的幂等步骤，两步在同一迁移事务内。
- 启用是数据库级、单向、显式的，配置项落在 [`RxDBOptions`](../../packages/rxdb/src/rxdb.interface.ts#L83) 上：`commits?: { enabled: boolean }`。缺省 `undefined` ≡ 未启用 ≡ 零新表零行为差异（FR-011、SC-008）。

**Rationale**: 复用既有机制意味着多标签页占坑竞争、失败重试、幂等重启这三条都已由 [`RxDB.ts`](../../packages/rxdb/src/RxDB.ts) 现成路径覆盖并有测试。命名用 `commits` 而非 `workingTree`，因为启用的是**整个提交能力**（提交图是底座，工作树是它的必然伴生）。

**Alternatives rejected**:

- _建表随包升级自动发生，基线懒加载_：违反 SC-008「未启用数据库新增系统表数量为 0」。
- _`enableCommits()` 运行时方法_：启用会写系统表，放在 connect 之后意味着存在「已连接但能力状态未定」的窗口，写入方协商（FR-011）无处落脚。

---

## R-005 revision 的实现与两类校验

**Decision**:

- 所有 revision 是**单调递增整数列**，不是时间戳、不是 UUID、不是哈希。
- **调用方捕获型**（stage / unstage / commit / restore / discard / switchBranch，以及一律校验的 `activationRevision`）落成条件更新：`UPDATE ... SET rev = rev + 1 WHERE id = :id AND rev = :expected`，用 [`RawQueryResult.rowsAffected`](../../packages/rxdb/src/rxdb-adapter.ts#L60) 判定成败，`0` 即冲突，抛携带 expected/actual 的 `CommitConflict`。
- **事务内读改写型**（普通 CRUD、远端实体应用的 `workingTreeRevision`）在**同一事务内**先读后写，不接收调用方的 expected 值，因此在串行化的事务边界内不会因并发失败。
- 语义无操作路径一律**不执行**该 UPDATE（FR-035、SC-007）。

**Rationale**: `rowsAffected` 是全部 6 个后端都已实现的既有能力（`SqliteBackend` / `IRxDBAdapter` 契约的返回值），无需新增跨方言原语。整数列在两种方言下语义完全一致，无时钟依赖。

> ⚠️ 原先钉死该判据的跨后端套件 `rowsAffectedConformanceSuite` 随 writer lease 于 2026-08-16 一并删除（它的断言建在 lease/guard 表上）。本特性依赖的两条语义——**条件 UPDATE 未命中时 `rowsAffected` 必须为 0**、**紧随写语句的 SELECT 不得继承上一条写语句的计数**（sqlite-core 有同类事故记录 SQLC-030）——目前没有跨后端断言保护，US-305 实施时 MUST 以领域 revision CAS 的形式重建这套 conformance。

**Alternatives rejected**:

- _时间戳做 revision_：本地时钟不可信（spec Assumptions 已排除），且同毫秒并发不可分辨。
- _统一成调用方捕获型_：会让普通 CRUD 在多标签页下随机失败，直接违反 FR-032。
- _另立一层写入方级协调协议（lease / epoch）_：FR-008 明令跨实例竞争只由领域版本号条件更新承担；再叠一层协调协议会让「滞后写入方」与「普通并发」两类失败无法区分，且需要一整套持久化状态表与多进程回归套件。

---

## R-006 写入意图枚举与受信登记

**Decision**:

- **两个**适配器级写入口都要携带意图，不止一个：
  - [`TransactionExecutor.mergeChanges`](../../packages/rxdb/src/transaction/transaction-executor.interface.ts#L116) 第三形参由 `disableTriggers?: boolean` 改为 `intent: RxDBWriteIntent`。
  - 既有内部类型 [`SwitchBranchOptions`](../../packages/rxdb/src/rxdb-adapter.ts#L55) 追加必填 `intent: RxDBWriteIntent` 字段（这是**内部适配器契约**的扩展，与 FR-054 要求的公开新类型 `WorkingTreeSwitchBranchOptions` 是两回事，不冲突）。
- `RxDBWriteIntent` 枚举值：`local` / `remoteSync` / `merge` / `undoRedo` / `restore` / `expiredCleanup` / `branchMaterialization` / `baselineMaterialization` / `metadataOnly`。
- 受信登记表 `write-intent.ts` 的键是 **`{ file, symbol, intent }` 三元组**，不含行号。
- 新增静态扫描 `scripts/audit/write-intent-drift.mjs`：解析源码中所有 `mergeChanges(` 与 `switchBranch(` 调用点，与登记表求双向差集；**排除 `dist/`** 与测试文件、区分 `mergeChanges` 的同名重载（本地 `(actions, localChanges?, intent)` 在范围内，远端 `(actions, branchId?, changes?)` 不在）。

**Rationale**: 只挂在 `mergeChanges` 上会漏掉一半入口 —— 实测代码里 **undo/redo 走的是 `adapter.switchBranch`**（[`HistoryManager.ts:1472`](../../packages/rxdb/src/version/HistoryManager.ts#L1472)），**切换分支物化也走 `adapter.switchBranch`**（[`VersionManager.ts:769`](../../packages/rxdb/src/version/VersionManager.ts#L769)）。这两者对工作树的语义正好相反（前者必须产生条目、后者必须不产生），而 `SwitchBranchOptions` 当前**连一个可区分的形参都没有**。同样地，`mergeChanges` 的布尔参数也区分不开：[`merge-branch.ts`](../../packages/rxdb/src/version/merge-branch.ts) 的逐条路径（第 127 行）与 squash 路径（第 151 行）都传 `false`，而 [`cleanup-expired.ts:201`](../../packages/rxdb/src/version/cleanup-expired.ts#L201) 与 [`pull-batch.ts:380`](../../packages/rxdb/src/version/pull-batch.ts#L380) 都传 `true`——按布尔或按函数放行都会把某一类静默吞掉。

`metadataOnly` 是实测新增的第 9 个值：[`HistoryManager.ts:948`](../../packages/rxdb/src/version/HistoryManager.ts#L948) 借用 `switchBranch` 机制只写 `RxDBChange.redoInvalidatedAt`，完全不碰业务实体，必须与真正的数据写入区分开。完整登记见 [contracts/adapter-contract.md §4](./contracts/adapter-contract.md#4-写入口受信登记)（共 11 个受信调用点）。

**Alternatives rejected**:

- _保留 boolean，另设旁路事件表补记_：先写业务数据再补记无法保证同一事务原子（FR-018），崩溃窗口产生半状态。
- _按调用栈自动推断_：不可静态校验，无法支撑 SC-004 的「未登记调用点数量为 0」。
- _以行号为登记键_：任何无关重排都会让门禁误报，实践中必然被放宽成摆设。

---

## R-007 依赖闭包算法

**Decision**: 闭包 = 三个来源的并集，用既有 [`topological-sort.ts`](../../packages/rxdb/src/version/topological-sort.ts) 与 [`dependency-graph.ts`](../../packages/rxdb/src/version/dependency-graph.ts) 做稳定排序：

1. **同实体前序链**：同一实体在 HEAD 之后的所有前置变更单元。
2. **事务成员**：`transactionId` 相同的全部单元整体纳入（v1 粒度 = 实体操作或完整事务）。
3. **关系图与实际行引用**：按 schema 关系元数据 + 条目补丁中出现的真实外键值，父新增 → 子新增、子删除 → 父删除、关系键更新走反向依赖。

stage 正向扩展，unstage 反向移除依赖者。不可拆分的关系环整体纳入为一个原子单元；仍无法形成合法闭包时返回 `index_dependency_cycle`，缓存区零变化。

**Rationale**: 三个来源缺一不可 —— 只按事务会漏掉跨事务的父子新增（spec US3-AC4/AC5），只按关系图会漏掉同实体顺序链。既有拓扑排序已被分支切换与 pull 复用并有测试，直接复用可保证「稳定排序」这一可测断言。

**Alternatives rejected**: _只按事务分组_：US3-AC4 明确要求 T1+T2 跨事务扩展。_让用户手动补依赖_：违反 FR-030「缓存区永远自包含」。

---

## R-008 提交标识与幂等键

**Decision**:

- **普通提交**（`kind = 'normal'`）id 用既有 [`uuid()`](../../packages/rxdb/src/rxdb-utils.ts#L153)（**UUID v7**，时间有序），**不用**内容哈希。
- **系统根节点**（`kind = 'baseline'` / `'branch_baseline'`）id 是**确定性派生**的：由「数据库标识 + 分支标识 + `enableMigrationId` + schema/编解码 manifest」派生。理由是这两类节点由**可重试的迁移与分支物化**创建（FR-013、FR-052），随机 id 会让「重试」与「重复创建」无法区分，也无法让 INV-2「每分支恰好一条基线」在续做路径上收敛。它们不经用户提交入口创建，因此不需要时间有序性。
- 幂等唯一约束键 = `(branchId, branchGeneration, operationId)`。`branchGeneration` 是分支引用上的不可变代次，同名重建分支拿到新代次，因此不与旧幂等键碰撞（FR-009、spec Edge Cases）。
- 相同键 + 相同内容 → 返回原提交、HEAD 不推进；相同键 + 不同内容 → `idempotency_key_reused`，原记录不被覆盖。

**Rationale**: UUID v7 时间有序，既是主键又能当稳定游标，与 FR-007 的「拓扑顺序为主、创建时间为次级排序」天然吻合。内容哈希被否有两个硬理由：加密字段的信封每次加密产生不同密文（nonce 随机），内容哈希不稳定；且内容哈希会让「相同内容不同意图的两次提交」被误判为重试。

确定性根节点 id 与「否决内容哈希」不矛盾：派生输入是**结构性标识**（库/分支/迁移/manifest），不含任何被加密的用户数据，因此不受 nonce 随机性影响。

**Alternatives rejected**: _自增整数_：跨分支/跨库不唯一，且与远端同步的 ID 空间冲突。_内容哈希_：见上。_根节点也用 UUID v7_：迁移重试会产生第二条基线，直接违反 INV-2。

---

## R-009 加密信封复用

**Decision**: 新表中所有承载业务字段值的列（`patch` / `inversePatch` / 快照 JSON）在写入前一律经 [`envelopePlaintextPatches`](../../packages/rxdb-adapter-encrypted/src/encrypt-patch.ts) 处理，与 `rxdb_change` 走**同一条**信封路径；持久化路径上不做「先解密再写新表」。

**Rationale**: 该函数已按 `entity.encryptedPropertyMap` 逐键信封化并有测试覆盖（`encrypted-change-log.spec.ts`），复用它使 FR-055 与 SC-009 的「明文哨兵零命中」有现成的验证手法可直接扩展到 5 个新落盘位置（提交、变更集、工作树条目、缓存区条目、恢复会话）。

**Alternatives rejected**: _为新表写独立加密路径_：重复实现两份密码学代码，是 SC-009 最可能的破口。_新表整列加密（而非按字段信封）_：会让「按实体查历史」的索引全部失效。

---

## R-010 查询缓存实体的排除判定

**Decision**: 判定依据是实体元数据的 `sync.type === SyncType.QueryCache`（见 [`metadata-options.interface.ts`](../../packages/rxdb/src/entity/metadata-options.interface.ts#L1078)）。此类实体完整排除于基线、状态、差异、暂存、提交之外。同一回调事务内检测到查询缓存实体与版本化实体混写时，抛 `mixed_versioned_cache_transaction` 并回滚整个事务。

**Rationale**: `SyncType` 是既有的、声明式的、编译期可见的分类，不需要新增标记。「在检测到的那一刻抛错」而非「事务开始前预知」是必要的——事务回调是用户代码，其未来操作不可预知（FR-021 已明确这一点）。

**Alternatives rejected**: _新增 `@QueryCache()` 装饰器_：与既有 `SyncType.QueryCache` 重复。_事务开始前静态判定_：不可能，回调内容运行时才知道。

---

## R-011 跨后端一致性套件的组织

**Decision**: 两套具名套件放在 `packages/rxdb-test/src/working-tree/`，通过**新增 subpath** `@aiao/rxdb-test/working-tree` 导出，沿用既有 [`@aiao/rxdb-test/transaction`](../../packages/rxdb-test/src/transaction/index.ts) 的 runner 模式：

| 套件                                 | 归属 | 覆盖                                                                        |
| ------------------------------------ | ---- | --------------------------------------------------------------------------- |
| `workingTreeCaptureConformanceSuite` | US2  | 写入口捕获、事务原子性、工作树冷重放                                        |
| `workingTreeCommitConformanceSuite`  | US3  | revision 条件更新、残量 rebase、崩溃恢复，**并吸收 US1 的提交图与迁移断言** |

每个后端在自己的 `src/__tests__/working-tree-conformance.spec.ts` 里调用两个 runner。**不设第三套套件**。

**Rationale**: `@aiao/rxdb-test/transaction` 已经证明这个形态能同时覆盖 PGlite 与 sqlite-core 两处真实实现，且 subpath 导出已进 `scripts/audit/subpath-inventory.mjs` 的审计范围。把 US1 的断言并进 commit 套件而非独立成套，是 epic 的既定口径——避免出现「提交图套件绿、状态机套件绿、但两者交界处没人测」的缝隙。

**Alternatives rejected**: _每个适配器各写一份测试_：6 份漂移，SC-003「任一后端缺席即未完成」无从判定。_三套套件_：epic 已明确否决。

---

## R-012 崩溃恢复与并发的确定性测试手法

**Decision**:

- **崩溃**：在事务回调内的确定性位点抛注入错误 → 断言回滚 → `disconnect()` + 重新 `connect()` → 断言只看到上一次完整一致状态。分页物化的崩溃用「第 N 页后抛错」参数化。
- **并发**：同一进程内对**同一物理库**建两个 RxDB 实例，按确定性顺序交错调用（A 读取 revision → B 提交 → A 提交），断言恰好一个成功。
- 全程**不使用** `setTimeout`、不依赖真实时序、不依赖 BroadcastChannel 送达时机。

**Rationale**: 宪法 II 要求确定性。已知的 Tauri conformance 偶发失败根因之一正是「stdio 迟到事件」这类时序依赖，本特性从测试设计上直接规避。多实例同库在 6 个 v1 后端上都可构造（Electron 侧走多连接，浏览器侧走同 OPFS 文件多连接）。

**Alternatives rejected**: _真杀进程_：只有 Electron/Node 可行，浏览器后端做不到，会让矩阵不齐。_sleep 等广播_：非确定性，宪法禁止。

---

## R-013 benchmark 报告结构与 runnerProfileHash

**Decision**:

- 新增 Nx target `benchmarks:bench-working-tree`（`benchmarks/project.json`），沿用既有 `bench-encryption` / `bench-hot-path` 的 `node --experimental-strip-types <file>.bench.ts` 形态。
- `runnerProfileHash` = 对 `{ nodeVersion, pgliteVersion, os, arch, cpuModel, cpuCores, totalMemoryBytes, runnerId, concurrency }` 归一化后取稳定摘要。
- 报告 JSON 含：p50 / p95、control ratio、fixture 内容摘要与 `fixtureHash`、完整运行环境画像与其 hash。
- 门禁三态：ratio 超阈 → 失败；ratio 达标且 profile 匹配 → 追加绝对 p95 判定；profile 不匹配 → `benchmark_environment_mismatch`（**跳过绝对判据，不放宽为通过**）。
- reference 报告 `benchmarks/reports/working-tree-reference.json` 必须先于候选发布签入；失败后禁止重算基线转绿。

**Rationale**: 既有两个 bench target 已经确立了「node + strip-types + 写 `reports/` JSON」的落地形态，复用它使新 target 无需引入新工具链。三态门禁是 FR-041 与 SC-012 的直接翻译。

**Alternatives rejected**: _把绝对门禁跑在任意 CI runner 上_：共享 runner 的 CPU 争用会让绝对 p95 随机翻倍，门禁变成噪声源。_profile 不匹配时放宽为通过_：spec 明令禁止。

---

## R-014 三框架对称门禁的实现

**Decision**: 新增 `scripts/audit/tri-framework-check.mjs`，比对 `packages/rxdb-{angular,react,vue}/src/index.ts` 的导出名集合与从 `@aiao/rxdb` 透传的共享类型集合；三端不完全一致即失败。行为层的对称由三端等价组件测试 + Playwright 跨框架 E2E（共享 `@aiao/rxdb-test/cross-framework-fixtures` 种子）验证，沿用既有 `search-parity` 的落地形态（[`search-parity.ts`](../../packages/rxdb-test/src/cross-framework-fixtures/search-parity.ts) + 三个 `*-e2e/src/search-parity.spec.ts`）。

**Rationale**: 仓库里已经有一套跑通的跨框架 parity 形态，直接复制它比发明新机制风险低。导出名集合比对是**静态**的，能在 lint 阶段就挡住「只实现了一端」。

**Alternatives rejected**: _只靠 E2E 保证对称_：E2E 只能覆盖被演示页面用到的键，未被 demo 使用的导出会漏。_手工 checklist_：不是门禁。

---

## R-015 bridge tag 前置条件

**Decision**: US1 开工前必须产出一个**新的非迁移 bridge tag** 并更新 [`requirements/migration-release.json`](../../requirements/migration-release.json) 的 `bridge.tag` / `bridge.version`，使 `git merge-base --is-ancestor <bridge-tag> <release-commit>` 成立；`pnpm check-migration-release-gate` 转绿后才允许合入任何系统 schema 迁移。**禁止**重打、移动或伪造已发布标签。

**Rationale**: 当前 `bridge.tag` 与 `bridge.version` 都是 `null`，`release.version` 停在 `0.0.25`，而 `v0.0.25` 的被打标提交在一次 squash 后已不是候选发布提交的祖先。本特性必然递增 `RXDB_SYSTEM_SCHEMA_VERSION`（R-004），门禁会直接挡住 —— 这是**先于 US1 的阻塞项**，不是收尾工作。

**Alternatives rejected**: _把 `enforced` 关掉绕过_：等同于删除门禁。_重打 `v0.0.25`_：改写已发布标签，FR-016 明令禁止。

---

## 结论

15 项决策全部冻结，无 `NEEDS CLARIFICATION` 残留。其中 R-003（部分唯一索引）、R-006（意图枚举）、R-015（bridge tag）三项**改动既有代码或既有发布元数据**，须在对应故事的红测试里先行覆盖；其余 12 项均为新增。
